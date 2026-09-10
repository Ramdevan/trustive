"use client";

import { useEffect, useState } from "react";
import {
    ShieldCheck,
    Plus,
    Search,
    ArrowRight,
    TrendingUp,
    Percent,
    Clock,
    Ban,
    CheckCircle2
} from "lucide-react";
import { cn, formatDate, shortenAddress, getFriendlyErrorMessage, formatDecimal } from "@/lib/utils";
import { CopyButton } from "@/components/CopyButton";

import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { XCircle } from "lucide-react";
import { toast } from "react-toastify";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import VestingDetailModal, { formatVestId, statusClasses, statusLabel } from "@/components/VestingDetailModal";
import type { VestingRecord as Vesting } from "@/components/VestingDetailModal";

export default function VestingManagement() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [activeTab, setActiveTab] = useState("growth");
    const [showCreate, setShowCreate] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [newVesting, setNewVesting] = useState({ beneficiary: "", amount: "", cliff: "", duration: "" });
    const [toggling, setToggling] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [localMultipleVesting, setLocalMultipleVesting] = useState<boolean | null>(null);

    const { address } = useAccount();
    const { sendTransactionAsync } = useSendTransaction();

    // Fetch Settings
    const { data: settingsData } = useQuery({
        queryKey: ["vesting-settings"],
        queryFn: () => apiRequest("/vesting/settings"),
        refetchInterval: 60000,
    });

    const multipleVestingEnabled = localMultipleVesting !== null ? localMultipleVesting : (settingsData?.multipleVesting || false);

    // Reset local state once the query data matches our target
    useEffect(() => {
        if (settingsData && settingsData.multipleVesting === localMultipleVesting) {
            setLocalMultipleVesting(null);
        }
    }, [settingsData?.multipleVesting, localMultipleVesting]);

    // Fetch Vestings (Fetch all for local filtering and pagination)
    const itemsPerPage = 5;
    const { data: vestingsData, isLoading: loading, refetch: refetchVestings } = useQuery({
        queryKey: ["vestings", searchTerm],
        queryFn: () => apiRequest(`/vestings?page=1&limit=1000&search=${searchTerm}`),
        refetchInterval: 15000,
    });

    const vestings: Vesting[] = vestingsData?.vestings || [];
    const selected = vestings.find(v => v.id === selectedId) ?? null;

    // With multiple vesting off the contract rejects a second vest() for the same
    // address, so flag it while the admin types instead of at the MetaMask prompt.
    const beneficiaryInput = newVesting.beneficiary.trim();
    const isAddressShaped = /^0x[a-fA-F0-9]{40}$/.test(beneficiaryInput);
    const existingVesting = isAddressShaped
        ? vestings.find(v => v.beneficiary.toLowerCase() === beneficiaryInput.toLowerCase()) ?? null
        : null;
    const duplicateBlocked = !multipleVestingEnabled && !!existingVesting;

    const handleDeepSync = async () => {
        setSyncing(true);
        toast.info("Scanning blockchain for vesting schedules...");
        try {
            const data = await apiRequest("/vesting/sync");
            if (data.status) {
                toast.success(data.msg);
                queryClient.invalidateQueries({ queryKey: ["vestings"] });
            } else {
                toast.error(data.msg || "Sync failed");
            }
        } catch (e) {
            // Error already handled by apiRequest
        } finally {
            setSyncing(false);
        }
    };

    const handleToggleMultiple = async () => {
        setToggling(true);
        const tid = toast.loading("Preparing transaction...");
        try {
            const data = await apiRequest("/vesting/settings/toggle", {
                method: 'POST',
                body: JSON.stringify({ enabled: !multipleVestingEnabled })
            });

            if (data.status) {
                toast.update(tid, { render: "Please confirm in wallet...", type: "info", isLoading: true });
                const hash = await sendTransactionAsync({
                    to: data.contractAddress as `0x${string}`,
                    data: data.calldata as `0x${string}`,
                });

                if (hash) {
                    toast.update(tid, { render: "Transaction sent! Waiting for confirmation...", type: "info", isLoading: true });

                    // Lock UI state locally to prevent flickering
                    setLocalMultipleVesting(!multipleVestingEnabled);

                    // Refetch background periodically to catch the change
                    const pollInterval = setInterval(() => {
                        queryClient.invalidateQueries({ queryKey: ["vesting-settings"] });
                    }, 4000);

                    // Clear polling after 30s as fallback
                    setTimeout(() => clearInterval(pollInterval), 30000);

                    toast.update(tid, { render: "Status update triggered!", type: "success", isLoading: false, autoClose: 3000 });
                }
            } else {
                toast.update(tid, { render: data.msg || "Failed to prepare transaction", type: "error", isLoading: false, autoClose: 3000 });
            }
        } catch (err: any) {
            toast.update(tid, { render: getFriendlyErrorMessage(err), type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setToggling(false);
        }
    };

    const handleCreateVesting = async () => {
        if (!newVesting.beneficiary || !newVesting.amount || !newVesting.cliff || !newVesting.duration) {
            return toast.warn("Please fill all fields");
        }
        if (!isAddressShaped) {
            return toast.warn("Enter a valid wallet address (0x followed by 40 hex characters)");
        }
        if (duplicateBlocked) {
            return toast.warn("This address already has a vesting schedule. Enable Multiple Vesting before vesting to it again.");
        }
        // Contract 1 unit = 2 real minutes. Admin enters units directly.
        const cliffPeriods = Number(newVesting.cliff);
        const durationPeriods = Number(newVesting.duration);
        if (cliffPeriods < 0 || durationPeriods < 1) {
            return toast.warn("Duration must be at least 1 unit (2 minutes)");
        }

        try {
            const data = await apiRequest("/vesting/add-on-chain", {
                method: 'POST',
                body: JSON.stringify({
                    beneficiary: beneficiaryInput,
                    amount: newVesting.amount,
                    cliffMonths: cliffPeriods,      // periods sent to contract
                    vestingMonths: durationPeriods   // periods sent to contract
                })
            });

            if (data.status) {
                const hash = await sendTransactionAsync({
                    to: data.contractAddress as `0x${string}`,
                    data: data.calldata as `0x${string}`,
                });

                if (hash) {
                    await apiRequest("/createVesting", {
                        method: 'POST',
                        body: JSON.stringify({
                            beneficiary: beneficiaryInput,
                            amount: newVesting.amount,
                            cliff_months: cliffPeriods,
                            vesting_months: durationPeriods,
                            tx_hash: hash
                        })
                    });
                    toast.success("Vesting created! Tx: " + hash.slice(0, 10) + "...");
                    setShowCreate(false);
                    setNewVesting({ beneficiary: "", amount: "", cliff: "", duration: "" });
                    queryClient.invalidateQueries({ queryKey: ["vestings"] });
                }
            } else {
                toast.error(data.msg || "Failed to prepare transaction");
            }
        } catch (err) {
            toast.error(getFriendlyErrorMessage(err));
        }
    };

    const filtered = vestings.filter(v => {
        const search = searchTerm.toLowerCase();
        const matchesSearch = v.beneficiary.toLowerCase().includes(search) ||
            (v.tx_hash && v.tx_hash.toLowerCase().includes(search));

        if (!matchesSearch) return false;

        // "Active Vesting" shows active, cliff, or claimable
        // "Claim History" shows fully claimed or revoked
        if (activeTab === "growth") {
            return v.display_status !== 'claimed' && v.display_status !== 'revoked';
        } else {
            return v.display_status === 'claimed' || v.display_status === 'revoked';
        }
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = filtered.slice(startIndex, startIndex + itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeTab]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleToggleMultiple}
                        disabled={toggling}
                        className={cn(
                            "group px-6 py-3 rounded-2xl border transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50",
                            multipleVestingEnabled
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_20px_-10px_rgba(16,185,129,0.3)]"
                                : "bg-red-500/10 border-red-500/20 text-red-500 shadow-[0_0_20px_-10px_rgba(239,68,68,0.3)]"
                        )}
                    >
                        <div className={cn(
                            "w-2 h-2 rounded-full transition-all animate-pulse",
                            multipleVestingEnabled
                                ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                                : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                        )} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                            {toggling ? "UPDATING..." : `MULTIPLE VESTING ${multipleVestingEnabled ? 'ENABLED' : 'DISABLED'}`}
                        </span>
                    </button>
                </div>
                <div className="flex items-center gap-3 self-end lg:self-center">

                    <button
                        onClick={handleDeepSync}
                        disabled={syncing}
                        className="px-6 py-3 bg-zinc-900 text-zinc-400 rounded-2xl border border-white/5 hover:border-accent/40 hover:text-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                        <TrendingUp className={cn("w-4 h-4", syncing && "animate-bounce")} />
                        {syncing ? "Syncing..." : "Deep Sync"}
                    </button>

                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="px-8 py-3 bg-accent text-black rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/10"
                    >
                        {showCreate ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showCreate ? "Close" : "New Vesting"}
                    </button>
                </div>
            </div>

            {/* Create Vesting Card */}
            {showCreate && (
                <div className="bg-sidebar rounded-[32px] border-2 border-accent/20 p-8 shadow-[0_0_50px_-12px_rgba(255,184,0,0.1)] animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                            <Plus className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white uppercase tracking-tight font-space-grotesk">Init New Trust</h3>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Deploy institutional vesting schedule to blockchain</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Beneficiary Address</label>
                            <input
                                type="text"
                                value={newVesting.beneficiary}
                                onChange={(e) => setNewVesting({ ...newVesting, beneficiary: e.target.value })}
                                placeholder="0x..."
                                className={cn(
                                    "w-full bg-black/40 border rounded-2xl px-6 py-4 text-white focus:outline-none transition-all font-mono text-xs font-bold placeholder:text-zinc-800",
                                    duplicateBlocked ? "border-red-500/50 focus:border-red-500" : "border-white/5 focus:border-accent/50"
                                )}
                            />
                            {duplicateBlocked && (
                                <p className="text-[10px] text-red-400 font-bold px-1 leading-relaxed">
                                    This address already has a vesting schedule and Multiple Vesting is disabled.
                                    Enable Multiple Vesting above, or use a different address.
                                </p>
                            )}
                            {beneficiaryInput && !isAddressShaped && (
                                <p className="text-[10px] text-red-400 font-bold px-1">Not a valid wallet address.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Total Allocated (Trustive)</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={newVesting.amount}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    // Only allow whole numbers
                                    if (val === '' || /^\d+$/.test(val)) {
                                        setNewVesting({ ...newVesting, amount: val });
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === '.' || e.key === ',') e.preventDefault();
                                }}
                                placeholder="E.g. 10000"
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-accent/50 transition-all font-bold placeholder:text-zinc-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                                Cliff Period (Units) <span className="text-accent/60 normal-case">— each unit = 2 mins</span>
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={newVesting.cliff}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                        setNewVesting({ ...newVesting, cliff: val });
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === '.' || e.key === ',') e.preventDefault();
                                }}
                                placeholder="E.g. 2 (= 4 minutes)"
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-accent/50 transition-all font-bold placeholder:text-zinc-800"
                            />
                            {newVesting.cliff && <p className="text-[10px] text-accent/70 px-1">→ Total cliff: {Number(newVesting.cliff) * 2} minutes</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                                Vesting Duration (Units) <span className="text-accent/60 normal-case">— each unit = 2 mins</span>
                            </label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={newVesting.duration}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                        setNewVesting({ ...newVesting, duration: val });
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === '.' || e.key === ',') e.preventDefault();
                                }}
                                placeholder="E.g. 6 (= 12 minutes)"
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-accent/50 transition-all font-bold placeholder:text-zinc-800"
                            />
                            {newVesting.duration && <p className="text-[10px] text-accent/70 px-1">→ Total vest: {Number(newVesting.duration) * 2} minutes</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleCreateVesting}
                            disabled={duplicateBlocked}
                            title={duplicateBlocked ? "This address already has a vesting schedule" : undefined}
                            className={cn(
                                "flex-1 bg-accent text-black font-black uppercase text-xs tracking-widest py-5 rounded-2xl transition-all shadow-xl shadow-accent/10",
                                duplicateBlocked
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:scale-[1.01] active:scale-95"
                            )}
                        >
                            VEST
                        </button>
                        <button
                            onClick={() => setShowCreate(false)}
                            className="px-8 py-5 border border-white/5 text-zinc-500 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-white/5 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-8">
                <div className="flex items-center gap-4 bg-sidebar/50 p-1 rounded-2xl border border-white/5">
                    <button
                        onClick={() => setActiveTab("growth")}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            activeTab === "growth" ? "bg-accent text-black shadow-lg" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        Active Vesting
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            activeTab === "history" ? "bg-accent text-black shadow-lg" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        Claim History
                    </button>
                </div>

                <div className="flex items-center gap-4">
                </div>
            </div>

            <div className="relative">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight font-space-grotesk ml-2">Vesting Assets</h3>
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input
                            type="text"
                            placeholder="Search by address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-sidebar/30 border border-white/5 rounded-2xl pl-12 pr-6 py-4 outline-none text-white text-xs font-bold transition-all placeholder:text-zinc-700 focus:border-accent/40"
                        />
                    </div>
                </div>

                <div className="bg-sidebar rounded-[32px] border border-white/5 overflow-hidden shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-accent">
                                    <th className="px-12 py-8 text-center text-xs font-black uppercase tracking-[0.2em] text-black w-28">S.No</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-[0.2em] text-black">ID</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-[0.2em] text-black">Beneficiary</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-[0.2em] text-black">Status</th>
                                    <th className="px-12 py-8 text-center text-xs font-black uppercase tracking-[0.2em] text-black">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03] bg-[#0A0908]">
                                {loading ? (
                                    <tr><td colSpan={5} className="px-8 py-20 text-center"><div className="animate-spin h-8 w-8 border-t-2 border-accent mx-auto rounded-full" /></td></tr>
                                ) : filtered.length > 0 ? (
                                    paginatedData.map((v, i) => (
                                        <tr key={v.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-12 py-8 text-center">
                                                <span className="text-white font-black text-base">{(currentPage - 1) * itemsPerPage + i + 1}</span>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <span className="text-white font-black text-base font-mono">{formatVestId(v)}</span>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-white font-bold text-base group-hover:text-accent transition-colors">{v.username || (v.beneficiary ? shortenAddress(v.beneficiary) : '—')}</span>
                                                    {v.beneficiary && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <span className="text-xs text-zinc-600 font-black tracking-widest uppercase font-mono">{shortenAddress(v.beneficiary)}</span>
                                                            <CopyButton text={v.beneficiary} label="Copy Beneficiary" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <span className={statusClasses(v.display_status)}>{statusLabel(v.display_status)}</span>
                                            </td>
                                            <td className="px-12 py-8 text-center">
                                                <button
                                                    onClick={() => setSelectedId(v.id)}
                                                    className="text-accent font-black text-xs uppercase tracking-widest hover:underline cursor-pointer"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-24 text-center text-zinc-700 font-medium italic">
                                            {activeTab === 'growth' ? 'No active vesting schedules found in network registry.' : 'No claim or revocation history found.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-xl bg-sidebar border border-white/5 text-zinc-500 disabled:opacity-30 hover:text-accent transition-all"
                        >
                            <ArrowRight className="w-5 h-5 rotate-180" />
                        </button>
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={cn(
                                    "w-10 h-10 rounded-xl text-xs font-black transition-all",
                                    currentPage === i + 1 ? "bg-accent text-black shadow-lg" : "bg-sidebar border border-white/5 text-zinc-500 hover:text-white"
                                )}
                            >
                                {i + 1}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-xl bg-sidebar border border-white/5 text-zinc-500 disabled:opacity-30 hover:text-accent transition-all"
                        >
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {selected && (
                <VestingDetailModal vesting={selected} onClose={() => setSelectedId(null)} />
            )}
        </div>
    );
}
