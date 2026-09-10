import { useEffect, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuLockOpen, LuTriangleAlert } from 'react-icons/lu';
import SearchBar from './SearchBar';
import { getStakeAction } from '@/utils/stakeAction';

export interface StakeRecord {
  id: number;
  plan_name: string;
  stake_tx_hash: string;
  unstake_tx_hash?: string | null;
  is_emergency?: number | boolean;
  apy: number;
  amount: string;
  end_at: string | null;
  status: 'active' | 'completed' | 'unstaked';
  reward_claimed: string;
  pending_reward?: string;
  chain_stake_index: number | null;
}

interface StakingTableProps {
  stakes: StakeRecord[];
  loading: boolean;
  onClaim?: (stake: StakeRecord) => void;
  onEmergencyWithdraw?: (stake: StakeRecord) => void;
  claimingId?: number | null;
  /** Which action the row in `claimingId` is currently running */
  claimingMode?: 'claim' | 'emergency';
}

const PAGE_SIZE = 5;

const shortenHash = (hash?: string) => {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'No Expiry';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  } catch { return '—'; }
};

const formatRemaining = (ms: number) => {
  if (ms <= 0) return 'Unlocked';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${sec}s left`;
  return `${sec}s left`;
};

// The plan pays its reward percent on the principal over the full lock term
// (AdminController stores rewardPercent as "8 = 8%"), so this is what this one
// stake earns when it is held to the end. Deliberately not read from
// reward_claimed: that column was fed by calculateReward, which the contract
// keeps per (user, level) rather than per stake, so historic rows carry the
// sum of every earlier withdrawal as well as their own.
const stakeReward = (stake: StakeRecord) => {
  const amount = Number(stake.amount);
  const apy = Number(stake.apy ?? 0);
  if (!Number.isFinite(amount) || !Number.isFinite(apy)) return 0;
  return (amount * apy) / 100;
};

const formatTrustive = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} Trustive`;

const isRealHash = (hash?: string | null): hash is string =>
  Boolean(hash) && !hash!.startsWith('sync-') && !hash!.startsWith('chain-sync-');

const TxLink: React.FC<{ hash?: string | null; fallbackIndex?: number | null }> = ({ hash, fallbackIndex }) => (
  isRealHash(hash) ? (
    <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="text-[#212E73] font-semibold hover:underline" title={hash}>
      {shortenHash(hash)}
    </a>
  ) : fallbackIndex !== undefined ? (
    <span title="Synced from chain" className="text-zinc-700">#{fallbackIndex ?? '—'}</span>
  ) : (
    <span className="text-zinc-400">—</span>
  )
);

const StakingTable: React.FC<StakingTableProps> = ({ stakes, loading, onClaim, onEmergencyWithdraw, claimingId, claimingMode = 'claim' }) => {
  const [activeTab, setActiveTab] = useState<'Active' | 'Withdrawn'>('Active');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  // Ticks every second so a row flips from Emergency Withdraw to Claim on its
  // own the moment the lock period ends, without a page refresh
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = stakes.filter(s => {
    // 1. Filter by hash if search query exists - a withdrawn stake carries two
    //    hashes, so either one should find the row
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches = s.stake_tx_hash?.toLowerCase().includes(q) || s.unstake_tx_hash?.toLowerCase().includes(q);
      if (!matches) return false;
    }

    // A stake whose lock has expired is still the user's money until it is
    // withdrawn, so it stays under Active (as claimable) instead of disappearing
    const isWithdrawn = s.status === 'unstaked';

    return activeTab === 'Active' ? !isWithdrawn : isWithdrawn;
  });
  // Nothing can be done to a withdrawn stake, so that tab drops the column
  const showAction = activeTab === 'Active';
  const columnCount = showAction ? 9 : 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h2 className="text-[1.25rem] font-medium text-zinc-900">Staking Transaction</h2>
          <div className="flex bg-zinc-100 p-1.5 rounded-xl border border-zinc-200">
            {(['Active', 'Withdrawn'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
                className={`px-6 py-2 rounded-lg text-[0.875rem] font-bold transition-all cursor-pointer ${activeTab === tab ? 'bg-[#212E73] text-white shadow-md' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <SearchBar
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); setPage(1); }}
          className="max-w-md w-full"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <table className="w-full text-left border-collapse min-w-[64rem]">
          <thead>
            <tr className="text-zinc-500 text-[0.85rem] font-semibold bg-zinc-50/80 border-b border-zinc-200 align-middle whitespace-nowrap">
              <th className="px-6 py-4 min-w-[5rem]">S No</th>
              <th className="px-6 py-4 min-w-[8rem]">Plan</th>
              <th className="px-6 py-4 min-w-[6rem]">APY</th>
              <th className="px-6 py-4 min-w-[10rem]">Staked Token</th>
              <th className="px-6 py-4 min-w-[10rem]">Ends on</th>
              <th className="px-6 py-4 min-w-[11rem]">Reward</th>
              <th className="px-6 py-4 min-w-[8rem]">Status</th>
              <th className="px-6 py-4 min-w-[15rem]">Transaction Hash</th>
              {showAction && <th className="px-6 py-4 min-w-[13rem]">Action</th>}
            </tr>
          </thead>
          <tbody className="text-[0.875rem] font-medium text-zinc-600">
            {loading ? (
              <tr><td colSpan={columnCount} className="px-6 py-12 text-center text-zinc-500">Loading stakes...</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-6 py-12 text-center text-zinc-500">No {activeTab.toLowerCase()} stakes found</td></tr>
            ) : paginated.map((s, index) => {
              const isBusy = claimingId === s.id;
              const isOpen = s.status !== 'unstaked';
              const isEmergency = Boolean(Number(s.is_emergency));
              const action = getStakeAction(s, now);
              const { lockExpired, endsAt } = action;
              const canClaim = action.kind === 'claim' && action.enabled;
              const canEmergencyWithdraw = action.kind === 'emergency' && action.enabled;
              return (
                <tr key={s.id} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-4 align-middle whitespace-nowrap text-zinc-800">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap font-bold text-zinc-900">{s.plan_name}</td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap text-[#212E73] font-bold">{Number(s.apy || 8).toFixed(0)}%</td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap text-zinc-900 font-semibold">
                    {Number(s.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} Trustive
                  </td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap text-zinc-500">{formatDate(s.end_at)}</td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap">
                    {s.status !== 'unstaked' ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-emerald-700 text-[0.875rem] font-bold">+{formatTrustive(stakeReward(s))}</span>
                        <span className="text-[0.7rem] text-zinc-400">
                          {lockExpired ? 'Ready to claim' : 'Expected at maturity'}
                        </span>
                      </div>
                    ) : (
                      isEmergency ? (
                        <span className="text-zinc-400 text-[0.8rem] font-medium">No reward</span>
                      ) : (
                        <span className="text-emerald-700 text-[0.875rem] font-bold">+{formatTrustive(stakeReward(s))}</span>
                      )
                    )}
                  </td>
                  <td className="px-6 py-5 align-middle whitespace-nowrap">
                    {(() => {
                      const label = s.status === 'unstaked'
                        ? (isEmergency ? 'Early Exit' : 'Claimed')
                        : lockExpired ? 'Claimable' : 'Active';
                      const tone = label === 'Active'
                        ? { bg: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' }
                        : label === 'Claimable' || label === 'Claimed'
                          ? { bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' }
                          : label === 'Early Exit'
                            ? { bg: 'bg-red-50 text-red-600 border border-red-200', dot: 'bg-red-500' }
                            : { bg: 'bg-zinc-100 text-zinc-600 border border-zinc-200', dot: 'bg-zinc-400' };
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[0.75rem] font-bold ${tone.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 align-middle font-mono">
                    {s.status === 'unstaked' ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-[0.65rem] uppercase tracking-wide text-zinc-400 w-[4.5rem] shrink-0">Staked</span>
                          <TxLink hash={s.stake_tx_hash} fallbackIndex={s.chain_stake_index} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-[0.65rem] uppercase tracking-wide text-zinc-400 w-[4.5rem] shrink-0">Withdrawn</span>
                          <TxLink hash={s.unstake_tx_hash} />
                        </div>
                      </div>
                    ) : (
                      <TxLink hash={s.stake_tx_hash} fallbackIndex={s.chain_stake_index} />
                    )}
                  </td>
                  {showAction && (
                  <td className="px-6 py-4 align-middle">
                    {s.status !== 'unstaked' ? (
                      <div className="flex flex-col items-start gap-1">
                        {lockExpired ? (
                          <button
                            onClick={() => canClaim && onClaim && onClaim(s)}
                            disabled={!canClaim || isBusy}
                            className={`flex items-center justify-center gap-1.5 font-bold px-4 py-2 rounded-xl transition-all text-xs shadow-md whitespace-nowrap ${isBusy
                              ? 'bg-[#212E73]/40 text-white/50 cursor-not-allowed'
                              : canClaim
                                ? 'bg-[#212E73] hover:bg-[#16225B] text-white cursor-pointer shadow-[#212E73]/20 active:scale-[0.95]'
                                : 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                              }`}
                          >
                            {isBusy && claimingMode === 'claim' ? 'Claiming...' : <><LuLockOpen className="h-3 w-3" />Claim</>}
                          </button>
                        ) : (
                          <button
                            onClick={() => canEmergencyWithdraw && onEmergencyWithdraw && onEmergencyWithdraw(s)}
                            disabled={!canEmergencyWithdraw || isBusy}
                            className={`flex items-center justify-center gap-1.5 font-bold px-4 py-2 rounded-xl transition-all text-xs shadow-sm whitespace-nowrap ${isBusy
                              ? 'bg-red-600/40 text-white/50 cursor-not-allowed'
                              : canEmergencyWithdraw
                                ? 'bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 cursor-pointer active:scale-[0.95]'
                                : 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                              }`}
                            title="Withdraw before the lock period ends - rewards are forfeited"
                          >
                            {isBusy && claimingMode === 'emergency' ? 'Withdrawing...' : <><LuTriangleAlert className="h-3 w-3" />Emergency Withdraw</>}
                          </button>
                        )}
                        {isOpen && !lockExpired && endsAt !== null && (
                          <span className="text-[0.7rem] text-zinc-400">{formatRemaining(endsAt - now)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-6 py-4 flex items-center justify-end border-t border-zinc-100 bg-zinc-50/40">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <LuChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl font-bold transition-all cursor-pointer ${p === page ? 'bg-[#212E73] text-white shadow-md shadow-[#212E73]/20' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 shadow-sm'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StakingTable;
