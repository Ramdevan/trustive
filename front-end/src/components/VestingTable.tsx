import { useState } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
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
    case 'locked': return { wrapper: 'bg-white/5 text-zinc-500', dot: 'bg-zinc-500', label: 'Locked' };
    default: return { wrapper: 'bg-[#EAB3081A] text-[#EAB308]', dot: 'bg-[#EAB308]', label: 'In-Progress' };
  }
};

const VestingTable: React.FC<VestingTableProps> = ({ vestings, loading, onRefresh }) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  // Track the id, not the row: after a claim the list is refetched and the
  // modal has to show the updated schedule rather than a stale copy.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = vestings.find(v => v.id === selectedId) ?? null;

  const filtered = vestings.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return formatVestId(v).toLowerCase().includes(q) || (v.tx_hash?.toLowerCase().includes(q) ?? false);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-end">
        <SearchBar
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); setPage(1); }}
          placeholder="Search by vest ID or transaction hash..."
          className="max-w-md w-full"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card border border-white/5">
        <table className="w-full text-left border-collapse min-w-[40rem]">
          <thead>
            <tr className="text-[#FAF7F2] text-[0.8rem] sm:text-[1rem] font-medium border-b border-white/5 align-middle whitespace-nowrap">
              <th className="px-6 py-5 w-[15%] min-w-[6rem]">S.No</th>
              <th className="px-6 py-5 w-[35%] min-w-[10rem]">ID</th>
              <th className="px-6 py-5 w-[30%] min-w-[10rem]">Status</th>
              <th className="px-6 py-5 w-[20%] min-w-[8rem]">Action</th>
            </tr>
          </thead>
          <tbody className="text-[0.875rem] font-medium text-[#94A3B8]">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-zinc-500">Loading vestings...</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-zinc-500">No vestings found</td></tr>
            ) : paginated.map((v, index) => {
              const s = getStatusStyle(v.display_status);
              return (
                <tr key={v.id} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                  <td className="px-6 py-5 align-middle whitespace-nowrap text-[#FAF7F2]">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-6 py-5 align-middle whitespace-nowrap text-[#FAF7F2] font-mono">{formatVestId(v)}</td>
                  <td className="px-6 py-5 align-middle whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center gap-1.5 w-[7.5rem] px-4 py-1.5 rounded-full text-[0.75rem] font-bold ${s.wrapper}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-6 py-5 align-middle whitespace-nowrap">
                    <button
                      onClick={() => setSelectedId(v.id)}
                      className="text-accent font-bold hover:underline cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-6 py-4 flex items-center justify-between border-t border-white/5">
            <p className="text-[0.875rem] font-normal text-[#64748B]">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg bg-black/40 border border-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-40">
                <LuChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg bg-black/40 border border-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer disabled:opacity-40">
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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
