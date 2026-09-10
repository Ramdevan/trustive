import React, { useState } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import SearchBar from './SearchBar';
import CopyButton from './CopyButton';

interface Transaction {
  id?: number;
  address?: string;
  trans_hash?: string;
  crypto_value?: string;
  payment_type?: string;
  ptc_tokens?: string;
  usd_value_of_crypto?: string;
  created_at_utc?: string;
  created_at?: string;
  status?: string;
  username?: string;
}

interface TransactionTableProps {
  transactions?: Transaction[];
  loading?: boolean;
}

const PAGE_SIZE = 5;

const shortenHash = (hash?: string) => {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  } catch { return '—'; }
};

const TransactionTable: React.FC<TransactionTableProps> = ({ transactions = [], loading = false }) => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTransactions = transactions.filter(tx =>
    !searchQuery ||
    (tx.trans_hash && tx.trans_hash.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (tx.address && tx.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (tx.username && tx.username.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginated = filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getStatusStyle = (status?: string) => {
    if (status === 'success' || status === 'paid') {
      return { wrapper: 'bg-[#10B9811A] text-[#10B981]', dot: 'bg-[#10B981]', label: 'Success' };
    }
    return { wrapper: 'bg-[#EAB3081A] text-[#EAB308]', dot: 'bg-[#EAB308]', label: 'Pending' };
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-[1.5rem] font-bold text-zinc-900 whitespace-nowrap">Transaction history</h2>
        <SearchBar
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); setPage(1); }}
          className="max-w-md w-full"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <table className="w-full border-collapse min-w-[38rem]">
          <thead>
            <tr className="text-zinc-500 text-[0.875rem] font-semibold bg-zinc-50/80 border-b border-zinc-200">
              <th className="px-6 py-4 min-w-[4rem] text-center">S No</th>
              <th className="px-6 py-4 min-w-[8rem] text-left">Users</th>
              <th className="px-6 py-4 min-w-[8rem] text-center">Payment Type</th>
              <th className="px-6 py-4 min-w-[8rem] text-center">Amount Paid</th>
              <th className="px-6 py-4 min-w-[8rem] text-center">Received Trustive</th>
              <th className="px-6 py-4 min-w-[8rem] text-center">USD Value</th>
              <th className="px-6 py-4 min-w-[8rem] text-center">Status</th>
              <th className="px-6 py-4 min-w-[12rem] text-center">Transaction Hash</th>
            </tr>
          </thead>
          <tbody className="text-[0.875rem] font-medium text-zinc-600">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">Loading transactions...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">No transactions found</td>
              </tr>
            ) : paginated.map((tx, index) => {
              const s = getStatusStyle(tx.status);
              return (
                <tr key={tx.id ?? index} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-4 text-zinc-800 text-center">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-6 py-4 text-zinc-900 font-medium text-left">
                    <div className="flex flex-col">
                      <span>{tx.username || (tx.address ? shortenHash(tx.address) : 'Anonymous')}</span>
                      {tx.address && (
                        <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
                          <span>{shortenHash(tx.address)}</span>
                          <CopyButton text={tx.address} label="Copy Address" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#212E73] uppercase font-bold text-center">{tx.payment_type}</td>
                  <td className="px-6 py-4 text-zinc-900 font-medium whitespace-nowrap text-center">{Number(tx.crypto_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                  <td className="px-6 py-4 text-zinc-900 font-semibold whitespace-nowrap text-center">{parseFloat(tx.ptc_tokens || '0').toLocaleString()} Trustive</td>
                  <td className="px-6 py-4 text-zinc-900 font-bold whitespace-nowrap text-center">${Number(tx.usd_value_of_crypto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-full text-[0.75rem] font-bold ${s.wrapper}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-center">
                    {tx.trans_hash && tx.trans_hash.startsWith('0x') && tx.trans_hash.length >= 64 ? (
                      <a href={`https://sepolia.etherscan.io/tx/${tx.trans_hash}`} target="_blank" rel="noopener noreferrer" className="text-[#212E73] font-semibold hover:underline inline-block" title={tx.trans_hash}>
                        {shortenHash(tx.trans_hash)}
                      </a>
                    ) : (
                      <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest inline-block">
                        {tx.trans_hash ? 'Synced' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 flex items-center justify-end border-t border-zinc-100 bg-zinc-50/40">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <LuChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl font-bold transition-all cursor-pointer ${p === page
                    ? 'bg-[#212E73] text-white shadow-md shadow-[#212E73]/20'
                    : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 shadow-sm'
                    }`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <LuChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionTable;
