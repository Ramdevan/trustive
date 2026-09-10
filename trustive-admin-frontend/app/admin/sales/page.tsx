"use client";

import { useEffect, useState } from "react";
import {
    Plus,
    Trash2,
    Edit2,
    Eye,
    TrendingUp,
    Search,
    X,
    Clock,
    DollarSign,
    Box,
    Calendar,
    Target,
    Loader2,
    Info,
    Square
} from "lucide-react";
import { cn, formatDate, formatDecimal, formatInputDecimal } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { apiRequest } from "@/lib/api-client";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";

interface Sale {
    id: number;
    type: string;
    name: string;
    token_quantity: string;
    price: string;
    minimum_purchase: string;
    maximum_purchase: string;
    start_at: string;
    end_at: string;
    status: string;
    computed_status: string;
    total_tokens_sold: number;
    available_tokens: number;
}

export default function SalesManagement() {
    const queryClient = useQueryClient();
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);
    const [editForm, setEditForm] = useState({ quantity: "" });
    const [isNewPhaseOpen, setIsNewPhaseOpen] = useState(false);
    const [isCreatingPhase, setIsCreatingPhase] = useState(false);
    const [isUpdatingPhase, setIsUpdatingPhase] = useState(false);
    const [isDeletingPhase, setIsDeletingPhase] = useState(false);
    const [isStoppingPhase, setIsStoppingPhase] = useState(false);
    const [newPhaseForm, setNewPhaseForm] = useState({
        type: "PRESALE",
        name: "",
        quantity: "",
        minimum: "",
        maximum: "",
        start_at: "",
        end_at: ""
    });

    const { data: salesData, isLoading: loading } = useQuery({
        queryKey: ["sales-phases"],
        queryFn: () => apiRequest("/getAllActiveSales"),
        refetchInterval: 15000,
    });

    const { data: settingsData } = useQuery({
        queryKey: ["settings"],
        queryFn: () => apiRequest("/payment-settings"),
        refetchInterval: 30000,
    });

    const tokenAddress = (settingsData?.settings?.contract_address || "0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D") as `0x${string}`;
    const icoAddress = (settingsData?.settings?.ico_contract || "0x8Ab0caB366B23Dcb88ceA447312CCb103B138cFa") as `0x${string}`;

    // Read live on-chain token balance of the ICO smart contract
    const { data: onChainICOBalanceWei } = useReadContract({
        address: tokenAddress,
        abi: [
            {
                inputs: [{ internalType: "address", name: "account", type: "address" }],
                name: "balanceOf",
                outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                stateMutability: "view",
                type: "function"
            }
        ] as const,
        functionName: "balanceOf",
        args: [icoAddress],
        query: {
            enabled: Boolean(tokenAddress && icoAddress),
            refetchInterval: 10000,
        }
    });

    const onChainICOBalance = onChainICOBalanceWei !== undefined && onChainICOBalanceWei !== null
        ? parseFloat(formatUnits(onChainICOBalanceWei, 18))
        : null;

    const availableIcoBalance: number | null = (onChainICOBalance !== null && onChainICOBalance > 0)
        ? onChainICOBalance
        : (salesData?.ico_balance !== undefined && salesData?.ico_balance !== null ? Number(salesData.ico_balance) : null);

    const sales: Sale[] = salesData?.sales || [];

    const handleDelete = async (id: number) => {
        if (isDeletingPhase) return;
        setIsDeletingPhase(true);
        try {
            const data = await apiRequest(`/deleteSale`, { 
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (data.status) {
                toast.success("Phase deleted");
                queryClient.invalidateQueries({ queryKey: ["sales-phases"] });
            } else {
                toast.error(data.msg || "Delete failed");
            }
        } catch (err: any) {
            toast.error(err?.message || "Delete failed");
        } finally {
            setIsDeletingPhase(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSale || isUpdatingPhase) return;

        const qtyNum = Number(editForm.quantity);
        if (availableIcoBalance !== null && qtyNum > availableIcoBalance) {
            toast.error(`Allocated tokens (${formatDecimal(qtyNum, 5)} Trustive) cannot exceed the available tokens in the ICO contract (${formatDecimal(availableIcoBalance, 5)} Trustive)`);
            return;
        }

        setIsUpdatingPhase(true);
        try {
            const payload = {
                id: editingSale.id,
                type: editingSale.type || "PRESALE",
                name: editingSale.name,
                quantity: editForm.quantity,
                minimum: editingSale.minimum_purchase,
                maximum: editingSale.maximum_purchase,
                price: editingSale.price,
                status: editingSale.status,
                start_at: editingSale.start_at,
                end_at: editingSale.end_at,
            };
            const data = await apiRequest("/updateSale", {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (data.status) {
                toast.success("Phase updated");
                queryClient.invalidateQueries({ queryKey: ["sales-phases"] });
                setEditingSale(null);
            } else {
                toast.error(data.msg || "Update failed");
            }
        } catch (err: any) {
            toast.error(err?.message || "Update failed");
        } finally {
            setIsUpdatingPhase(false);
        }
    };

    const handleForceStop = async (saleId: number) => {
        if (isStoppingPhase) return;
        if (!(await confirmAction("Are you sure you want to force stop this live sale phase immediately? This will end the phase now and start the countdown for the next scheduled sale (or show no active sale)."))) {
            return;
        }

        setIsStoppingPhase(true);
        try {
            const data = await apiRequest("/forceStopSale", {
                method: 'POST',
                body: JSON.stringify({ id: saleId })
            });
            if (data.status) {
                toast.success("Sale phase stopped immediately");
                queryClient.invalidateQueries({ queryKey: ["sales-phases"] });
                queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
                setEditingSale(null);
            } else {
                toast.error(data.msg || "Failed to stop sale phase");
            }
        } catch (err: any) {
            toast.error(err?.message || "Failed to stop sale phase");
        } finally {
            setIsStoppingPhase(false);
        }
    };

    const handleCreatePhase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isCreatingPhase) return;

        const qtyNum = Number(newPhaseForm.quantity);
        const minNum = Number(newPhaseForm.minimum);
        const maxNum = Number(newPhaseForm.maximum);

        if (isNaN(minNum) || minNum <= 0) {
            toast.error("Minimum purchase must be greater than 0");
            return;
        }
        if (isNaN(maxNum) || maxNum <= minNum) {
            toast.error("Maximum purchase must be greater than minimum purchase");
            return;
        }
        if (isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Allocated tokens must be greater than 0");
            return;
        }
        if (minNum > qtyNum) {
            toast.error(`Minimum purchase (${minNum.toLocaleString()} Trustive) cannot exceed phase allocation (${qtyNum.toLocaleString()} Trustive)`);
            return;
        }
        if (maxNum > qtyNum) {
            toast.error(`Maximum purchase (${maxNum.toLocaleString()} Trustive) cannot exceed phase allocation (${qtyNum.toLocaleString()} Trustive)`);
            return;
        }
        if (new Date(newPhaseForm.start_at) >= new Date(newPhaseForm.end_at)) {
            toast.error("End date & time must be after start date & time");
            return;
        }

        if (availableIcoBalance !== null && qtyNum > availableIcoBalance) {
            toast.error(`Allocated tokens (${formatDecimal(qtyNum, 5)} Trustive) cannot exceed the available tokens in the ICO contract (${formatDecimal(availableIcoBalance, 5)} Trustive)`);
            return;
        }

        setIsCreatingPhase(true);
        try {
            const data = await apiRequest("/createSale", {
                method: 'POST',
                body: JSON.stringify({
                    ...newPhaseForm,
                    type: "PRESALE"
                })
            });
            if (data.status) {
                toast.success("New phase created");
                queryClient.invalidateQueries({ queryKey: ["sales-phases"] });
                setIsNewPhaseOpen(false);
                setNewPhaseForm({
                    type: "PRESALE", name: "", quantity: "", minimum: "", maximum: "", start_at: "", end_at: ""
                });
            } else {
                toast.error(data.msg || "Creation failed");
            }
        } catch (err: any) {
            toast.error(err?.message || "Creation failed");
        } finally {
            setIsCreatingPhase(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 relative">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIsNewPhaseOpen(true)}
                    className="bg-accent hover:opacity-90 text-black px-8 py-3 rounded-full flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-accent/10 hover:scale-105 active:scale-95 cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    New Phase
                </button>
            </div>

            {/* ── Active Phases Table ── */}
            <div className="space-y-6">
                <h3 className="text-white font-bold text-lg px-2">Active Phases</h3>

                <div className="bg-[#0A0908] rounded-[32px] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-accent text-black">
                                    <th className="px-12 py-8 text-center text-xs font-black uppercase tracking-widest rounded-tl-[32px]">Phase</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-widest">Allocation</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-widest">Purchased</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-widest">Available</th>
                                    <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-widest">Status</th>
                                    <th className="px-12 py-8 text-center text-xs font-black uppercase tracking-widest rounded-tr-[32px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {sales.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-10 py-24 text-center text-zinc-600 font-medium italic">No phases found in system ledger.</td>
                                    </tr>
                                ) : sales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-12 py-8 text-center">
                                            <span className="text-zinc-400 font-bold text-xl tracking-tight group-hover:text-white transition-colors uppercase font-space-grotesk">{sale.name}</span>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-lg tracking-tighter">{formatDecimal(sale.token_quantity, 5)}</span>
                                                <span className="text-xs text-zinc-600 font-black uppercase tracking-[0.2em] mt-1">Tokens</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex flex-col">
                                                <span className="text-accent font-bold text-lg tracking-tighter">{formatDecimal(sale.total_tokens_sold, 5)}</span>
                                                <span className="text-xs text-zinc-600 font-black uppercase tracking-[0.2em] mt-1">Sold</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-lg tracking-tighter">{formatDecimal(sale.available_tokens, 5)}</span>

                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <span className={cn(
                                                "px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-all",
                                                sale.computed_status === 'active'
                                                    ? "bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                                                    : "bg-zinc-800 text-zinc-500 border-zinc-700/30"
                                            )}>
                                                {sale.computed_status}
                                            </span>
                                        </td>
                                        <td className="px-12 py-8">
                                            <div className="flex items-center justify-center gap-4">
                                                <button
                                                    onClick={() => setSelectedSale(sale)}
                                                    className="p-3 bg-zinc-900 border border-white/5 text-zinc-500 hover:text-accent hover:border-accent/20 rounded-xl transition-all shadow-sm cursor-pointer"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingSale(sale);
                                                        setEditForm({
                                                             quantity: formatInputDecimal(sale.token_quantity, 5)
                                                        });
                                                    }}
                                                    className="p-3 bg-zinc-900 border border-white/5 text-zinc-500 hover:text-blue-400 hover:border-blue-400/20 rounded-xl transition-all shadow-sm cursor-pointer"
                                                    title={sale.computed_status === 'ended' || sale.status === 'ended' ? "View / Edit Settings" : "Edit Phase"}
                                                >
                                                    <Edit2 className="w-5 h-5" />
                                                </button>
                                                <button
                                                    disabled={sale.computed_status === 'active' || isDeletingPhase}
                                                    onClick={async () => {
                                                        if (sale.computed_status === 'active') return;
                                                        if (await confirmAction("Are you sure you want to permanently delete this sale phase?")) {
                                                            handleDelete(sale.id);
                                                        }
                                                    }}
                                                    className={cn(
                                                        "p-3 bg-zinc-900 border rounded-xl transition-all shadow-sm",
                                                        sale.computed_status === 'active'
                                                            ? "border-white/5 text-zinc-700 cursor-not-allowed opacity-30"
                                                            : "border-white/5 text-zinc-500 hover:text-red-500 hover:border-red-500/20 cursor-pointer"
                                                    )}
                                                    title={sale.computed_status === 'active' ? "Cannot delete an active live phase" : "Delete Phase"}
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── View Details Modal ── */}
            {(() => {
                const activeSale = sales.find(s => s.id === selectedSale?.id) || selectedSale;
                if (!activeSale) return null;

                const progressPercent = Number(activeSale.token_quantity) > 0
                    ? Math.min(100, Math.max(0, (activeSale.total_tokens_sold / Number(activeSale.token_quantity)) * 100))
                    : 0;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-[#0A0908] w-full max-w-4xl rounded-[40px] border border-white/10 overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                            {/* Modal Header */}
                            <div className="p-10 flex items-center justify-between">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-1.5 h-10 bg-accent rounded-full shrink-0" />
                                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tighter uppercase font-space-grotesk truncate">{activeSale.name}</h2>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <span className={cn(
                                        "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                        activeSale.computed_status === 'active' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700/30"
                                    )}>
                                        {activeSale.computed_status}
                                    </span>
                                    <button
                                        onClick={() => setSelectedSale(null)}
                                        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-all shadow-inner cursor-pointer"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="px-10 pb-10 space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Pricing & Limits Card */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8 space-y-6 flex flex-col justify-between overflow-hidden">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-accent/10 rounded-lg text-accent border border-accent/20">
                                                <DollarSign className="w-4 h-4" />
                                            </div>
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Pricing & Limits</span>
                                        </div>

                                        <div className="space-y-1 min-w-0">
                                            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Token Quantity</p>
                                            <p className="text-2xl sm:text-3xl font-black text-accent tracking-tight font-space-grotesk break-all">
                                                {formatDecimal(activeSale.token_quantity, 5)}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                            <div className="space-y-1 min-w-0">
                                                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Min Purchase</p>
                                                <p className="text-lg sm:text-xl font-bold text-white tracking-tight break-all">
                                                    {formatDecimal(activeSale.minimum_purchase, 5)} Trustive
                                                </p>
                                            </div>
                                            <div className="space-y-1 text-right min-w-0">
                                                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Max Purchase</p>
                                                <p className="text-lg sm:text-xl font-bold text-white tracking-tight break-all">
                                                    {formatDecimal(activeSale.maximum_purchase, 5)} Trustive
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Token Availability Card */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8 space-y-6 flex flex-col justify-between overflow-hidden">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-accent/10 rounded-lg text-accent border border-accent/20">
                                                <Box className="w-4 h-4" />
                                            </div>
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Token Availability</span>
                                        </div>

                                        <div className="space-y-1 min-w-0">
                                            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Available Tokens</p>
                                            <p className="text-2xl sm:text-3xl font-black text-accent tracking-tight font-space-grotesk break-all">
                                                {formatDecimal(activeSale.available_tokens, 5)}
                                            </p>
                                        </div>

                                        <div className="space-y-3 pt-2 border-t border-white/5">
                                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                                <span className="text-zinc-600">Sale Progress</span>
                                                <span className="text-white">{progressPercent.toFixed(2)}%</span>
                                            </div>
                                            <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                                <div
                                                    className="h-full bg-accent shadow-[0_0_15px_theme(colors.accent)] transition-all duration-1000"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Phase Schedule Card */}
                                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8">
                                    <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-16">
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="p-3 bg-accent/10 rounded-2xl text-accent border border-accent/20">
                                                <Calendar className="w-5 h-5" />
                                            </div>
                                            <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-space-grotesk">Phase Schedule</span>
                                        </div>

                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="flex items-center gap-4">
                                                <Clock className="w-5 h-5 text-zinc-500" />
                                                <div>
                                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Start Time</p>
                                                    <p className="text-sm font-bold text-white tracking-tight">{formatDate(activeSale.start_at)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Clock className="w-5 h-5 text-zinc-500" />
                                                <div>
                                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">End Time</p>
                                                    <p className="text-sm font-bold text-white tracking-tight">{formatDate(activeSale.end_at)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="flex justify-center pt-4">
                                    <button
                                        onClick={() => setSelectedSale(null)}
                                        className="px-12 py-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 text-zinc-400 hover:text-white rounded-full text-xs font-black uppercase tracking-[0.3em] transition-all shadow-lg cursor-pointer"
                                    >
                                        Close Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Edit Settings Modal ── */}
            {editingSale && (() => {
                const isEnded = editingSale.computed_status === 'ended' || editingSale.status === 'ended';
                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <form onSubmit={handleUpdate} className="bg-[#0A0908] w-full max-w-sm rounded-[32px] border border-white/10 overflow-hidden shadow-2xl">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold text-white tracking-tight">Edit Settings</h2>
                                    {isEnded && (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 border border-zinc-700/40">
                                            Ended
                                        </span>
                                    )}
                                </div>
                                <button type="button" onClick={() => setEditingSale(null)} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Token Allocation</label>
                                        {availableIcoBalance !== null && !isEnded && (
                                            <span className="text-[9px] text-[#E5B258] font-bold">
                                                Max: {formatDecimal(availableIcoBalance, 5)}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        disabled={isEnded}
                                        value={editForm.quantity}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                                        className={cn(
                                            "w-full border rounded-xl px-4 py-3 text-white font-mono transition-colors",
                                            isEnded
                                                ? "bg-white/[0.02] border-white/5 text-zinc-500 cursor-not-allowed opacity-60"
                                                : "bg-white/5 border-white/10 focus:outline-none focus:border-accent"
                                        )}
                                        placeholder="Enter total tokens"
                                    />
                                    {isEnded && (
                                        <p className="text-[10px] text-zinc-500 font-medium">This phase has ended and its configuration is locked.</p>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block">Start Date</label>
                                        <p className="text-sm font-medium text-zinc-400 px-1">{formatDate(editingSale.start_at)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block text-right">End Date</label>
                                        <p className="text-sm font-medium text-zinc-400 px-1 text-right">{formatDate(editingSale.end_at)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        disabled={isUpdatingPhase || isDeletingPhase || isStoppingPhase}
                                        onClick={() => setEditingSale(null)}
                                        className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isEnded || isUpdatingPhase || isDeletingPhase || isStoppingPhase}
                                        className={cn(
                                            "flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                                            isEnded
                                                ? "bg-zinc-800 text-zinc-500 border border-zinc-700/30 cursor-not-allowed opacity-40 shadow-none"
                                                : "bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-black cursor-pointer"
                                        )}
                                        title={isEnded ? "Cannot update a completed sale phase" : "Update"}
                                    >
                                        {isUpdatingPhase && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {isUpdatingPhase ? "Updating..." : "Update"}
                                    </button>
                                </div>
                            {(editingSale.computed_status === 'active' || editingSale.status === 'active') && (
                                <button
                                    type="button"
                                    disabled={isStoppingPhase || isUpdatingPhase || isDeletingPhase}
                                    onClick={() => handleForceStop(editingSale.id)}
                                    className="w-full py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-500/5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Force stop this live sale immediately"
                                >
                                    {isStoppingPhase ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-red-500" />}
                                    Force Stop Live Sale
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={editingSale.computed_status === 'active' || isDeletingPhase || isUpdatingPhase || isStoppingPhase}
                                onClick={async () => {
                                    if (editingSale.computed_status === 'active') return;
                                    if (await confirmAction("Are you sure you want to permanently delete this scheduled phase?")) {
                                        await handleDelete(editingSale.id);
                                        setEditingSale(null);
                                    }
                                }}
                                className={cn(
                                    "w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                                    editingSale.computed_status === 'active'
                                        ? "bg-red-500/5 text-red-500/30 border border-red-500/10 cursor-not-allowed opacity-40"
                                        : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 cursor-pointer shadow-sm active:scale-[0.98]"
                                )}
                                title={editingSale.computed_status === 'active' ? "Cannot delete an active live phase" : "Delete Phase"}
                            >
                                {isDeletingPhase ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {editingSale.computed_status === 'active' ? "Cannot Delete Live Phase" : "Delete Phase"}
                            </button>
                        </div>
                    </form>
                </div>
            ); })()}

            {/* ── Initialize New Phase Modal ── */}
            {isNewPhaseOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <form onSubmit={handleCreatePhase} className="bg-[#0A0908] w-full max-w-2xl rounded-[40px] border border-white/10 overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-8 bg-accent rounded-full" />
                                <h2 className="text-2xl font-extrabold text-white tracking-tight uppercase font-space-grotesk">Initialize New Phase</h2>
                            </div>
                            <button
                                type="button"
                                disabled={isCreatingPhase}
                                onClick={() => setIsNewPhaseOpen(false)}
                                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white disabled:opacity-50 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {/* Phase Name (Full Width) */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Phase Name</label>
                                <input
                                    type="text"
                                    required
                                    disabled={isCreatingPhase}
                                    placeholder="e.g. Presale Round 1"
                                    value={newPhaseForm.name}
                                    onChange={(e) => setNewPhaseForm(p => ({ ...p, name: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:border-accent outline-none disabled:opacity-50"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Allocated Tokens</label>
                                    </div>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        disabled={isCreatingPhase}
                                        placeholder="e.g. 50000"
                                        value={newPhaseForm.quantity}
                                        onChange={(e) => setNewPhaseForm(p => ({ ...p, quantity: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:border-accent outline-none disabled:opacity-50 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Min Purchase (Trustive)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        disabled={isCreatingPhase}
                                        placeholder="100"
                                        value={newPhaseForm.minimum}
                                        onChange={(e) => setNewPhaseForm(p => ({ ...p, minimum: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:border-accent outline-none disabled:opacity-50 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Max Purchase (Trustive)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        disabled={isCreatingPhase}
                                        placeholder="5000"
                                        value={newPhaseForm.maximum}
                                        onChange={(e) => setNewPhaseForm(p => ({ ...p, maximum: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:border-accent outline-none disabled:opacity-50 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Start Date & Time</label>
                                    <div className="relative cursor-pointer" onClick={(e) => {
                                        const input = e.currentTarget.querySelector('input');
                                        if (input) { try { (input as any).showPicker(); } catch (_) { input.focus(); } }
                                    }}>
                                        <input
                                            type="datetime-local"
                                            required
                                            disabled={isCreatingPhase}
                                            value={newPhaseForm.start_at}
                                            onChange={(e) => setNewPhaseForm(p => ({ ...p, start_at: e.target.value }))}
                                            onClick={(e) => { try { (e.currentTarget as any).showPicker(); } catch (_) { } }}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-5 pr-12 py-4 text-white focus:border-accent outline-none disabled:opacity-50 cursor-pointer"
                                        />
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-white">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">End Date & Time</label>
                                    <div className="relative cursor-pointer" onClick={(e) => {
                                        const input = e.currentTarget.querySelector('input');
                                        if (input) { try { (input as any).showPicker(); } catch (_) { input.focus(); } }
                                    }}>
                                        <input
                                            type="datetime-local"
                                            required
                                            disabled={isCreatingPhase}
                                            value={newPhaseForm.end_at}
                                            onChange={(e) => setNewPhaseForm(p => ({ ...p, end_at: e.target.value }))}
                                            onClick={(e) => { try { (e.currentTarget as any).showPicker(); } catch (_) { } }}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-5 pr-12 py-4 text-white focus:border-accent outline-none disabled:opacity-50 cursor-pointer"
                                        />
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-white">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-white/[0.02] border-t border-white/5 flex gap-4">
                            <button
                                type="button"
                                disabled={isCreatingPhase}
                                onClick={() => setIsNewPhaseOpen(false)}
                                className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isCreatingPhase}
                                className="flex-1 px-8 py-4 bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isCreatingPhase && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isCreatingPhase ? "Deploying Phase..." : "Deploy Phase"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
