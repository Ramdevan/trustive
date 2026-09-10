"use client";

import { useEffect, useState } from "react";
import {
    Layers,
    Activity,
    RefreshCw,
    Search,
    Download,
    ExternalLink,
    Copy,
    Check,
    Coins,
    TrendingUp,
    Clock,
    User,
    CheckCircle2,
    XCircle,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Shield
} from "lucide-react";
import { cn, formatDate, shortenAddress, formatDecimal, copyToClipboard } from "@/lib/utils";
import { toast } from "react-toastify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { CopyButton } from "@/components/CopyButton";
import TxHashLink from "@/components/TxHashLink";

interface StakingPlan {
    id: number;
    name: string;
    chain_level: number;
    duration_seconds: number;
    apy: number;
    min_stake: string;
    is_active: boolean;
    total_staked: string;
}

interface StakingStats {
    active_stakes: number;
    total_stakers: number;
    total_staked: string;
    total_rewards_distributed: string;
    total_withdrawn: number;
}

interface StakingRecord {
    id: number;
    user_address: string;
    amount: string;
    plan_id: number;
    plan_name: string;
    apy: number;
    duration_days?: number;
    stake_tx_hash: string;
    unstake_tx_hash?: string;
    start_at: string;
    end_at?: string;
    reward_claimed: string;
    status: string;
    created_at: string;
    username?: string;
    user_email?: string;
}

const STAKING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STAKING_CONTRACT || "0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb";

export default function StakingManagement() {
    const queryClient = useQueryClient();
    const [syncing, setSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const [currentPage, setCurrentPage] = useState(1);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const itemsPerPage = 10;

    // Fetch Plans
    const { data: plansData, isLoading: plansLoading } = useQuery({
        queryKey: ["staking-plans"],
        queryFn: () => apiRequest("/staking/plans"),
        refetchInterval: 30000,
    });
    const plans: StakingPlan[] = plansData?.plans || [];

    // Fetch Stats
    const { data: statsData } = useQuery({
        queryKey: ["staking-stats"],
        queryFn: () => apiRequest("/staking/stats"),
        refetchInterval: 10000,
    });
    const stats: StakingStats | null = statsData?.stats || null;

    // Fetch All User Stakes
    const { data: stakesData, isLoading: stakesLoading } = useQuery({
        queryKey: ["all-stakes", statusFilter, searchTerm, currentPage],
        queryFn: () => apiRequest(`/staking/all-stakes?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(searchTerm)}&status=${statusFilter}`),
        refetchInterval: 10000,
    });
    const stakes: StakingRecord[] = stakesData?.stakes || [];
    const totalPages: number = stakesData?.totalPages || 1;

    // The single active on-chain plan (Level 1)
    const activePlan: StakingPlan | undefined = plans.find(p => p.chain_level === 1) || plans[0];

    const handleSync = async () => {
        setSyncing(true);
        try {
            await apiRequest("/staking/plans/sync");
            const data = await apiRequest("/staking/sync-all-users");
            if (data.status) {
                toast.success(data.msg || "Staking data synchronized with blockchain");
                queryClient.invalidateQueries({ queryKey: ["staking-plans"] });
                queryClient.invalidateQueries({ queryKey: ["staking-stats"] });
                queryClient.invalidateQueries({ queryKey: ["all-stakes"] });
            }
        } catch (err: any) {
            toast.error(err?.message || "Sync failed");
        } finally {
            setSyncing(false);
        }
    };

    const handleCopy = async (text: string) => {
        const success = await copyToClipboard(text);
        if (success) {
            setCopiedAddress(text);
            toast.success("Address copied to clipboard");
            setTimeout(() => setCopiedAddress(null), 2000);
        }
    };

    const handleExportCSV = () => {
        if (stakes.length === 0) {
            toast.info("No staking transactions to export");
            return;
        }

        const headers = ["ID", "User Wallet", "Username", "Staked Amount (Trustive)", "Plan", "APY (%)", "Staked At (UTC)", "Unlock At (UTC)", "Reward Claimed (Trustive)", "Status", "Tx Hash"];
        const rows = stakes.map(s => [
            s.id,
            s.user_address,
            s.username || "N/A",
            s.amount,
            s.plan_name || `Level ${s.plan_id || 1}`,
            s.apy || activePlan?.apy || 8,
            s.start_at || s.created_at,
            s.end_at || "N/A",
            s.reward_claimed || "0",
            s.status,
            s.stake_tx_hash || "N/A"
        ].map(val => `"${val}"`).join(","));

        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `Trustive_Staking_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return "3 Min Lock";
        if (seconds < 3600) return `${Math.round(seconds / 60)} Min Lock`;
        if (seconds < 86400) return `${Math.round(seconds / 3600)} Hour Lock`;
        return `${Math.round(seconds / 86400)} Day Lock`;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Top Bar / Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 uppercase">Staking Plan & Transactions</h2>
                    <p className="text-xs text-zinc-500 mt-1">Manage active on-chain staking pool and monitor user staking activity</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="px-5 py-2.5 bg-white hover:bg-zinc-50 text-zinc-800 rounded-xl border border-zinc-200 transition-all flex items-center gap-2 text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-[#212E73]", syncing && "animate-spin")} />
                        <span>{syncing ? "Syncing..." : "Deep Chain Sync"}</span>
                    </button>
                </div>
            </div>

            {/* Staking Plan Detail Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Layers className="w-4 h-4 text-[#212E73]" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700">Active Staking Plan</h3>
                </div>

                {activePlan ? (
                    <div className="rounded-3xl bg-white p-6 sm:p-8 border border-zinc-200/90 relative overflow-hidden transition-all shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 relative z-10 items-center text-center sm:text-left">
                            
                            {/* Plan Level & Duration */}
                            <div className="space-y-1.5 lg:pr-6">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    {formatDuration(activePlan.duration_seconds)}
                                </div>
                                <div className="text-2xl font-bold text-zinc-900">
                                    {(activePlan.name && activePlan.name !== 'Flexible' && !activePlan.name.startsWith('Level ')) ? activePlan.name : "GOLD"}
                                </div>
                                <div className="text-xs text-zinc-500 font-mono">
                                    Min Stake: {formatDecimal(activePlan.min_stake && activePlan.min_stake !== '100' && activePlan.min_stake !== '0' ? activePlan.min_stake : "1000", 0)} Trustive
                                </div>
                            </div>
                            
                            {/* APY */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-zinc-200">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Annual Yield</div>
                                <div className="text-2xl font-bold text-[#212E73]">
                                    {Number(activePlan.apy).toFixed(0)}% APY
                                </div>
                                <div className="text-xs text-emerald-600 font-semibold">Fixed Compound</div>
                            </div>
                            
                            {/* Status */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-zinc-200">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</div>
                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                    <span className="text-lg font-bold text-emerald-600">Active</span>
                                </div>
                                <div className="text-xs text-zinc-400">Open for staking</div>
                            </div>
                            
                            {/* Active Stakes */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-zinc-200">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Active Stakes</div>
                                <div className="text-2xl font-bold text-zinc-900">
                                    {stats?.active_stakes || 0}
                                </div>
                                <div className="text-xs text-zinc-500 font-mono">
                                    {formatDecimal(stats?.total_staked || "0", 2, 2)} Trustive
                                </div>
                            </div>

                            {/* Contract Address / Info */}
                            <div className="space-y-1.5 lg:pl-6 lg:border-l border-zinc-200 flex flex-col justify-center">
                                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Contract Address</div>
                                <div className="flex items-center justify-center sm:justify-start gap-2">
                                    <span className="text-xs text-zinc-700 font-mono font-medium">
                                        {shortenAddress(STAKING_CONTRACT_ADDRESS)}
                                    </span>
                                    <button
                                        onClick={() => handleCopy(STAKING_CONTRACT_ADDRESS)}
                                        className="p-1 hover:text-[#212E73] text-zinc-400 transition-colors cursor-pointer"
                                        title="Copy Address"
                                    >
                                        {copiedAddress === STAKING_CONTRACT_ADDRESS ? (
                                             <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                    <a
                                        href={`https://sepolia.etherscan.io/address/${STAKING_CONTRACT_ADDRESS}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 hover:text-[#212E73] text-zinc-400 transition-colors"
                                        title="View on Etherscan"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                                <div className="text-[11px] text-zinc-400">Sepolia Testnet</div>
                            </div>

                        </div>
                    </div>
                ) : (
                    <div className="rounded-3xl bg-white p-8 border border-zinc-200 text-center text-zinc-500 shadow-sm">
                        {plansLoading ? "Loading staking plan..." : "No active staking plan found on chain. Please click 'Deep Chain Sync'."}
                    </div>
                )}
            </div>

            {/* User Staking Transactions History Section */}
            <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 px-1">
                        <Activity className="w-4 h-4 text-[#212E73]" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700">User Staking Transactions</h3>
                    </div>

                    {/* Search, Filter & CSV Export Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Status Filter Tabs */}
                        <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                            {[
                                { label: "Active", value: "active" },
                                { label: "Withdrawn", value: "completed" }
                            ].map((tab) => (
                                <button
                                    key={tab.value}
                                    onClick={() => {
                                        setStatusFilter(tab.value);
                                        setCurrentPage(1);
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                                        statusFilter === tab.value
                                            ? "bg-[#212E73] text-white shadow-sm"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search by address or tx..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="bg-white border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] w-48 sm:w-64 transition-all shadow-sm"
                            />
                        </div>

                        {/* Export CSV Button */}
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 rounded-xl border border-zinc-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                            title="Export CSV"
                        >
                            <Download className="w-3.5 h-3.5 text-[#212E73]" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>
                </div>

                {/* Transactions Table Card */}
                <div className="rounded-3xl bg-white border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[55rem]">
                            <thead>
                                <tr className="bg-[#212E73] text-white text-[11px] font-bold uppercase tracking-wider">
                                    <th className="px-6 py-4">#</th>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4 text-right">Staked Amount</th>
                                    <th className="px-6 py-4 text-center">Plan / APY</th>
                                    <th className="px-6 py-4 text-center">Staked Date (UTC)</th>
                                    <th className="px-6 py-4 text-center">Unlock Date (UTC)</th>
                                    <th className="px-6 py-4 text-right">Reward Claimed</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-center">Transaction Hash</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 text-xs">
                                {stakesLoading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <RefreshCw className="w-4 h-4 animate-spin text-[#212E73]" />
                                                <span>Loading staking records...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : stakes.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-zinc-500 italic">
                                            No staking transactions found.
                                        </td>
                                    </tr>
                                ) : (
                                    stakes.map((tx, idx) => {
                                        const isClaimable = tx.status === "completed";
                                        const isActive = tx.status === "active";
                                        const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;

                                        return (
                                            <tr key={tx.id || idx} className="hover:bg-zinc-50/70 transition-colors">
                                                {/* Index */}
                                                <td className="px-6 py-4 text-zinc-400 font-mono">
                                                    {rowNumber}
                                                </td>

                                                {/* User */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <div className="font-semibold text-zinc-900">
                                                            {tx.username || shortenAddress(tx.user_address)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-mono">
                                                            <span>{shortenAddress(tx.user_address)}</span>
                                                            <button
                                                                onClick={() => handleCopy(tx.user_address)}
                                                                className="hover:text-zinc-700 transition-colors cursor-pointer"
                                                                title="Copy Wallet"
                                                            >
                                                                {copiedAddress === tx.user_address ? (
                                                                    <Check className="w-3 h-3 text-emerald-600" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Staked Amount */}
                                                <td className="px-6 py-4 text-right">
                                                    <div className="font-bold text-[#212E73]">
                                                        {formatDecimal(tx.amount, 2, 2)} Trustive
                                                    </div>
                                                </td>

                                                {/* Plan / APY */}
                                                <td className="px-6 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-700 font-medium text-[11px]">
                                                        <span>{tx.plan_name || `Level ${tx.plan_id || 1}`}</span>
                                                        <span className="text-[#212E73] font-bold">({tx.apy || activePlan?.apy || 8}%)</span>
                                                    </div>
                                                </td>

                                                {/* Staked Date */}
                                                <td className="px-6 py-4 text-center text-zinc-500 whitespace-nowrap text-[11px]">
                                                    {tx.start_at || tx.created_at ? formatDate(tx.start_at || tx.created_at) : "—"}
                                                </td>

                                                {/* Unlock Date */}
                                                <td className="px-6 py-4 text-center text-zinc-500 whitespace-nowrap text-[11px]">
                                                    {tx.end_at ? formatDate(tx.end_at) : "—"}
                                                </td>

                                                {/* Reward Claimed */}
                                                <td className="px-6 py-4 text-right font-medium">
                                                    {tx.reward_claimed && parseFloat(tx.reward_claimed) > 0 ? (
                                                        <span className="text-emerald-600 font-semibold">+{formatDecimal(tx.reward_claimed, 4, 2)} Trustive</span>
                                                    ) : (
                                                        <span className="text-zinc-400">0.00 Trustive</span>
                                                    )}
                                                </td>

                                                {/* Status */}
                                                <td className="px-6 py-4 text-center">
                                                    {isActive ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-[11px]">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            Active
                                                        </span>
                                                    ) : isClaimable ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-800 font-semibold text-[11px]">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                            Claimable
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 font-semibold text-[11px]">
                                                            <CheckCircle2 className="w-3 h-3 text-zinc-500" />
                                                            Withdrawn
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Tx Hash */}
                                                <td className="px-6 py-4 text-center font-mono">
                                                    <TxHashLink hash={tx.stake_tx_hash} />
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 text-xs text-zinc-500">
                            <div>
                                Page <span className="font-semibold text-zinc-900">{currentPage}</span> of <span className="font-semibold text-zinc-900">{totalPages}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
                                    title="First Page"
                                >
                                    <ChevronsLeft className="w-4 h-4 text-zinc-600" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
                                    title="Previous Page"
                                >
                                    <ChevronLeft className="w-4 h-4 text-zinc-600" />
                                </button>
                                <span className="px-3 py-1 bg-[#212E73] rounded-lg font-semibold text-white shadow-sm">
                                    {currentPage}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
                                    title="Next Page"
                                >
                                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
                                    title="Last Page"
                                >
                                    <ChevronsRight className="w-4 h-4 text-zinc-600" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
