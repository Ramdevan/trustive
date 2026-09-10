import React, { useMemo, useState } from 'react';
import { LuX, LuLoader, LuExternalLink } from 'react-icons/lu';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import { useWeb3 } from '@/context/Web3Context';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';
import { confirmAction } from '@/utils/confirm';
import { formatVestId, PERIOD_SECONDS } from '@/utils/vesting';
import type { VestingRecord } from '@/utils/vesting';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
// Both names are read: the deployed .env.local uses the _ADDRESS suffix, which
// silently did nothing while only the shorter name was checked.
const VESTING_CONTRACT = process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS
  || process.env.NEXT_PUBLIC_VESTING_CONTRACT
  || '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';
const VESTING_ABI = [
  'function claim(uint256 index) external',
  'function claimPeriods(uint256 index, uint256 periods) external',
];

interface VestingDetailModalProps {
  vesting: VestingRecord;
  onClose: () => void;
  onClaimed?: () => void;
}

interface PeriodRow {
  period: number;
  amount: number;
  unlockSeconds: number;
  unlockAt: Date;
  state: 'claimed' | 'claimable' | 'locked';
  txHash?: string;
}

const shortenHash = (hash?: string) => (hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '—');

const formatDateTime = (date: Date) => {
  try {
    return date.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return '—'; }
};

const VestingDetailModal: React.FC<VestingDetailModalProps> = ({ vesting, onClose, onClaimed }) => {
  const { account, signer } = useWeb3();
  // Which period is being claimed, so only that row spins — a shared boolean
  // put the spinner on every claimable row at once.
  const [claimingPeriod, setClaimingPeriod] = useState<number | 'all' | null>(null);

  const totalAmount = Number(vesting.details?.totalAmount ?? vesting.total_amount) || 0;
  const claimedAmount = Number(vesting.details?.claimedAmount ?? 0) || 0;
  const cliffPeriods = Number(vesting.details?.cliffMonths ?? vesting.cliff_months) || 0;
  const vestPeriods = Number(vesting.details?.vestingMonths ?? vesting.vesting_months) || 0;

  // The contract tracks released periods directly; only fall back to deriving
  // it from the claimed total if that call did not come through.
  const claimedPeriods = vesting.details?.claimedPeriods != null
    ? Number(vesting.details.claimedPeriods)
    : (totalAmount > 0 && vestPeriods > 0
      ? Math.min(vestPeriods, Math.round(claimedAmount / (totalAmount / vestPeriods)))
      : 0);

  const rows: PeriodRow[] = useMemo(() => {
    if (vestPeriods <= 0) return [];
    const startMs = new Date(vesting.start_at).getTime();
    const perPeriod = totalAmount / vestPeriods;
    const claimMap = new Map((vesting.claims || []).map(c => [Number(c.period_index), c.tx_hash]));
    const now = Date.now();

    return Array.from({ length: vestPeriods }, (_, i) => {
      const period = i + 1;
      const unlockSeconds = (cliffPeriods + period) * PERIOD_SECONDS;
      const unlockAt = new Date(startMs + unlockSeconds * 1000);
      const state: PeriodRow['state'] =
        period <= claimedPeriods ? 'claimed' : unlockAt.getTime() <= now ? 'claimable' : 'locked';
      return { period, amount: perPeriod, unlockSeconds, unlockAt, state, txHash: claimMap.get(period) };
    });
  }, [vesting, totalAmount, claimedAmount, cliffPeriods, vestPeriods, claimedPeriods]);

  const unlockedRows = rows.filter(r => r.state === 'claimable');
  const unlockedTotal = unlockedRows.reduce((sum, r) => sum + r.amount, 0);

  // One path for both buttons: the only difference is which contract call goes
  // out — claimPeriods for a chosen number of periods, claim for the lot.
  const submitClaim = async (
    key: number | 'all',
    amount: number,
    send: (contract: ethers.Contract) => Promise<ethers.TransactionResponse>
  ) => {
    if (!signer) { toast.error('Please connect your wallet'); return; }

    setClaimingPeriod(key);
    try {
      const contract = new ethers.Contract(VESTING_CONTRACT, VESTING_ABI, signer);
      const tx = await send(contract);
      await tx.wait();

      await fetch(`${API_URL}/api/user/vesting/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiary: account,
          vesting_index: vesting.vesting_index ?? 0,
          tx_hash: tx.hash,
          amount: amount.toString(),
        }),
      }).catch(err => console.error('Claim record error:', err));

      toast.success(`Successfully claimed ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive!`, { duration: 5000 });
      // Stay open on the refreshed schedule so the next period can be claimed
      if (onClaimed) onClaimed();
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        toast.error('Claim cancelled');
        return;
      }
      console.error('Vesting claim error:', err);
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setClaimingPeriod(null);
    }
  };

  const handleClaim = async (row: PeriodRow) => {
    // Periods release oldest-first, so claiming row N covers everything from the
    // last claimed period up to N — usually just that one row.
    const periodsToClaim = row.period - claimedPeriods;
    if (periodsToClaim <= 0) return;

    const claimTotal = rows
      .filter(r => r.period > claimedPeriods && r.period <= row.period)
      .reduce((sum, r) => sum + r.amount, 0);

    const message = periodsToClaim > 1
      ? `Claim periods ${claimedPeriods + 1}–${row.period} (${claimTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive)?`
      : `Claim ${row.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive for period ${row.period}?`;
    if (!(await confirmAction(message))) return;

    await submitClaim(row.period, claimTotal, contract =>
      contract.claimPeriods(vesting.vesting_index ?? 0, periodsToClaim));
  };

  const handleClaimAll = async () => {
    if (unlockedRows.length === 0) return;

    const message = `Claim all ${unlockedRows.length} unlocked period${unlockedRows.length > 1 ? 's' : ''} (${unlockedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive) for ${formatVestId(vesting)}?`;
    if (!(await confirmAction(message))) return;

    // claim() releases every unlocked period of this schedule in one transaction
    await submitClaim('all', unlockedTotal, contract =>
      contract.claim(vesting.vesting_index ?? 0));
  };

  const statusLabel = (() => {
    switch (vesting.display_status) {
      case 'claimed': return 'Completed';
      case 'claimable': return 'Claimable';
      case 'revoked': return 'Revoked';
      case 'pending': return 'Pending';
      default: return 'In-Progress';
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-white/10 p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[1.25rem] font-medium text-[#FAF7F2]">Vesting Details</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-2xl bg-black/40 border border-white/5 p-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Vest ID</div>
            <div className="text-[0.95rem] font-bold text-[#FAF7F2]">{formatVestId(vesting)}</div>
          </div>
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Status</div>
            <div className="text-[0.95rem] font-bold text-accent">{statusLabel}</div>
          </div>
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Allocated Token</div>
            <div className="text-[0.95rem] font-bold text-[#E5A93E]">
              {totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive
            </div>
          </div>
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Cliff</div>
            <div className="text-[0.95rem] font-bold text-[#FAF7F2]">{cliffPeriods}</div>
          </div>
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Vest Period</div>
            <div className="text-[0.95rem] font-bold text-[#FAF7F2]">{vestPeriods}</div>
          </div>
          <div>
            <div className="text-[0.75rem] text-zinc-500 uppercase tracking-wider mb-1">Claimed</div>
            <div className="text-[0.95rem] font-bold text-[#10B981]">
              {claimedAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive
            </div>
          </div>
        </div>

        {/* Claim everything unlocked on this schedule in one transaction */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-[0.75rem] text-zinc-500">
            {unlockedRows.length > 0
              ? `${unlockedRows.length} period${unlockedRows.length > 1 ? 's' : ''} unlocked · ${unlockedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive available`
              : claimedPeriods >= vestPeriods && vestPeriods > 0
                ? 'All periods claimed'
                : 'Nothing unlocked yet'}
          </span>
          <button
            onClick={handleClaimAll}
            disabled={claimingPeriod !== null || unlockedRows.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-black text-[0.8rem] font-bold transition-all shadow-lg shadow-accent/10 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {claimingPeriod === 'all' && <LuLoader className="h-4 w-4 animate-spin" />}
            {claimingPeriod === 'all' ? 'Claiming All' : 'Claim All'}
          </button>
        </div>

        {/* Period breakdown */}
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full text-left border-collapse min-w-[40rem]">
            <thead>
              <tr className="text-[#FAF7F2] text-[0.8rem] font-medium border-b border-white/5 bg-black/30 align-middle whitespace-nowrap">
                <th className="px-5 py-4 w-[10%] min-w-[4rem]">S.No</th>
                <th className="px-5 py-4 w-[22%] min-w-[9rem]">Claimable Token</th>
                <th className="px-5 py-4 w-[26%] min-w-[10rem]">Cliff Period</th>
                <th className="px-5 py-4 w-[20%] min-w-[7rem]">Action</th>
                <th className="px-5 py-4 w-[22%] min-w-[8rem]">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="text-[0.8rem] font-medium text-[#94A3B8]">
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">No vesting periods found</td></tr>
              ) : rows.map(row => (
                <tr key={row.period} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4 align-middle whitespace-nowrap text-[#FAF7F2]">{row.period}</td>
                  <td className="px-5 py-4 align-middle whitespace-nowrap text-[#10B981]">
                    {row.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} Trustive
                  </td>
                  <td className="px-5 py-4 align-middle whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-[#FAF7F2]">{row.unlockSeconds}s</span>
                      <span className="text-[0.65rem] text-zinc-500">{formatDateTime(row.unlockAt)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-middle whitespace-nowrap">
                    {row.state === 'claimed' ? (
                      <span className="inline-flex items-center justify-center w-[5.5rem] px-3 py-1.5 rounded-full text-[0.7rem] font-bold bg-[#6366f11A] text-[#6366f1]">
                        Claimed
                      </span>
                    ) : row.state === 'claimable' ? (
                      <button
                        onClick={() => handleClaim(row)}
                        disabled={claimingPeriod !== null}
                        className="inline-flex items-center justify-center gap-1.5 w-[5.5rem] px-4 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-black text-[0.7rem] font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {claimingPeriod === row.period && <LuLoader className="h-3 w-3 animate-spin" />}
                        {claimingPeriod === row.period ? 'Claiming' : 'Claim'}
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center w-[5.5rem] px-3 py-1.5 rounded-full text-[0.7rem] font-bold bg-white/5 text-zinc-500">
                        Locked
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 align-middle whitespace-nowrap font-mono">
                    {row.txHash && row.txHash.startsWith('0x') && row.txHash.length >= 64 ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${row.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        {shortenHash(row.txHash)}
                        <LuExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span
                        className="text-zinc-600"
                        title={row.state === 'claimed'
                          ? 'This claim predates transaction recording, or its receipt could not be recovered from the chain'
                          : 'Not claimed yet'}
                      >
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[0.7rem] text-zinc-500">
          Periods unlock in order, so claiming a later row also releases the unclaimed ones before it. Claim All takes every unlocked period in one transaction.
        </p>
      </div>
    </div>
  );
};

export default VestingDetailModal;
