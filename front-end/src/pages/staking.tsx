import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { confirmAction } from '@/utils/confirm';

import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import StakingBanner from '@/components/StakingBanner';
import StakingTable from '@/components/StakingTable';
import StakeModal from '@/components/StakeModal';
import EmergencyWithdrawModal from '@/components/EmergencyWithdrawModal';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';
import { LuWallet } from 'react-icons/lu';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';
import type { StakeRecord } from '@/components/StakingTable';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

const STAKING_ABI = [
  'function withdraw(uint256 level) external returns (bool)',
  'function emergencyWithdraw(uint256 level) external returns (uint256)',
  'function calculateReward(address account, uint256 level) view returns (uint256)',
];

export default function Staking() {
  const { account, signer, isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [stakes, setStakes] = useState<StakeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [claimStatus, setClaimStatus] = useState('');
  const [claimingMode, setClaimingMode] = useState<'claim' | 'emergency'>('claim');
  const [emergencyTarget, setEmergencyTarget] = useState<StakeRecord | null>(null);
  const [emergencyStatus, setEmergencyStatus] = useState('');
  const [emergencyError, setEmergencyError] = useState(false);

  const fetchStakes = useCallback(() => {
    if (!account) return;
    setLoading(true);
    fetch(`${API_URL}/api/user/staking/user/${account}`)
      .then(r => r.json())
      .then(d => { if (d.status) setStakes(d.stakes || []); })
      .catch(err => console.error('Staking fetch error:', err))
      .finally(() => setLoading(false));
  }, [account]);

  useEffect(() => { fetchStakes(); }, [fetchStakes]);

  const handleClaim = async (stake: StakeRecord) => {
    if (!signer || !account || stake.chain_stake_index == null) return;
    
    if (!(await confirmAction(`Are you sure you want to withdraw your staked tokens and rewards for this plan?\nStaked: ${parseFloat(stake.amount).toLocaleString()} Trustive`))) return;

    setClaimingId(stake.id);
    setClaimingMode('claim');
    setClaimStatus('');

    try {
      const contract = new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, signer);
      const level = stake.chain_stake_index; // chain_stake_index stores the level

      // Get pending reward before claiming
      let pendingReward = '0';
      try {
        const raw = await contract.calculateReward(account, level);
        pendingReward = ethers.formatEther(raw);
      } catch { /* ignore */ }

      // withdraw(level) returns staked tokens + reward in one call
      setClaimStatus('Confirm withdrawal in your wallet...');
      const tx: ethers.TransactionResponse = await contract.withdraw(level);
      setClaimStatus('Waiting for confirmation...');
      await tx.wait();

      // Record in backend
      await fetch(`${API_URL}/api/user/staking/claim-reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_address: account,
          stake_id: stake.id,
          reward_amount: pendingReward,
          tx_hash: tx.hash,
        }),
      });

      const totalWithdrawn = parseFloat(stake.amount) + parseFloat(pendingReward);
      const successMsg = `Successfully withdrawn! Total: ${totalWithdrawn.toFixed(4)} Trustive (Stake: ${parseFloat(stake.amount).toLocaleString()} + Reward: ${parseFloat(pendingReward).toFixed(4)})`;
      setClaimStatus(successMsg);
      toast.success('Withdrawal successful!', { duration: 5000 });
      setTimeout(() => { setClaimStatus(''); fetchStakes(); }, 5000);
    } catch (err: unknown) {
      // Failures pop up as a toast; the inline banner is only for progress and
      // success, so it is cleared rather than turned red.
      setClaimStatus('');
      if (isUserRejection(err)) {
        // Backing out in the wallet is not a failure.
        toast.error('Withdrawal cancelled');
        return;
      }
      const msg = getFriendlyErrorMessage(err);
      toast.error(msg.length > 140 ? msg.slice(0, 140) + '...' : msg, { duration: 6000 });
    } finally {
      setClaimingId(null);
    }
  };

  // Still inside the lock period: the contract's emergencyWithdraw returns the
  // principal and forfeits the accrued reward, so it is always confirmed first
  const handleEmergencyWithdraw = async (stake: StakeRecord) => {
    if (stake.chain_stake_index == null) return;
    setEmergencyStatus('');
    setEmergencyError(false);
    setEmergencyTarget(stake);
  };

  const confirmEmergencyWithdraw = async () => {
    const stake = emergencyTarget;
    if (!stake || !signer || !account || stake.chain_stake_index == null) return;

    setClaimingId(stake.id);
    setClaimingMode('emergency');
    setEmergencyError(false);

    try {
      const contract = new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, signer);
      const level = stake.chain_stake_index;

      setEmergencyStatus('Confirm the emergency withdrawal in your wallet...');
      const tx: ethers.TransactionResponse = await contract.emergencyWithdraw(level);
      setEmergencyStatus('Waiting for confirmation...');
      await tx.wait();

      // No reward is paid out on an early exit, so it is recorded as 0
      await fetch(`${API_URL}/api/user/staking/unstake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stake_id: stake.id,
          tx_hash: tx.hash,
          reward_amount: '0',
          emergency: true,
        }),
      });

      setEmergencyTarget(null);
      setEmergencyStatus('');
      toast.success(
        `Emergency withdrawal complete. ${parseFloat(stake.amount).toLocaleString()} Trustive released, rewards forfeited.`,
        { duration: 6000 }
      );
      fetchStakes();
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        setEmergencyStatus('');
        setEmergencyError(false);
        toast.error('Emergency withdrawal cancelled');
        return;
      }
      const msg = getFriendlyErrorMessage(err);
      setEmergencyStatus('');
      setEmergencyError(false);
      toast.error(msg.length > 140 ? msg.slice(0, 140) + '...' : msg, { duration: 6000 });
    } finally {
      setClaimingId(null);
    }
  };

  if (isWalletLoading || isReconnecting) {
    return (
      <AuthGuard>
        <Layout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  if (!isConnected) {
    return (
      <AuthGuard>
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <LuWallet className="h-16 w-16 text-zinc-600" />
          <div>
            <h2 className="text-[1.5rem] font-medium text-white mb-2">Connect Your Wallet</h2>
            <p className="text-zinc-500 text-[1rem]">Connect your wallet to view and manage your stakes</p>
          </div>
          <button
            onClick={connectWallet}
            className="bg-accent hover:bg-accent/90 text-black font-bold px-8 py-4 rounded-2xl transition-all cursor-pointer"
          >
            Connect Wallet
          </button>
        </div>
      </Layout>
      </AuthGuard>
    );
  }

  const hasActiveStake = stakes.some(s => s.status === 'active' || s.status === 'completed');

  return (
    <AuthGuard>
    <Layout>
      <div className="flex flex-col gap-8">
        <StakingBanner onStakeClick={() => setShowModal(true)} hasActiveStake={hasActiveStake} />

        {claimStatus && (
          <div className="px-5 py-4 rounded-2xl text-[0.875rem] border bg-accent/10 border-accent/20 text-accent">
            {claimStatus}
          </div>
        )}

        <StakingTable
          stakes={stakes}
          loading={loading}
          onClaim={handleClaim}
          onEmergencyWithdraw={handleEmergencyWithdraw}
          claimingId={claimingId}
          claimingMode={claimingMode}
        />
      </div>

      {showModal && (
        <StakeModal
          onClose={() => setShowModal(false)}
          onSuccess={fetchStakes}
        />
      )}

      {emergencyTarget && (
        <EmergencyWithdrawModal
          stake={emergencyTarget}
          onClose={() => { setEmergencyTarget(null); setEmergencyStatus(''); setEmergencyError(false); }}
          onConfirm={confirmEmergencyWithdraw}
          processing={claimingId === emergencyTarget.id}
          status={emergencyStatus}
          isError={emergencyError}
        />
      )}
    </Layout>
    </AuthGuard>
  );
}
