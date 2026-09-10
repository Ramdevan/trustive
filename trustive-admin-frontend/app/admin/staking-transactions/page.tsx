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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 bg-black min-h-screen p-4 sm:p-8 text-white">
            {/* Top Bar / Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase">Staking Plan & Transactions</h2>
                    <p className="text-xs text-zinc-500 mt-1">Manage active on-chain staking pool and monitor user staking activity</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-white/5 transition-all flex items-center gap-2 text-xs font-semibold shadow-lg disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-accent", syncing && "animate-spin")} />
                        <span>{syncing ? "Syncing..." : "Deep Chain Sync"}</span>
                    </button>
                </div>
            </div>

            {/* Staking Plan Detail Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Layers className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Active Staking Plan</h3>
                </div>

                {activePlan ? (
                    <div className="rounded-3xl bg-[#0e0e0e] p-6 sm:p-8 border border-white/5 relative overflow-hidden transition-all hover:border-white/10 shadow-xl">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 relative z-10 items-center text-center sm:text-left">
                            
                            {/* Plan Level & Duration */}
                            <div className="space-y-1.5 lg:pr-6">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                    {formatDuration(activePlan.duration_seconds)}
                                </div>
                                <div className="text-2xl font-bold text-white">
                                    {(activePlan.name && activePlan.name !== 'Flexible' && !activePlan.name.startsWith('Level ')) ? activePlan.name : "GOLD"}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">
                                    Min Stake: {formatDecimal(activePlan.min_stake && activePlan.min_stake !== '100' && activePlan.min_stake !== '0' ? activePlan.min_stake : "1000", 0)} Trustive
                                </div>
                            </div>
                            
                            {/* APY */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-white/5">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Annual Yield</div>
                                <div className="text-2xl font-bold text-accent">
                                    {Number(activePlan.apy).toFixed(0)}% APY
                                </div>
                                <div className="text-xs text-emerald-400">Fixed Compound</div>
                            </div>
                            
                            {/* Status */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-white/5">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</div>
                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)] animate-pulse" />
                                    <span className="text-lg font-bold text-emerald-400">Active</span>
                                </div>
                                <div className="text-xs text-zinc-500">Open for staking</div>
                            </div>
                            
                            {/* Active Stakes */}
                            <div className="space-y-1.5 sm:px-6 sm:border-l border-white/5">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active Stakes</div>
                                <div className="text-2xl font-bold text-white">
                                    {stats?.active_stakes || 0}
                                </div>
                                <div className="text-xs text-zinc-400">
                                    {formatDecimal(stats?.total_staked || "0", 2, 2)} Trustive
                                </div>
                            </div>

                            {/* Contract Address / Info */}
                            <div className="space-y-1.5 lg:pl-6 lg:border-l border-white/5 flex flex-col justify-center">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contract Address</div>
                                <div className="flex items-center justify-center sm:justify-start gap-2">
                                    <span className="text-xs text-zinc-300 font-mono">
                                        {shortenAddress(STAKING_CONTRACT_ADDRESS)}
                                    </span>
                                    <button
                                        onClick={() => handleCopy(STAKING_CONTRACT_ADDRESS)}
                                        className="p-1 hover:text-white text-zinc-500 transition-colors cursor-pointer"
                                        title="Copy Address"
                                    >
                                        {copiedAddress === STAKING_CONTRACT_ADDRESS ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                    <a
                                        href={`https://sepolia.etherscan.io/address/${STAKING_CONTRACT_ADDRESS}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 hover:text-accent text-zinc-500 transition-colors"
                                        title="View on Etherscan"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                                <div className="text-[11px] text-zinc-500">Sepolia Testnet</div>
                            </div>

                        </div>
                    </div>
                ) : (
                    <div className="rounded-3xl bg-[#0e0e0e] p-8 border border-white/5 text-center text-zinc-500">
                        {plansLoading ? "Loading staking plan..." : "No active staking plan found on chain. Please click 'Deep Chain Sync'."}
                    </div>
                )}
            </div>

            {/* User Staking Transactions History Section */}
            <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 px-1">
                        <Activity className="w-4 h-4 text-accent" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">User Staking Transactions</h3>
                    </div>

                    {/* Search, Filter & CSV Export Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Status Filter Tabs */}
                        <div className="flex items-center bg-zinc-900/80 p-1 rounded-xl border border-white/5">
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
                                            ? "bg-accent text-black shadow-md"
                                            : "text-zinc-400 hover:text-white"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search by address or tx..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent/40 w-48 sm:w-64 transition-all"
                            />
                        </div>

                        {/* Export CSV Button */}
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl border border-white/5 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                            title="Export CSV"
                        >
                            <Download className="w-3.5 h-3.5 text-accent" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>
                </div>

                {/* Transactions Table Card */}
                <div className="rounded-3xl bg-[#0e0e0e] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[55rem]">
                            <thead>
                                <tr className="border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider bg-black/30">
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
                            <tbody className="divide-y divide-white/5 text-xs">
                                {stakesLoading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                                                <span>Loading staking records...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : stakes.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-zinc-500">
                                            No staking transactions found.
                                        </td>
                                    </tr>
                                ) : (
                                    stakes.map((tx, idx) => {
                                        // 'completed' means the lock expired but the tokens are
                                        // still staked - only 'unstaked' has left the contract
                                        const isClaimable = tx.status === "completed";
                                        const isActive = tx.status === "active";
                                        const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;

                                        return (
                                            <tr key={tx.id || idx} className="hover:bg-white/[0.02] transition-colors">
                                                {/* Index */}
                                                <td className="px-6 py-4 text-zinc-500 font-mono">
                                                    {rowNumber}
                                                </td>

                                                {/* User */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <div className="font-semibold text-white">
                                                            {tx.username || shortenAddress(tx.user_address)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-mono">
                                                            <span>{shortenAddress(tx.user_address)}</span>
                                                            <button
                                                                onClick={() => handleCopy(tx.user_address)}
                                                                className="hover:text-white transition-colors cursor-pointer"
                                                                title="Copy Wallet"
                                                            >
                                                                {copiedAddress === tx.user_address ? (
                                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Staked Amount */}
                                                <td className="px-6 py-4 text-right">
                                                    <div className="font-bold text-accent">
                                                        {formatDecimal(tx.amount, 2, 2)} Trustive
                                                    </div>
                                                </td>

                                                {/* Plan / APY */}
                                                <td className="px-6 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/5 text-zinc-300 font-medium text-[11px]">
                                                        <span>{tx.plan_name || `Level ${tx.plan_id || 1}`}</span>
                                                        <span className="text-accent font-bold">({tx.apy || activePlan?.apy || 8}%)</span>
                                                    </div>
                                                </td>

                                                {/* Staked Date */}
                                                <td className="px-6 py-4 text-center text-zinc-400 whitespace-nowrap text-[11px]">
                                                    {tx.start_at || tx.created_at ? formatDate(tx.start_at || tx.created_at) : "—"}
                                                </td>

                                                {/* Unlock Date */}
                                                <td className="px-6 py-4 text-center text-zinc-400 whitespace-nowrap text-[11px]">
                                                    {tx.end_at ? formatDate(tx.end_at) : "—"}
                                                </td>

                                                {/* Reward Claimed */}
                                                <td className="px-6 py-4 text-right font-medium">
                                                    {tx.reward_claimed && parseFloat(tx.reward_claimed) > 0 ? (
                                                        <span className="text-emerald-400">+{formatDecimal(tx.reward_claimed, 4, 2)} Trustive</span>
                                                    ) : (
                                                        <span className="text-zinc-600">0.00 Trustive</span>
                                                    )}
                                                </td>

                                                {/* Status */}
                                                <td className="px-6 py-4 text-center">
                                                    {isActive ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-[11px]">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Active
                                                        </span>
                                                    ) : isClaimable ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-semibold text-[11px]">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                                                            Claimable
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 font-semibold text-[11px]">
                                                            <CheckCircle2 className="w-3 h-3 text-zinc-400" />
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
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-white/5 bg-black/20 text-xs text-zinc-400">
                            <div>
                                Page {currentPage} of {totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 transition-colors cursor-pointer"
                                    title="First Page"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 transition-colors cursor-pointer"
                                    title="Previous Page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-3 py-1 bg-zinc-900 rounded-lg border border-white/5 font-semibold text-white">
                                    {currentPage}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 transition-colors cursor-pointer"
                                    title="Next Page"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 transition-colors cursor-pointer"
                                    title="Last Page"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
