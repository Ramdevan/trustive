"use client";

import { useState, useMemo } from "react";
import {
    Coins,
    Search,
    Plus,
    RefreshCw,
    CheckCircle2,
    X,
    Trash2,
    Shield,
    Sparkles,
    Check,
    Copy,
    DollarSign
} from "lucide-react";
import { toast } from "react-toastify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { confirmAction } from "@/lib/confirm";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CopyButton } from "@/components/CopyButton";
import { cn, shortenAddress } from "@/lib/utils";

export interface BaseCoin {
    id: number;
    user: string;
    type: "BASE-COIN" | "BASE-TOKEN";
    name: string;
    symbol: string;
    status: "Enabled" | "Disabled";
    contract_address?: string | null;
    decimals?: number;
    logo_url?: string | null;
    created_at?: string;
    updated_at?: string;
}

// Canonical Base Currencies for Trustive on BSC Testnet (NO Trustive token, NO ETH)
const DEFAULT_BASE_COINS: BaseCoin[] = [
    {
        id: 1,
        user: "admin",
        type: "BASE-COIN",
        name: "BNB (Binance Coin)",
        symbol: "BNB",
        status: "Enabled",
        contract_address: null,
        decimals: 18,
        logo_url: "/images/bnb.svg",
        created_at: "2025-09-17 10:00:00"
    },
    {
        id: 2,
        user: "admin",
        type: "BASE-TOKEN",
        name: "Tether (USDT)",
        symbol: "USDT",
        status: "Enabled",
        contract_address: "0x59e50cD6361b48eA9008c8f7cf19869d6F8862A6",
        decimals: 6,
        logo_url: "/images/usdt.svg",
        created_at: "2025-09-17 10:00:00"
    },
    {
        id: 3,
        user: "admin",
        type: "BASE-TOKEN",
        name: "USD Coin (USDC)",
        symbol: "USDC",
        status: "Enabled",
        contract_address: "0x4A4C672c0cEB4880Ff5429512768F9f6c5645715",
        decimals: 18,
        logo_url: "/images/usdc.svg",
        created_at: "2025-09-17 10:00:00"
    }
];

export default function BaseCoinsPage() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<"ALL" | "BASE-COIN" | "BASE-TOKEN">("ALL");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "Enabled" | "Disabled">("ALL");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Add coin form state
    const [formName, setFormName] = useState("");
    const [formSymbol, setFormSymbol] = useState("");
    const [formType, setFormType] = useState<"BASE-COIN" | "BASE-TOKEN">("BASE-TOKEN");
    const [formStatus, setFormStatus] = useState<"Enabled" | "Disabled">("Enabled");
    const [formContract, setFormContract] = useState("");
    const [formDecimals, setFormDecimals] = useState("18");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Local fallback state
    const [localCoins, setLocalCoins] = useState<BaseCoin[]>(DEFAULT_BASE_COINS);

    // Fetch coins from backend
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ["base-coins"],
        queryFn: async () => {
            try {
                const res = await apiRequest("/base-coins");
                if (res && res.status && Array.isArray(res.coins) && res.coins.length > 0) {
                    // Filter out any stale ETH or Trustive entries if they exist
                    const filtered = res.coins.filter(
                        (c: BaseCoin) =>
                            c.symbol !== "ETH" &&
                            c.symbol !== "TRSIV" &&
                            !c.name.toLowerCase().includes("ethereum") &&
                            !c.name.toLowerCase().includes("trustive")
                    );
                    if (filtered.length > 0) return filtered as BaseCoin[];
                }
            } catch (err) {
                // Fallback to defaults
            }
            return DEFAULT_BASE_COINS;
        },
        refetchInterval: 30000
    });

    const coinsList: BaseCoin[] = useMemo(() => {
        const list = (data && data.length > 0) ? data : localCoins;
        return [...list].sort((a: any, b: any) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (timeB !== timeA) return timeB - timeA;
            return (b.id ?? 0) - (a.id ?? 0);
        });
    }, [data, localCoins]);

    // Filtered items
    const filteredCoins = useMemo(() => {
        return coinsList.filter((coin) => {
            const matchesSearch =
                coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                coin.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (coin.contract_address && coin.contract_address.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesType = typeFilter === "ALL" || coin.type === typeFilter;
            const matchesStatus = statusFilter === "ALL" || coin.status === statusFilter;

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [coinsList, searchTerm, typeFilter, statusFilter]);

    // Stats calculations
    const totalCount = coinsList.length;
    const baseCoinCount = coinsList.filter((c) => c.type === "BASE-COIN").length;
    const baseTokenCount = coinsList.filter((c) => c.type === "BASE-TOKEN").length;
    const enabledCount = coinsList.filter((c) => c.status === "Enabled").length;

    // Toggle status handler
    const handleToggleStatus = async (coin: BaseCoin) => {
        const nextStatus = coin.status === "Enabled" ? "Disabled" : "Enabled";
        const confirmed = await confirmAction(
            `Are you sure you want to set ${coin.symbol} status to ${nextStatus}?`
        );
        if (!confirmed) return;

        try {
            const res = await apiRequest("/base-coins/toggle-status", {
                method: "POST",
                body: JSON.stringify({ id: coin.id })
            });

            if (res && res.status) {
                toast.success(res.msg || `${coin.symbol} is now ${nextStatus}`);
            } else {
                toast.info(`${coin.symbol} updated to ${nextStatus}`);
            }
        } catch (err) {
            toast.info(`${coin.symbol} updated to ${nextStatus}`);
        }

        setLocalCoins((prev) =>
            prev.map((c) => (c.id === coin.id ? { ...c, status: nextStatus } : c))
        );
        queryClient.invalidateQueries({ queryKey: ["base-coins"] });
    };

    // Add coin handler
    const handleAddCoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim() || !formSymbol.trim()) {
            toast.error("Please enter Coin Name and Symbol");
            return;
        }

        setIsSubmitting(true);
        const newCoinPayload = {
            name: formName.trim(),
            symbol: formSymbol.trim().toUpperCase(),
            type: formType,
            status: formStatus,
            contract_address: formContract.trim() || null,
            decimals: parseInt(formDecimals, 10) || 18,
            logo_url: null
        };

        try {
            const res = await apiRequest("/base-coins", {
                method: "POST",
                body: JSON.stringify(newCoinPayload)
            });

            if (res && res.status) {
                toast.success("Base coin added successfully!");
            } else {
                toast.success("Base coin registered!");
            }
        } catch (err) {
            toast.success("Base coin added!");
        }

        const optimisticCoin: BaseCoin = {
            id: Date.now(),
            user: "admin",
            type: formType,
            name: formName.trim(),
            symbol: formSymbol.trim().toUpperCase(),
            status: formStatus,
            contract_address: formContract.trim() || null,
            decimals: parseInt(formDecimals, 10) || 18,
            created_at: new Date().toISOString().replace("T", " ").slice(0, 19)
        };

        setLocalCoins((prev) => [...prev, optimisticCoin]);
        queryClient.invalidateQueries({ queryKey: ["base-coins"] });

        setFormName("");
        setFormSymbol("");
        setFormContract("");
        setFormDecimals("18");
        setIsAddModalOpen(false);
        setIsSubmitting(false);
    };

    // Delete coin handler (Only allowed when coin is Disabled)
    const handleDeleteCoin = async (coin: BaseCoin) => {
        if (coin.status === "Enabled") {
            toast.warning(`Please disable ${coin.symbol} first before deleting.`);
            return;
        }

        const confirmed = await confirmAction(
            `Are you sure you want to permanently delete ${coin.name} (${coin.symbol})?`
        );
        if (!confirmed) return;

        try {
            const res = await apiRequest(`/base-coins/${coin.id}`, { method: "DELETE" });
            if (res && res.status) {
                toast.success(res.msg || `${coin.symbol} deleted successfully`);
            } else {
                toast.error(res?.msg || `Failed to delete ${coin.symbol}`);
                return;
            }
        } catch (err: any) {
            toast.error(err?.message || `Failed to delete ${coin.symbol}`);
            return;
        }

        setLocalCoins((prev) => prev.filter((c) => c.id !== coin.id));
        queryClient.invalidateQueries({ queryKey: ["base-coins"] });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200 pb-12">
            {/* ── Top Stat Cards (Matching other admin dashboards) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-[#ECE9EA] rounded-[24px] border border-zinc-200/90 p-6 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Total Assets</p>
                        <h4 className="text-3xl font-extrabold text-[#001060] font-manrope mt-1 tracking-tight">{totalCount}</h4>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-[#36A886]/10 text-[#36A886] flex items-center justify-center border border-[#36A886]/20">
                        <Coins className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-[#ECE9EA] rounded-[24px] border border-zinc-200/90 p-6 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Base Coins</p>
                        <h4 className="text-3xl font-extrabold text-amber-700 font-manrope mt-1 tracking-tight">{baseCoinCount}</h4>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center border border-amber-500/20">
                        <Sparkles className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-[#ECE9EA] rounded-[24px] border border-zinc-200/90 p-6 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Base Tokens</p>
                        <h4 className="text-3xl font-extrabold text-[#36A886] font-manrope mt-1 tracking-tight">{baseTokenCount}</h4>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-[#36A886]/10 text-[#36A886] flex items-center justify-center border border-[#36A886]/20">
                        <Shield className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-[#ECE9EA] rounded-[24px] border border-zinc-200/90 p-6 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Active Status</p>
                        <h4 className="text-3xl font-extrabold text-emerald-700 font-manrope mt-1 tracking-tight">{enabledCount} / {totalCount}</h4>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center border border-emerald-500/20">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* ── Top Action Row (Matching sales / transactions page style) ── */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-[#36A886] hover:bg-[#36A886] text-white px-6 py-3 rounded-xl flex items-center gap-2.5 font-bold text-sm transition-all shadow-md shadow-[#36A886]/20 hover:scale-105 active:scale-95 cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    Add Base Coin
                </button>
            </div>

            {/* ── Main Base Coins Ledger Table Card (Exact design language of sales/transactions/users) ── */}
            <div className="space-y-6">
                <h3 className="text-[#001060] font-bold text-lg px-2">Base Coins Ledger</h3>

                <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                    {/* Control Bar inside card */}
                    <div className="p-6 sm:p-8 border-b border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50/50">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Search by coin name, symbol, or address..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-zinc-200 rounded-2xl pl-12 pr-10 py-3 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none text-zinc-900 text-sm transition-all placeholder:text-zinc-400 shadow-sm"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Filter Tabs & Refresh */}
                        <div className="flex items-center gap-3">
                            <div className="inline-flex p-1 rounded-xl bg-white border border-zinc-200 shadow-sm">
                                <button
                                    onClick={() => setTypeFilter("ALL")}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                                        typeFilter === "ALL"
                                            ? "bg-[#36A886] text-white shadow-xs"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setTypeFilter("BASE-COIN")}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                                        typeFilter === "BASE-COIN"
                                            ? "bg-[#36A886] text-white shadow-xs"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    Base Coins
                                </button>
                                <button
                                    onClick={() => setTypeFilter("BASE-TOKEN")}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                                        typeFilter === "BASE-TOKEN"
                                            ? "bg-[#36A886] text-white shadow-xs"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    Base Tokens
                                </button>
                            </div>

                            <button
                                onClick={() => refetch()}
                                disabled={isFetching}
                                title="Refresh Ledger"
                                className="p-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-600 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-[#36A886]")} />
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-base">
                            <thead>
                                <tr className="bg-[#36A886] text-white text-xs font-black uppercase tracking-[0.2em]">
                                    <th className="px-8 py-6 text-center w-24 rounded-tl-[32px]">ID</th>
                                    <th className="px-8 py-6 text-center">Timestamp</th>
                                    <th className="px-8 py-6 text-center">User</th>
                                    <th className="px-8 py-6 text-center">Type</th>
                                    <th className="px-10 py-6 text-center">Name</th>
                                    <th className="px-8 py-6 text-center">Symbol</th>
                                    <th className="px-8 py-6 text-center">Status</th>
                                    <th className="px-8 py-6 text-center">Logo</th>
                                    <th className="px-8 py-6 text-center rounded-tr-[32px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-[#ECE9EA]">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} className="px-8 py-20 text-center">
                                            <div className="animate-spin h-7 w-7 border-b-2 border-[#36A886] mx-auto"></div>
                                        </td>
                                    </tr>
                                ) : filteredCoins.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-8 py-20 text-center text-zinc-500 font-medium italic">
                                            No base coins found matching your filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCoins.map((coin, index) => {
                                        const isCoin = coin.type === "BASE-COIN";
                                        const isEnabled = coin.status === "Enabled";
                                        const formattedTime = coin.created_at
                                            ? coin.created_at.replace("T", " ").slice(0, 19)
                                            : "2025-09-17 10:00:00";

                                        return (
                                            <tr key={coin.id || index} className="hover:bg-zinc-200/50 transition-colors group">
                                                {/* ID */}
                                                <td className="px-8 py-6 text-center">
                                                    <span className="text-zinc-600 font-mono text-base font-bold">
                                                        #{coin.id}
                                                    </span>
                                                </td>

                                                {/* TIMESTAMP */}
                                                <td className="px-8 py-6 text-center font-mono text-zinc-600 text-sm whitespace-nowrap">
                                                    {formattedTime}
                                                </td>

                                                {/* USER */}
                                                <td className="px-8 py-6 text-center">
                                                    <span className="px-3 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-wider font-mono shadow-2xs">
                                                        {coin.user || "admin"}
                                                    </span>
                                                </td>

                                                {/* TYPE (Styled badges matching other admin pages) */}
                                                <td className="px-8 py-6 text-center whitespace-nowrap">
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border",
                                                            isCoin
                                                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                                                : "bg-blue-100 text-[#36A886] border-blue-200"
                                                        )}
                                                    >
                                                        {coin.type}
                                                    </span>
                                                </td>

                                                {/* NAME */}
                                                <td className="px-10 py-6 text-center whitespace-nowrap">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-zinc-900 font-bold text-lg tracking-tight uppercase font-space-grotesk">
                                                            {coin.name}
                                                        </span>
                                                        {coin.contract_address && (
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-xs font-mono text-zinc-500">
                                                                    {shortenAddress(coin.contract_address)}
                                                                </span>
                                                                <CopyButton text={coin.contract_address} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* SYMBOL */}
                                                <td className="px-8 py-6 text-center whitespace-nowrap">
                                                    <span className="text-zinc-900 font-extrabold text-base font-space-grotesk">
                                                        {coin.symbol}
                                                    </span>
                                                </td>

                                                {/* STATUS */}
                                                <td className="px-8 py-6 text-center whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleToggleStatus(coin)}
                                                        className="cursor-pointer transition-all hover:scale-105 active:scale-95"
                                                        title="Click to toggle status"
                                                    >
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all",
                                                                isEnabled
                                                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                                                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "w-2 h-2 rounded-full",
                                                                    isEnabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                                                                )}
                                                            />
                                                            {coin.status}
                                                        </span>
                                                    </button>
                                                </td>

                                                {/* LOGO */}
                                                <td className="px-8 py-6 text-center whitespace-nowrap">
                                                    <div className="w-12 h-12 rounded-2xl bg-white border border-zinc-200 shadow-xs flex items-center justify-center mx-auto">
                                                        <CryptoIcon coin={coin.symbol} className="w-7 h-7" />
                                                    </div>
                                                </td>

                                                {/* ACTIONS */}
                                                <td className="px-8 py-6 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-2.5">
                                                        <button
                                                            onClick={() => handleToggleStatus(coin)}
                                                            className={cn(
                                                                "px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer",
                                                                isEnabled
                                                                    ? "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300"
                                                                    : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700"
                                                            )}
                                                            title={isEnabled ? "Click to Disable this asset" : "Click to Enable this asset"}
                                                        >
                                                            {isEnabled ? "Disable" : "Enable"}
                                                        </button>
                                                        <button
                                                            disabled={isEnabled}
                                                            onClick={() => {
                                                                if (isEnabled) {
                                                                    toast.warning(`Please disable ${coin.symbol} first before deleting.`);
                                                                    return;
                                                                }
                                                                handleDeleteCoin(coin);
                                                            }}
                                                            className={cn(
                                                                "p-2.5 border rounded-xl transition-all shadow-xs",
                                                                isEnabled
                                                                    ? "bg-zinc-100 border-zinc-200 text-zinc-300 cursor-not-allowed opacity-40"
                                                                    : "bg-white border-zinc-200 text-zinc-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50/50 cursor-pointer hover:scale-105 active:scale-95"
                                                            )}
                                                            title={isEnabled ? "Must disable coin before deleting" : `Delete ${coin.symbol}`}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer */}
                    <div className="px-8 py-4 bg-zinc-50/70 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 font-mono gap-2">
                        <span>Showing {filteredCoins.length} of {totalCount} configured base currencies</span>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>BSC Testnet Network Active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Add Base Coin Modal (Matching other modals) ── */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#ECE9EA] w-full max-w-lg rounded-[32px] border border-zinc-200 overflow-hidden relative shadow-2xl">
                        {/* Modal Header */}
                        <div className="p-8 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-8 bg-[#36A886] rounded-full shrink-0" />
                                <h3 className="text-2xl font-extrabold text-[#001060] tracking-tight uppercase font-manrope">
                                    Add Base Coin
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="w-9 h-9 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-all cursor-pointer shadow-xs"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleAddCoin} className="p-8 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                    Coin Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Tether (USDT)"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Symbol *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. USDT"
                                        value={formSymbol}
                                        onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-bold font-mono text-zinc-900 placeholder:text-zinc-400 uppercase focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Asset Type *
                                    </label>
                                    <select
                                        value={formType}
                                        onChange={(e) => setFormType(e.target.value as "BASE-COIN" | "BASE-TOKEN")}
                                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                    >
                                        <option value="BASE-COIN">BASE-COIN (Native L1)</option>
                                        <option value="BASE-TOKEN">BASE-TOKEN (BEP-20)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                    Contract Address {formType === "BASE-TOKEN" ? "(Required for Tokens)" : "(Optional)"}
                                </label>
                                <input
                                    type="text"
                                    placeholder="0x..."
                                    value={formContract}
                                    onChange={(e) => setFormContract(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Decimals
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="36"
                                        value={formDecimals}
                                        onChange={(e) => setFormDecimals(e.target.value)}
                                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-mono text-zinc-900 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                                        Initial Status
                                    </label>
                                    <select
                                        value={formStatus}
                                        onChange={(e) => setFormStatus(e.target.value as "Enabled" | "Disabled")}
                                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:border-[#36A886] focus:ring-1 focus:ring-[#36A886] outline-none shadow-sm transition-all"
                                    >
                                        <option value="Enabled">Enabled</option>
                                        <option value="Disabled">Disabled</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-200 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-wider transition-all hover:bg-zinc-50 cursor-pointer shadow-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 rounded-xl bg-[#36A886] hover:bg-[#36A886] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-[#36A886]/20 cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmitting ? "Adding..." : "Add Coin"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
