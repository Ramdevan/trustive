import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { LuX, LuLoader, LuTriangleAlert } from 'react-icons/lu';
import { useWeb3 } from '@/context/Web3Context';
import type { StakeRecord } from './StakingTable';

const STAKING_CONTRACT = process.env.NEXT_PUBLIC_STAKING_CONTRACT || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';

// staticCall against emergencyWithdraw previews the returned amount without
// spending gas, so the penalty (if the contract takes one) is shown up front
const PREVIEW_ABI = [
  'function emergencyWithdraw(uint256 level) external returns (uint256)',
  'function calculateReward(address account, uint256 level) view returns (uint256)',
];

interface EmergencyWithdrawModalProps {
  stake: StakeRecord;
  onClose: () => void;
  onConfirm: () => void;
  processing: boolean;
  status: string;
  isError: boolean;
}

const fmt = (value: string | number, digits = 2) =>
  Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });

const formatRemaining = (ms: number) => {
  if (ms <= 0) return 'Unlocked';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const EmergencyWithdrawModal: React.FC<EmergencyWithdrawModalProps> = ({
  stake, onClose, onConfirm, processing, status, isError,
}) => {
  const { account, signer } = useWeb3();
  const [pendingReward, setPendingReward] = useState<string | null>(null);
  const [estimatedReturn, setEstimatedReturn] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    stake.end_at ? new Date(stake.end_at).getTime() - Date.now() : 0
  );

  // Keep the countdown live so the user sees exactly what they are giving up
  useEffect(() => {
    if (!stake.end_at) return;
    const endsAt = new Date(stake.end_at).getTime();
    const id = setInterval(() => setRemaining(endsAt - Date.now()), 1000);
    return () => clearInterval(id);
  }, [stake.end_at]);

  const loadPreview = useCallback(async () => {
    if (!signer || !account || stake.chain_stake_index == null) return;
    const contract = new ethers.Contract(STAKING_CONTRACT, PREVIEW_ABI, signer);
    const level = stake.chain_stake_index;

    try {
      const raw = await contract.calculateReward(account, level);
      setPendingReward(ethers.formatEther(raw));
    } catch {
      setPendingReward(stake.pending_reward ?? null);
    }

    try {
      const raw = await contract.emergencyWithdraw.staticCall(level);
      setEstimatedReturn(ethers.formatEther(raw));
    } catch {
      // The contract may block the simulation (or the node may not support it);
      // fall back to the recorded principal rather than showing a wrong number
      setPreviewFailed(true);
    }
  }, [signer, account, stake.chain_stake_index, stake.pending_reward]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const principal = Number(stake.amount);
  const returned = estimatedReturn != null ? Number(estimatedReturn) : null;
  const penalty = returned != null && returned < principal ? principal - returned : 0;
  const forfeitedReward = Number(pendingReward ?? stake.pending_reward ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !processing) onClose(); }}
    >
      <div className="w-full max-w-md rounded-3xl bg-card border border-red-500/20 p-6 space-y-6">

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <LuTriangleAlert className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-[1.25rem] font-medium text-[#FAF7F2]">Emergency Withdraw</h2>
              <p className="text-[0.75rem] text-zinc-500">Your stake is still locked</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4 space-y-2">
          <p className="text-[0.875rem] text-red-400 font-medium">
            Withdrawing early forfeits your accumulated rewards.
          </p>
          <p className="text-[0.8rem] text-zinc-400 leading-relaxed">
            The lock period on this stake has not ended. An emergency withdrawal returns your
            tokens immediately, but the rewards accrued so far are lost and any penalty the
            staking contract applies is deducted. This cannot be undone.
          </p>
        </div>

        <div className="rounded-2xl bg-black/40 border border-white/5 divide-y divide-white/5">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[0.8rem] text-zinc-500">Plan</span>
            <span className="text-[0.875rem] font-medium text-[#FAF7F2]">{stake.plan_name}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[0.8rem] text-zinc-500">Staked amount</span>
            <span className="text-[0.875rem] font-medium text-[#FAF7F2]">{fmt(stake.amount)} Trustive</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[0.8rem] text-zinc-500">Time remaining</span>
            <span className="text-[0.875rem] font-medium text-accent">{formatRemaining(remaining)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[0.8rem] text-zinc-500">Reward forfeited</span>
            <span className="text-[0.875rem] font-medium text-red-400">
              {pendingReward == null && !previewFailed ? '—' : `-${fmt(forfeitedReward, 4)} Trustive`}
            </span>
          </div>
          {penalty > 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[0.8rem] text-zinc-500">Early exit penalty</span>
              <span className="text-[0.875rem] font-medium text-red-400">-{fmt(penalty, 4)} Trustive</span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[0.8rem] text-zinc-500">You receive</span>
            <span className="text-[0.9rem] font-bold text-[#FAF7F2]">
              {returned != null ? `${fmt(returned, 4)} Trustive` : `~${fmt(stake.amount)} Trustive`}
            </span>
          </div>
        </div>

        {previewFailed && (
          <p className="text-[0.75rem] text-zinc-500">
            The exact payout could not be simulated. Your wallet will show the final amount before you sign.
          </p>
        )}

        {status && (
          <div className={`px-4 py-3 rounded-xl text-[0.875rem] flex items-start gap-2 ${isError ? 'bg-red-500/10 border border-red-500/20 text-red-500' : 'bg-accent/10 border border-accent/20 text-accent'}`}>
            {processing && !isError && <LuLoader className="h-4 w-4 mt-0.5 flex-shrink-0 animate-spin" />}
            <span>{status}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/5 text-zinc-300 hover:text-white hover:bg-white/10 font-bold text-[0.9rem] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Keep Staking
          </button>
          <button
            onClick={onConfirm}
            disabled={processing}
            className="flex-1 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-[0.9rem] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
          >
            {processing && <LuLoader className="h-4 w-4 animate-spin" />}
            {processing ? 'Processing...' : 'Withdraw Anyway'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyWithdrawModal;
