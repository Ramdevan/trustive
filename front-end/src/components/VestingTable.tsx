import { useState, useMemo } from 'react';
import { LuChevronLeft, LuChevronRight, LuExternalLink } from 'react-icons/lu';
import SearchBar from './SearchBar';
import VestingDetailModal from './VestingDetailModal';
import { formatVestId, PERIOD_SECONDS } from '@/utils/vesting';
import type { VestingRecord, VestingClaim } from '@/utils/vesting';

export type { VestingRecord, VestingClaim };
export { formatVestId, PERIOD_SECONDS };

interface VestingTableProps {
  vestings: VestingRecord[];
  loading: boolean;
  onRefresh?: () => void;
}

const PAGE_SIZE = 5;

const getStatusStyle = (ds?: string) => {
  switch (ds) {
    case 'claimable': return { wrapper: 'bg-[#10B9811A] text-[#10B981]', dot: 'bg-[#10B981]', label: 'Claimable' };
    case 'claimed': return { wrapper: 'bg-[#6366f11A] text-[#6366f1]', dot: 'bg-[#6366f1]', label: 'Completed' };
    case 'revoked': return { wrapper: 'bg-[#EF44441A] text-[#EF4444]', dot: 'bg-[#EF4444]', label: 'Revoked' };
    case 'locked': return { wrapper: 'bg-zinc-200/60 text-zinc-700', dot: 'bg-zinc-500', label: 'Locked' };
    default: return { wrapper: 'bg-[#EAB3081A] text-[#EAB308]', dot: 'bg-[#EAB308]', label: 'In-Progress' };
  }
};

const shortenHash = (hash?: string) => {
  if (!hash) return '—';
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

const formatClaimDate = (dateStr?: string) => {
  if (!dateStr) return { date: '—', time: '' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: dateStr, time: '' };
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  } catch {
    return { date: dateStr, time: '' };
  }
};

const formatLockTime = (v: VestingRecord) => {
  const vestMonths = Number(v.details?.vestingMonths ?? v.vesting_months ?? 0);
  const cliffMonths = Number(v.details?.cliffMonths ?? v.cliff_months ?? 0);
  const totalMonths = vestMonths + cliffMonths;
  if (totalMonths <= 0) return '—';
  if (cliffMonths > 0) {
    return `${totalMonths} Months (${cliffMonths}m Cliff)`;
  }
  return `${totalMonths} Months`;
};

const VestingTable: React.FC<VestingTableProps> = ({ vestings, loading, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'growth' | 'history'>('growth');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = vestings.find(v => v.id === selectedId) ?? null;

  // Flatten claims from all vestings for the Claim History tab
  const claimHistory = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      amount: string;
      txHash: string;
      status: string;
      timestamp: number;
    }> = [];

    vestings.forEach((v) => {
      (v.claims || []).forEach((c, idx) => {
        const time = c.created_at ? new Date(c.created_at).getTime() : 0;
        list.push({
          id: `${v.id}-${c.period_index}-${idx}`,
          date: c.created_at || v.created_at || '',
          amount: c.amount || '0',
          txHash: c.tx_hash,
          status: 'SUCCESS',
          timestamp: time,
        });
      });
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [vestings]);

  // Filter growth records - sorted latest first
  const sortedVestings = useMemo(() => {
    return [...vestings].sort((a, b) => {
      const timeA = a.created_at || a.start_at ? new Date(a.created_at || a.start_at).getTime() : 0;
      const timeB = b.created_at || b.start_at ? new Date(b.created_at || b.start_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [vestings]);

  const filteredGrowth = useMemo(() => {
    if (!searchQuery) return sortedVestings;
    const q = searchQuery.toLowerCase();
    return sortedVestings.filter(v =>
      formatVestId(v).toLowerCase().includes(q) ||
      (v.tx_hash?.toLowerCase().includes(q) ?? false) ||
      v.display_status?.toLowerCase().includes(q)
    );
  }, [sortedVestings, searchQuery]);

  // Filter history records
  const filteredHistory = useMemo(() => {
    if (!searchQuery) return claimHistory;
    const q = searchQuery.toLowerCase();
    return claimHistory.filter(h =>
      h.txHash?.toLowerCase().includes(q) ||
      h.date?.toLowerCase().includes(q) ||
      h.amount?.toLowerCase().includes(q)
    );
  }, [claimHistory, searchQuery]);

  const currentListLength = activeTab === 'growth' ? filteredGrowth.length : filteredHistory.length;
  const totalPages = Math.max(1, Math.ceil(currentListLength / PAGE_SIZE));
  const paginatedGrowth = filteredGrowth.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paginatedHistory = filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      {/* Tab Switcher & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center p-1 rounded-2xl bg-zinc-200/60 border border-zinc-200">
          <button
            onClick={() => { setActiveTab('growth'); setPage(1); }}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'growth'
                ? 'bg-[#36A886] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Growth Ledger
          </button>
          <button
            onClick={() => { setActiveTab('history'); setPage(1); }}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#36A886] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Claim History
          </button>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); setPage(1); }}
          placeholder={activeTab === 'growth' ? "Search by vest ID or transaction hash..." : "Search by transaction hash or amount..."}
          className="max-w-md w-full"
        />
      </div>

      {/* Main Table Container with Trustive styling */}
      <div className="overflow-x-auto rounded-2xl bg-[#ECE9EA] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {activeTab === 'growth' ? (
          /* GROWTH LEDGER TABLE */
          <table className="w-full text-left border-collapse min-w-[52rem]">
            <thead>
              <tr className="text-zinc-500 text-[0.875rem] font-semibold bg-zinc-200/50 border-b border-zinc-200 align-middle whitespace-nowrap">
                <th className="px-6 py-5 w-[10%] min-w-[5rem]">S.NO / VEST ID</th>
                <th className="px-6 py-5 w-[14%] min-w-[7rem]">LOCK TIME</th>
                <th className="px-6 py-5 w-[15%] min-w-[8rem]">ALLOCATED</th>
                <th className="px-6 py-5 w-[15%] min-w-[8rem]">CLAIMABLE</th>
                <th className="px-6 py-5 w-[15%] min-w-[8rem]">RELEASED</th>
                <th className="px-6 py-5 w-[13%] min-w-[7rem]">STATUS</th>
                <th className="px-6 py-5 w-[13%] min-w-[8rem]">TNX HASH</th>
                <th className="px-6 py-5 w-[10%] min-w-[6rem] text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="text-[0.875rem] font-medium text-zinc-600">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">
                    Loading vesting schedules...
                  </td>
                </tr>
              ) : paginatedGrowth.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">
                    No active vesting schedules found
                  </td>
                </tr>
              ) : (
                paginatedGrowth.map((v, index) => {
                  const s = getStatusStyle(v.display_status);
                  const allocated = Number(v.details?.totalAmount ?? v.total_amount ?? 0);
                  const claimable = Number(v.details?.claimableNow ?? 0);
                  const claimed = Number(v.details?.claimedAmount ?? 0);
                  const released = claimed + claimable;

                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-zinc-200/40 transition-colors border-b border-zinc-200/70 last:border-0"
                    >
                      {/* S.NO + VEST ID */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-zinc-900 font-bold">
                            {(page - 1) * PAGE_SIZE + index + 1}
                          </span>
                          <span className="text-[0.7rem] font-bold text-[#36A886] font-mono">
                            {formatVestId(v)}
                          </span>
                        </div>
                      </td>

                      {/* LOCK TIME */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap text-zinc-900 font-bold">
                        {formatLockTime(v)}
                      </td>

                      {/* ALLOCATED */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-zinc-900 font-bold text-[0.95rem]">
                            {allocated.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[0.7rem] font-bold text-zinc-500 uppercase tracking-wider">
                            TRSIV
                          </span>
                        </div>
                      </td>

                      {/* CLAIMABLE */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className={`font-bold text-[0.95rem] ${claimable > 0 ? 'text-[#36A886]' : 'text-zinc-700'}`}>
                            {claimable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className={`text-[0.7rem] font-bold uppercase tracking-wider ${claimable > 0 ? 'text-[#36A886]' : 'text-zinc-400'}`}>
                            CLAIMABLE
                          </span>
                        </div>
                      </td>

                      {/* RELEASED */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-zinc-900 font-bold text-[0.95rem]">
                            {released.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[0.7rem] font-bold text-zinc-500 uppercase tracking-wider">
                            RELEASED
                          </span>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[0.75rem] font-bold ${s.wrapper}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>

                      {/* TNX HASH */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap font-mono">
                        {v.tx_hash && v.tx_hash.startsWith('0x') ? (
                          <a
                            href={`https://testnet.bscscan.com/tx/${v.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#36A886] hover:underline text-[0.8rem] font-medium"
                          >
                            {shortenHash(v.tx_hash)}
                            <LuExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-400 text-[0.8rem]">—</span>
                        )}
                      </td>

                      {/* ACTION */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap text-center">
                        {claimable > 0 ? (
                          <button
                            onClick={() => setSelectedId(v.id)}
                            className="px-4 py-1.5 rounded-xl bg-[#36A886] hover:bg-[#2d8d70] text-white text-[0.75rem] font-bold uppercase tracking-wider transition-all shadow-sm shadow-[#36A886]/20 cursor-pointer"
                          >
                            CLAIM
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedId(v.id)}
                            className="px-4 py-1.5 rounded-xl border border-zinc-300 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 text-[0.75rem] font-bold uppercase tracking-wider transition-all cursor-pointer"
                          >
                            VIEW
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          /* CLAIM HISTORY TABLE */
          <table className="w-full text-left border-collapse min-w-[44rem]">
            <thead>
              <tr className="text-zinc-500 text-[0.875rem] font-semibold bg-zinc-200/50 border-b border-zinc-200 align-middle whitespace-nowrap">
                <th className="px-6 py-5 w-[10%] min-w-[5rem]">S.NO</th>
                <th className="px-6 py-5 w-[25%] min-w-[10rem]">DATE</th>
                <th className="px-6 py-5 w-[25%] min-w-[10rem]">AMOUNT</th>
                <th className="px-6 py-5 w-[25%] min-w-[10rem]">TNX HASH</th>
                <th className="px-6 py-5 w-[15%] min-w-[8rem] text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="text-[0.875rem] font-medium text-zinc-600">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    Loading claim history...
                  </td>
                </tr>
              ) : paginatedHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    No claim history found
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((item, index) => {
                  const { date, time } = formatClaimDate(item.date);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-200/40 transition-colors border-b border-zinc-200/70 last:border-0"
                    >
                      {/* S.NO */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap text-zinc-900 font-bold">
                        {(page - 1) * PAGE_SIZE + index + 1}
                      </td>

                      {/* DATE */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-zinc-900 font-bold text-[0.875rem]">{date}</span>
                          {time && <span className="text-[0.75rem] text-zinc-500 font-mono">{time}</span>}
                        </div>
                      </td>

                      {/* AMOUNT */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-zinc-900 font-bold text-[0.95rem]">
                            {parseFloat(item.amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[0.75rem] font-bold text-zinc-500 uppercase tracking-wider">TRSIV</span>
                        </div>
                      </td>

                      {/* TNX HASH */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap font-mono">
                        {item.txHash && item.txHash.startsWith('0x') ? (
                          <a
                            href={`https://testnet.bscscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#36A886] hover:underline text-[0.8rem] font-medium"
                          >
                            {shortenHash(item.txHash)}
                            <LuExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-400 text-[0.8rem]">—</span>
                        )}
                      </td>

                      {/* STATUS */}
                      <td className="px-6 py-5 align-middle whitespace-nowrap text-center">
                        <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[0.75rem] font-bold bg-[#10B9811A] text-[#10B981]">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#10B981]" />
                          SUCCESS
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 flex items-center justify-between border-t border-zinc-200/80">
            <p className="text-[0.875rem] font-normal text-zinc-900">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, currentListLength)}–{Math.min(page * PAGE_SIZE, currentListLength)} of {currentListLength}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <LuChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vesting Detail Modal when user clicks Claim or View */}
      {selected && (
        <VestingDetailModal
          vesting={selected}
          onClose={() => setSelectedId(null)}
          onClaimed={onRefresh}
        />
      )}
    </div>
  );
};

export default VestingTable;
