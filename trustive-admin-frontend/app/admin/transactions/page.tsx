"use client";

import { useEffect, useState } from "react";
import {
    CreditCard,
    Search,
    Download,
    Filter,
    ArrowRight,
    CheckCircle2,
    Clock,
    User,
    Hash,
    Coins,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Ban,
    Trash2
} from "lucide-react";
import { cn, formatDate, shortenAddress, formatDecimal, formatUSD } from "@/lib/utils";
import { CryptoIcon } from "@/components/CryptoIcon";
import { toast } from "react-toastify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { confirmAction } from "@/lib/confirm";
import { CopyButton } from "@/components/CopyButton";
import TxHashLink from "@/components/TxHashLink";

interface Transaction {
    id: number;
    address: string;
    ptc_tokens: string;
    created_at: string;
    created_at_utc: string;
    sale_type: string;
    payment_type: string;
    crypto_value: string;
    usd_value_of_crypto: string;
    trans_hash: string;
    status: string;
    username?: string;
}

export default function TransactionsLedger() {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterPhase, setFilterPhase] = useState("all");
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const { data: txData, isLoading: loading } = useQuery({
        queryKey: ["transactions"],
        queryFn: () => apiRequest("/getTransactionDetails"),
        refetchInterval: 60000,
    });

    const queryClient = useQueryClient();
    const transactions: Transaction[] = txData?.transactions || [];

    const handleCancel = async (id: number) => {
        if (!(await confirmAction("Are you sure you want to cancel this purchase? This will mark it as canceled in the records."))) return;

        try {
            const res = await apiRequest("/cancelPurchase", {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (res.status) {
                toast.success("canceled purchase");
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
            } else {
                toast.error(res.msg || "Failed to cancel purchase");
            }
        } catch (err) {
            toast.error("An error occurred while canceling the purchase");
        }
    };

    const handleExportCSV = () => {
        if (transactions.length === 0) return;

        const headers = ["ID", "Wallet Address", "Tokens (Trustive)", "Value (USD)", "Payment Type", "Status", "Transaction Hash", "Date"];
        const rows = transactions.map(tx => [
            tx.id,
            tx.address,
            tx.ptc_tokens,
            tx.usd_value_of_crypto,
            tx.payment_type,
            "Success",
            tx.trans_hash || "N/A",
            tx.created_at
        ].map(val => `"${val}"`).join(","));

        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `Trustive_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filtered = transactions.filter(tx => {
        const matchesSearch = tx.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tx.trans_hash?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPhase = filterPhase === "all" || tx.sale_type === filterPhase;
        return matchesSearch && matchesPhase;
    });

    const phases = ["all", ...Array.from(new Set(transactions.map(tx => tx.sale_type).filter(Boolean)))];

    // Pagination Logic
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = filtered.slice(startIndex, startIndex + itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPhase]);

    return (
        <div className="space-y-8 animate-in fade-in duration-200">

            <div className="bg-white rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-zinc-50/50">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search by wallet hash or TXID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-2xl pl-12 pr-6 py-3.5 focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] outline-none text-zinc-900 text-sm transition-all placeholder:text-zinc-400 shadow-sm"
                        />
                    </div>
                    <div className="flex items-center gap-4 relative">
                        <div className="flex flex-col items-end gap-4">
                            <div
                                onClick={() => setShowFilters(!showFilters)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all cursor-pointer w-full md:w-auto justify-center",
                                    filterPhase !== "all"
                                        ? "bg-[#212E73]/10 border-[#212E73]/30 text-[#212E73]"
                                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 shadow-sm"
                                )}
                            >
                                <Filter className={cn("w-4 h-4", filterPhase !== "all" ? "text-[#212E73]" : "text-zinc-500")} />
                                <span className="text-xs font-bold uppercase tracking-widest">
                                    {filterPhase === "all" ? "Filter: All Phases" : `Phase: ${filterPhase}`}
                                </span>
                            </div>

                            <button
                                onClick={handleExportCSV}
                                disabled={transactions.length === 0}
                                className="w-full md:w-auto px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 rounded-xl border border-zinc-200 transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                <Download className="w-3 h-3" />
                                Export CSV
                            </button>
                        </div>

                        {showFilters && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-zinc-200 rounded-2xl shadow-xl z-20 overflow-hidden py-2 animate-in fade-in zoom-in-95 duration-200">
                                    {phases.map((phase) => (
                                        <button
                                            key={phase}
                                            onClick={() => {
                                                setFilterPhase(phase);
                                                setShowFilters(false);
                                            }}
                                            className={cn(
                                                "w-full px-5 py-2.5 text-left text-[10px] font-black uppercase tracking-widest transition-colors",
                                                filterPhase === phase
                                                    ? "bg-[#212E73] text-white"
                                                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                            )}
                                        >
                                            {phase === "all" ? "Show All" : phase}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-base">
                        <thead>
                            <tr className="bg-[#212E73] text-white text-xs font-black uppercase tracking-[0.2em]">
                                <th className="px-12 py-6 text-center w-28 uppercase">S No</th>
                                <th className="px-10 py-6 text-center uppercase">Users</th>
                                <th className="px-10 py-6 text-center uppercase">Payment Type</th>
                                <th className="px-10 py-6 text-center uppercase">Amount Paid</th>
                                <th className="px-10 py-6 text-center uppercase">Trustive Received</th>
                                <th className="px-10 py-6 text-center uppercase">Value (USD)</th>
                                <th className="px-10 py-6 text-center uppercase">Status</th>
                                <th className="px-12 py-6 text-center uppercase">Transaction Hash</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-8 py-20 text-center">
                                        <div className="animate-spin h-6 w-6 border-b-2 border-[#212E73] mx-auto"></div>
                                    </td>
                                </tr>
                            ) : filtered.length > 0 ? (
                                paginatedData.map((tx, i) => (
                                    <tr key={tx.id} className="hover:bg-zinc-50/70 transition-colors group">
                                        <td className="px-12 py-6 text-center">
                                            <span className="text-zinc-500 font-bold">{(currentPage - 1) * itemsPerPage + i + 1}</span>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-zinc-900 font-bold text-base">{tx.username || 'Anonymous'}</span>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-xs text-zinc-500 font-mono">{shortenAddress(tx.address)}</span>
                                                    <CopyButton text={tx.address} label="Copy Address" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <div className="flex items-center justify-center gap-3 px-4 py-2 bg-zinc-100 rounded-xl border border-zinc-200 w-fit mx-auto">
                                                <CryptoIcon coin={tx.payment_type} className="w-4 h-4" />
                                                <span className="text-sm font-bold text-zinc-900 uppercase">{tx.payment_type}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <span className="text-[#212E73] font-bold text-base">
                                                {formatDecimal(tx.crypto_value, 5, 2)}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <div className="flex flex-col items-center">
                                                <p className="text-zinc-900 font-bold text-base">{formatDecimal(tx.ptc_tokens, 5, 2)}</p>
                                                <p className="text-xs text-[#212E73] font-black uppercase tracking-widest mt-1">Trustive Tokens</p>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <span className="text-zinc-900 font-bold text-base">{formatUSD(tx.usd_value_of_crypto)}</span>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            {tx.status === 'canceled' ? (
                                                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-600 border border-red-200 rounded-full w-fit mx-auto">
                                                    <Ban className="w-4 h-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Canceled</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full w-fit mx-auto">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Success</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-12 py-6 text-center">
                                            <TxHashLink hash={tx.trans_hash} />
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-8 py-20 text-center text-zinc-500 font-medium italic">
                                        No network transactions matching current parameters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 5 && (
                    <div className="p-8 border-t border-zinc-200 flex flex-col md:flex-row items-center justify-between gap-6 bg-zinc-50/50">
                        <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                            Showing <span className="text-zinc-900">{startIndex + 1}</span> to <span className="text-zinc-900">{Math.min(startIndex + itemsPerPage, filtered.length)}</span> of <span className="text-zinc-900">{filtered.length}</span> Results
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-[#212E73] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:text-zinc-500 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronsLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-[#212E73] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:text-zinc-500 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex items-center bg-zinc-100 border border-zinc-200 rounded-xl px-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) pageNum = i + 1;
                                    else if (currentPage <= 3) pageNum = i + 1;
                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                    else pageNum = currentPage - 2 + i;

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={cn(
                                                "min-w-[40px] h-10 text-[10px] font-black tracking-widest transition-all rounded-lg m-1 cursor-pointer",
                                                currentPage === pageNum
                                                    ? "bg-[#212E73] text-white shadow-md"
                                                    : "text-zinc-600 hover:text-zinc-900"
                                            )}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-[#212E73] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:text-zinc-500 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:text-[#212E73] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:text-zinc-500 transition-all shadow-sm cursor-pointer"
                            >
                                <ChevronsRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
