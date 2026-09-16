import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import CopyButton from '@/components/CopyButton';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import {
  LuGift,
  LuUsers,
  LuCoins,
  LuCheck,
  LuExternalLink,
  LuShare2,
  LuLoader,
  LuWallet,
  LuSparkles,
  LuCopy,
  LuArrowUpRight,
  LuClock
} from 'react-icons/lu';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const BSC_SCAN_BASE = 'https://testnet.bscscan.com';

const REFERRAL_CLAIM_ABI = [
  'function claim(uint256 amount, address to, (uint8 v, bytes32 r, bytes32 s, uint256 nonce) sig) external',
  'function usedNonce(uint256) view returns (bool)',
  'function tokenAddress() view returns (address)'
];

interface ReferredUser {
  id: number;
  name: string;
  email: string;
  wallet_address?: string;
  created_at: string;
  total_purchased: string;
  bonus_generated: string;
}

interface ClaimRecord {
  id: number;
  amount: string;
  nonce: string;
  tx_hash: string;
  status: string;
  created_at: string;
}

interface ReferralStats {
  referral_code: string | null;
  referral_link: string;
  commission_rate: number;
  total_referred_users: number;
  total_earned: string;
  total_claimed: string;
  claimable_balance: string;
  token_symbol: string;
  referral_contract: string;
  wallet_address: string | null;
  referred_users: ReferredUser[];
  claims_history: ClaimRecord[];
}

export default function ReferralPage() {
  const { account, signer, isConnected, isCorrectChain, switchToCorrectChain, connectWallet } = useWeb3();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'history'>('friends');

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('user_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let url = `${API_URL}/api/user/referral/stats`;
      if (account) {
        url += `?address=${encodeURIComponent(account)}`;
      }

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.status && data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch referral stats:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(true), 25000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleClaim = async () => {
    if (!isConnected || !account || !signer) {
      toast.error('Please connect your Web3 wallet first.');
      connectWallet();
      return;
    }

    if (!isCorrectChain) {
      toast.error('Please switch to BSC Testnet network.');
      switchToCorrectChain();
      return;
    }

    if (!stats || parseFloat(stats.claimable_balance || '0') <= 0) {
      toast.error('No claimable referral rewards available.');
      return;
    }

    setClaiming(true);
    const toastId = toast.loading('Requesting claim signature from server...');

    try {
      const token = localStorage.getItem('user_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Request signature from backend
      const signRes = await fetch(`${API_URL}/api/user/referral/create-claim-sign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ caller: account, to: account })
      });

      const signData = await signRes.json();
      if (!signData.status) {
        throw new Error(signData.msg || 'Failed to obtain claim signature');
      }

      toast.loading('Please confirm claim transaction in your wallet...', { id: toastId });

      const { referralContract, amount, displayAmount, nonce, signature } = signData.data;

      // 2. Execute on-chain claim
      const contract = new ethers.Contract(referralContract, REFERRAL_CLAIM_ABI, signer);
      const tx = await contract.claim(
        amount,
        account,
        {
          v: signature.v,
          r: signature.r,
          s: signature.s,
          nonce: signature.nonce
        }
      );

      toast.loading(`Transaction submitted: ${tx.hash.slice(0, 8)}... Confirming...`, { id: toastId });
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        throw new Error('On-chain claim transaction failed.');
      }

      // 3. Record confirmed claim on backend
      await fetch(`${API_URL}/api/user/referral/record-claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          txHash: tx.hash,
          amount: displayAmount,
          nonce: nonce,
          walletAddress: account
        })
      });

      toast.success(`Successfully claimed ${displayAmount} ${stats.token_symbol || 'TRSIV'}!`, { id: toastId });
      fetchStats(true);
    } catch (err: any) {
      console.error('Claim error:', err);
      const userMsg = err.reason || err.data?.message || err.message || 'Claim transaction failed.';
      toast.error(userMsg, { id: toastId });
    } finally {
      setClaiming(false);
    }
  };

  const handleShareTwitter = () => {
    if (!stats?.referral_link) return;
    const text = encodeURIComponent(
      `Join me on Trustive ICO and participate in the future of web3! Use my invite link to get started: ${stats.referral_link}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const handleShareTelegram = () => {
    if (!stats?.referral_link) return;
    const text = encodeURIComponent(`Participate in Trustive ICO with my referral link: ${stats.referral_link}`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(stats.referral_link)}&text=${text}`, '_blank');
  };

  const shortenAddress = (addr?: string | null) => {
    if (!addr) return '—';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const maskEmail = (email?: string) => {
    if (!email) return '—';
    const parts = email.split('@');
    if (parts.length < 2) return email;
    const name = parts[0];
    const maskedName = name.length <= 2 ? name + '***' : `${name.slice(0, 2)}***${name.slice(-1)}`;
    return `${maskedName}@${parts[1]}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  };

  return (
    <AuthGuard>
      <Layout>
        <Head>
          <title>Referral Program | Trustive</title>
          <meta name="description" content="Invite friends to Trustive and earn 5% referral commission in TRSIV tokens." />
        </Head>

        <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-12">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                  <LuGift className="h-6 w-6" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Referral Rewards</h1>
              </div>
              <p className="text-zinc-400 text-sm mt-1">
                Share your referral link, invite friends, and earn instant {stats?.commission_rate ?? 5}% rewards in TRSIV tokens on every token purchase.
              </p>
            </div>

            {/* Network / Contract Status Badge */}
            <div className="flex items-center gap-2">
              <a
                href={`${BSC_SCAN_BASE}/address/${stats?.referral_contract || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935'}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
              >
                <span>Contract: {shortenAddress(stats?.referral_contract || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935')}</span>
                <LuExternalLink className="h-3 w-3 text-zinc-500" />
              </a>
            </div>
          </div>

          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Commission Rate */}
            <div className="flex flex-col justify-between rounded-2xl bg-card p-6 border border-white/5 hover:border-accent/20 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Commission Rate</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Level 1 Direct
                </span>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white tracking-tight">
                  {stats ? `${stats.commission_rate}%` : '5%'}
                </div>
                <p className="text-xs text-zinc-500 mt-1">Of every TRSIV bought by referrals</p>
              </div>
            </div>

            {/* Total Referred Users */}
            <div className="flex flex-col justify-between rounded-2xl bg-card p-6 border border-white/5 hover:border-accent/20 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Referred Friends</span>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <LuUsers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-white tracking-tight">
                  {stats?.total_referred_users ?? 0}
                </div>
                <p className="text-xs text-zinc-500 mt-1">Registered with your invite link</p>
              </div>
            </div>

            {/* Total Earned */}
            <div className="flex flex-col justify-between rounded-2xl bg-card p-6 border border-white/5 hover:border-accent/20 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Earned</span>
                <div className="p-2 rounded-lg bg-accent/10 text-accent">
                  <LuCoins className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-[#FAF7F2] tracking-tight">
                  {stats ? parseFloat(stats.total_earned).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00'}
                </div>
                <p className="text-xs text-[#E5A93E] font-medium mt-1 uppercase tracking-wider">
                  {stats?.token_symbol || 'TRSIV'} Lifetime
                </p>
              </div>
            </div>

            {/* Claimable Balance & Button */}
            <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-card via-card to-accent/5 p-6 border border-accent/20 hover:border-accent/40 transition-all relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center gap-1">
                  <LuSparkles className="h-3.5 w-3.5" /> Claimable Rewards
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  On-Chain
                </span>
              </div>
              <div className="mt-2">
                <div className="text-3xl font-bold text-white tracking-tight">
                  {stats ? parseFloat(stats.claimable_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00'}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {stats?.token_symbol || 'TRSIV'} available now
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming || !stats || parseFloat(stats.claimable_balance || '0') <= 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-accent hover:bg-accent/90 text-black transition-all shadow-lg shadow-accent/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {claiming ? (
                    <>
                      <LuLoader className="h-4 w-4 animate-spin" />
                      <span>Claiming...</span>
                    </>
                  ) : (
                    <>
                      <LuCoins className="h-4 w-4" />
                      <span>Claim to Wallet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Referral Link & Share Banner */}
          <div className="rounded-3xl bg-gradient-to-r from-[#141210] via-card to-[#141210] border border-white/10 p-6 md:p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold">
                  <LuSparkles className="h-3.5 w-3.5" />
                  <span>Instant 5% Commission Pool</span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  Your Personal Invitation Link
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Anyone who signs up using this link or code is automatically bound to your account. You will receive {stats?.commission_rate ?? 5}% of their TRSIV purchase amount directly into your claimable rewards balance.
                </p>
              </div>

              <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Code badge */}
                <div className="flex items-center justify-between sm:justify-start gap-2 px-4 py-3 rounded-2xl bg-black/50 border border-white/10">
                  <span className="text-xs text-zinc-500 font-medium">CODE:</span>
                  <span className="font-mono text-sm font-bold text-accent tracking-wider">
                    {stats?.referral_code || '------'}
                  </span>
                  <CopyButton
                    text={stats?.referral_code || ''}
                    label="Copy referral code"
                    successMessage="Referral code copied!"
                    className="ml-1"
                  />
                </div>

                {/* Full Link Input with 1-click copy */}
                <div className="flex items-center gap-2 flex-1 sm:w-80 px-4 py-2 rounded-2xl bg-black/50 border border-white/10">
                  <input
                    type="text"
                    readOnly
                    value={stats?.referral_link || ''}
                    placeholder="Generating referral link..."
                    className="bg-transparent text-xs text-zinc-300 font-mono focus:outline-none w-full truncate"
                  />
                  <CopyButton
                    text={stats?.referral_link || ''}
                    label="Copy invite link"
                    successMessage="Referral link copied!"
                    className="shrink-0"
                  />
                </div>

                {/* Social Share Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleShareTwitter}
                    disabled={!stats?.referral_link}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40"
                    title="Share on X (Twitter)"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareTelegram}
                    disabled={!stats?.referral_link}
                    className="p-3 rounded-2xl bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 text-[#229ED9] transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40"
                    title="Share on Telegram"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tables Section with Tabs */}
          <div className="rounded-3xl bg-card border border-white/5 overflow-hidden">
            {/* Tab Controls */}
            <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'friends'
                    ? 'bg-accent text-black shadow-lg shadow-accent/10'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <LuUsers className="h-4 w-4" />
                <span>Referred Friends ({stats?.referred_users?.length ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-accent text-black shadow-lg shadow-accent/10'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <LuClock className="h-4 w-4" />
                <span>Claim History ({stats?.claims_history?.length ?? 0})</span>
              </button>
            </div>

            {/* Tab Content: Referred Friends */}
            {activeTab === 'friends' && (
              <div className="overflow-x-auto">
                {stats?.referred_users && stats.referred_users.length > 0 ? (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-semibold bg-white/[0.01]">
                        <th className="py-4 px-6">User / Friend</th>
                        <th className="py-4 px-6">Wallet Address</th>
                        <th className="py-4 px-6">Date Joined</th>
                        <th className="py-4 px-6 text-right">Tokens Purchased</th>
                        <th className="py-4 px-6 text-right">Bonus Earned ({stats.commission_rate}%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-zinc-300">
                      {stats.referred_users.map((u) => (
                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-medium text-white">{u.name || 'Anonymous User'}</div>
                            <div className="text-xs text-zinc-500">{maskEmail(u.email)}</div>
                          </td>
                          <td className="py-4 px-6 font-mono text-xs text-zinc-400">
                            {u.wallet_address ? (
                              <div className="flex items-center gap-1.5">
                                <span>{shortenAddress(u.wallet_address)}</span>
                                <CopyButton text={u.wallet_address} />
                              </div>
                            ) : (
                              <span className="text-zinc-600 italic">Not connected</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-zinc-400 text-xs">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="py-4 px-6 text-right font-medium text-white">
                            {parseFloat(u.total_purchased || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })} {stats.token_symbol}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-emerald-400">
                            +{parseFloat(u.bonus_generated || '0').toLocaleString('en-US', { minimumFractionDigits: 4 })} {stats.token_symbol}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="p-4 rounded-full bg-white/5 border border-white/10 text-zinc-500 mb-3">
                      <LuUsers className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">No Friends Referred Yet</h3>
                    <p className="text-sm text-zinc-500 max-w-md mt-1">
                      Share your personal invitation link above with friends or on social media to start earning TRSIV bonus rewards.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab Content: Claim History */}
            {activeTab === 'history' && (
              <div className="overflow-x-auto">
                {stats?.claims_history && stats.claims_history.length > 0 ? (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-semibold bg-white/[0.01]">
                        <th className="py-4 px-6">Claim Date</th>
                        <th className="py-4 px-6">Claimed Amount</th>
                        <th className="py-4 px-6">Transaction Hash</th>
                        <th className="py-4 px-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-zinc-300">
                      {stats.claims_history.map((c) => (
                        <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-6 text-xs text-zinc-400">
                            {formatDate(c.created_at)}
                          </td>
                          <td className="py-4 px-6 font-bold text-accent">
                            {parseFloat(c.amount || '0').toLocaleString('en-US', { minimumFractionDigits: 4 })} {stats.token_symbol}
                          </td>
                          <td className="py-4 px-6 font-mono text-xs text-zinc-400">
                            <a
                              href={`${BSC_SCAN_BASE}/tx/${c.tx_hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 hover:text-white transition-colors group"
                            >
                              <span>{shortenAddress(c.tx_hash)}</span>
                              <LuArrowUpRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-accent transition-colors" />
                            </a>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <LuCheck className="h-3 w-3" />
                              <span>Confirmed</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="p-4 rounded-full bg-white/5 border border-white/10 text-zinc-500 mb-3">
                      <LuClock className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">No Claim History</h3>
                    <p className="text-sm text-zinc-500 max-w-md mt-1">
                      When your claimable balance is above 0, click &quot;Claim to Wallet&quot; to transfer your rewards on-chain.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}
