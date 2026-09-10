import React, { useState, useEffect } from 'react';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';
import { LuX, LuLoader } from 'react-icons/lu';
import { toast } from 'react-hot-toast';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';
import { confirmAction } from '@/utils/confirm';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const TRUSTIVE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TRUSTIVE_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_PPM_TOKEN_ADDRESS || '0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D';
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

const MIN_STAKE = 1000;
const MAX_STAKE = 5000;

const STAKING_ABI = [
  'function stake(uint256 _amount, uint256 _planId) external returns (bool)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

interface Plan {
  id: number;
  name: string;
  duration_seconds: number;
  apy: number;
  min_stake: string;
}

interface StakeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const StakeModal: React.FC<StakeModalProps> = ({ onClose, onSuccess }) => {
  const { account, signer } = useWeb3();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [amount, setAmount] = useState('');
  const [trustiveBalance, setTrustiveBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fetchBalance = async () => {
    if (!account || !signer) return;
    try {
      const provider = signer.provider;
      if (!provider) return;
      const tokenContract = new ethers.Contract(TRUSTIVE_TOKEN_ADDRESS, ERC20_ABI, provider);
      const bal = await tokenContract.balanceOf(account);
      setTrustiveBalance(ethers.formatEther(bal));
    } catch (err) {
      console.error('Balance fetch error:', err);
    }
  };

  // Fetch the first (and only) active plan and balance
  useEffect(() => {
    fetch(`${API_URL}/api/user/staking/plans`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.plans?.length) {
          setPlan(d.plans[0]);
        }
      })
      .catch(err => console.error('Plans fetch error:', err));
    
    fetchBalance();
  }, [account, signer]);

  const handleStake = async () => {
    if (!account || !signer || !plan) return;
    const parsed = parseFloat(amount);
    if (!amount || parsed <= 0) {
      setStatus('Please enter a valid amount'); setIsError(true); return;
    }
    if (parsed < MIN_STAKE) {
      setStatus(`Minimum stake is ${MIN_STAKE.toLocaleString()} Trustive`);
      setIsError(true); return;
    }
    if (parsed > MAX_STAKE) {
      setStatus(`Maximum stake is ${MAX_STAKE.toLocaleString()} Trustive`);
      setIsError(true); return;
    }

    // Balance check
    if (parsed > parseFloat(trustiveBalance)) {
      setStatus('Insufficient tokens');
      setIsError(true);
      return;
    }

    if (!(await confirmAction(`Are you sure you want to stake ${amount} Trustive tokens for this plan?`))) return;

    setLoading(true); setIsError(false); setIsSuccess(false); setStatus('');

    try {
      const amountWei = ethers.parseEther(amount);

      // 1. Approve Trustive spend
      setStatus('Approving Trustive tokens...');
      const tokenContract = new ethers.Contract(TRUSTIVE_TOKEN_ADDRESS, ERC20_ABI, signer);
      const allowance: bigint = await tokenContract.allowance(account, STAKING_CONTRACT);
      if (allowance < amountWei) {
        const approveTx: ethers.TransactionResponse = await tokenContract.approve(STAKING_CONTRACT, amountWei);
        setStatus('Waiting for approval confirmation...');
        await approveTx.wait();
      }

      // 2. Stake — stake(amount, planId). On-chain planId=1 is the only active plan.
      setStatus('Confirm staking in your wallet...');
      const stakingContract = new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, signer);
      const tx: ethers.TransactionResponse = await stakingContract.stake(amountWei, BigInt(1));
      setStatus('Transaction submitted, confirming...');
      await tx.wait();

      // 3. Record on backend — chain_stake_index is the level (always 1)
      setStatus('Recording stake...');
      await fetch(`${API_URL}/api/user/staking/stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_address: account,
          amount,
          plan_id: plan.id,
          duration_seconds: plan.duration_seconds,
          tx_hash: tx.hash,
          chain_stake_index: 1, // level 1 is the only active plan
        }),
      });

      const successMsg = `Successfully staked ${parseFloat(amount).toLocaleString()} Trustive!`;
      setStatus(successMsg);
      setIsSuccess(true);
      setAmount('');
      toast.success(successMsg, { duration: 5000 });
      fetchBalance(); // Refresh balance
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        setStatus('');
        toast.error('Staking cancelled');
        return;
      }
      console.error(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      setIsError(true);
      toast.error(friendlyMsg);
      setStatus(''); // Clear technical status on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-3xl bg-card border border-white/10 p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[1.25rem] font-medium text-[#FAF7F2]">Stake Trustive Tokens</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* Plan info (read-only) */}
        {plan && (
          <div className="rounded-2xl bg-black/40 border border-white/5 p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[0.75rem] text-zinc-500 mb-1">Plan</div>
              <div className="text-[0.9rem] font-bold text-[#FAF7F2]">{plan.name}</div>
            </div>
            <div>
              <div className="text-[0.75rem] text-zinc-500 mb-1">APY</div>
              <div className="text-[0.9rem] font-bold text-accent">{Number(plan.apy).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[0.75rem] text-zinc-500 mb-1">Lock Period</div>
              <div className="text-[0.9rem] font-bold text-[#FAF7F2]">3 min</div>
            </div>
          </div>
        )}

        {/* Amount input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[0.875rem] font-normal text-[#FAF7F2] block">Amount (Trustive)</label>
            <span className="text-[0.75rem] text-zinc-500">
              Balance: <span className="text-zinc-300 font-medium">{parseFloat(trustiveBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} Trustive</span>
            </span>
          </div>
          <input
            type="number"
            placeholder={`${MIN_STAKE.toLocaleString()} – ${MAX_STAKE.toLocaleString()} Trustive`}
            value={amount}
            onChange={e => { setAmount(e.target.value); setIsError(false); setStatus(''); }}
            min={MIN_STAKE}
            max={MAX_STAKE}
            step="any"
            disabled={loading}
            className="w-full bg-[#0A0908] border border-white/10 rounded-2xl px-6 py-4 text-[1.125rem] text-white placeholder:text-zinc-700 focus:outline-none focus:border-accent/40 transition-all disabled:opacity-50"
          />
          <p className="text-[0.75rem] text-zinc-500">
            Min: {MIN_STAKE.toLocaleString()} Trustive &nbsp;·&nbsp; Max: {MAX_STAKE.toLocaleString()} Trustive
          </p>
        </div>

        {/* Progress and success only - failures are raised as a toast */}
        {status && !isError && (
          <div className={`px-4 py-3 rounded-xl text-[0.875rem] flex items-start gap-2 ${isSuccess ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-accent/10 border border-accent/20 text-accent'}`}>
            {loading && <LuLoader className="h-4 w-4 mt-0.5 flex-shrink-0 animate-spin" />}
            <span>{status}</span>
          </div>
        )}

        {/* Stake button */}
        <button
          onClick={handleStake}
          disabled={loading || isSuccess || !plan}
          className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 text-black font-bold text-[1rem] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
        >
          {loading && <LuLoader className="h-5 w-5 animate-spin" />}
          {isSuccess ? 'Staked!' : loading ? 'Processing...' : 'Stake Now'}
        </button>
      </div>
    </div>
  );
};

export default StakeModal;
