"use client";

import { useEffect, useState } from "react";
import {
    Gift,
    RefreshCw,
    ShieldCheck,
    Users,
    TrendingUp,
    AlertTriangle,
    Save,
    CheckCircle2,
    Coins,
    Percent,
    ExternalLink,
    Clock,
    Copy,
    Check
} from "lucide-react";
import { toast } from "react-toastify";
import { apiRequest } from "@/lib/api-client";
import { formatDecimal, shortenAddress } from "@/lib/utils";
import TxHashLink from "@/components/TxHashLink";
import { CopyButton } from "@/components/CopyButton";

export default function ReferralAdminPage() {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Referral Program Settings
    const [referralContract, setReferralContract] = useState("0x66ae3C6846C0a340936B127BBBec4f3FC2C08935");
    const [referralCommission, setReferralCommission] = useState("5.00");
    const [contractBalance, setContractBalance] = useState("0");

    // Stats & Claim History
    const [stats, setStats] = useState({
        commission_rate: "5.00",
        total_claims_count: 0,
        total_claimed_tokens: "0.0000",
        total_rewards_generated: "0.0000",
        total_referrers: 0,
        total_referred_users: 0,
    });
    const [claims, setClaims] = useState<any[]>([]);

    useEffect(() => {
        fetchReferralData();
    }, []);

    const fetchReferralData = async () => {
        setLoading(true);
        try {
            // First attempt dedicated referral-stats endpoint
            let data: any = null;
            try {
                data = await apiRequest("/referral-stats");
            } catch (e) {
                // Fallback to /payment-settings if backend hasn't loaded /referral-stats yet
                data = await apiRequest("/payment-settings").catch(() => null);
            }

            if (data && data.status) {
                if (data.settings) {
                    if (data.settings.referral_contract) {
                        setReferralContract(data.settings.referral_contract);
                    }
                    if (data.settings.referral_level1 !== undefined) {
                        setReferralCommission(String(data.settings.referral_level1));
                    }
                }
                if (data.referral_contract_balance !== undefined) {
                    setContractBalance(data.referral_contract_balance);
                }
                if (data.stats) {
                    setStats(prev => ({
                        ...prev,
                        ...data.stats
                    }));
                }
                if (data.recent_claims) {
                    setClaims(data.recent_claims);
                }
            }
        } catch (err) {
            console.error("Failed to fetch referral data:", err);
            toast.error("Failed to load referral details");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        const commissionVal = parseFloat(referralCommission);
        if (isNaN(commissionVal) || commissionVal < 0 || commissionVal > 100) {
            return toast.warn("Please enter a valid commission rate between 0% and 100%");
        }
        if (!referralContract.startsWith("0x") || referralContract.length !== 42) {
            return toast.warn("Please enter a valid BSC Testnet contract address (0x...)");
        }

        setIsSaving(true);
        try {
            // Try saving via /referral-settings first, with fallback to /payment-settings
            let res: any = null;
            try {
                res = await apiRequest("/referral-settings", {
                    method: "POST",
                    body: JSON.stringify({
                        referral_contract: referralContract.trim(),
                        referral_level1: commissionVal,
                    })
                });
            } catch {
                res = await apiRequest("/payment-settings", {
                    method: "POST",
                    body: JSON.stringify({
                        referral_contract: referralContract.trim(),
                        referral_level1: commissionVal,
                    })
                });
            }

            if (res && res.status) {
                toast.success("Referral configuration successfully saved!");
                fetchReferralData();
            } else {
                toast.error(res?.msg || "Failed to update referral configuration");
            }
        } catch (err) {
            console.error("Save referral error:", err);
            toast.error("Failed to save referral configuration");
        } finally {
            setIsSaving(false);
        }
    };

    const poolBalanceNum = parseFloat(contractBalance || "0");
    const isPoolUnderfunded = isNaN(poolBalanceNum) || poolBalanceNum <= 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                            Referral Program Management
                        </h1>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                        </span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1 font-normal">
                        Configure direct buyer commissions, monitor on-chain claim pool solvency, and audit reward payouts.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchReferralData}
                        disabled={loading}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        title="Refresh live data"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Metric 1: Direct Commission */}
                <div className="bg-[#ECE9EA] p-6 rounded-[24px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Commission Rate
                        </span>
                        <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#36A886] shadow-xs">
                            <Percent className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-3xl font-bold text-[#1E1E1E] tracking-tight">
                            {parseFloat(referralCommission || "0").toFixed(2)}%
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-1">
                            Per referred ICO purchase
                        </p>
                    </div>
                </div>

                {/* Metric 2: Claim Pool Balance */}
                <div className="bg-[#ECE9EA] p-6 rounded-[24px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Claim Pool Balance
                        </span>
                        <div className={`w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center shadow-xs ${isPoolUnderfunded ? 'text-amber-500' : 'text-emerald-600'}`}>
                            <Coins className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-2xl lg:text-3xl font-bold text-[#1E1E1E] tracking-tight truncate" title={`${contractBalance} TRSIV`}>
                            {formatDecimal(poolBalanceNum, 2)} <span className="text-sm font-semibold text-zinc-500">TRSIV</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-1">
                            Live on BSC Testnet
                        </p>
                    </div>
                </div>

                {/* Metric 3: Total Claimed */}
                <div className="bg-[#ECE9EA] p-6 rounded-[24px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Total Claimed
                        </span>
                        <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#36A886] shadow-xs">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-2xl lg:text-3xl font-bold text-[#1E1E1E] tracking-tight">
                            {formatDecimal(Number(stats.total_claimed_tokens) || 0, 2)} <span className="text-sm font-semibold text-zinc-500">TRSIV</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-1">
                            {stats.total_claims_count} completed claims
                        </p>
                    </div>
                </div>

                {/* Metric 4: Referrers & Network */}
                <div className="bg-[#ECE9EA] p-6 rounded-[24px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Active Referrers
                        </span>
                        <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#36A886] shadow-xs">
                            <Users className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-3xl font-bold text-[#1E1E1E] tracking-tight">
                            {stats.total_referrers}
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-1">
                            {stats.total_referred_users} referred accounts
                        </p>
                    </div>
                </div>
            </div>

            {/* Warning Banner if Pool Balance is 0 */}
            {isPoolUnderfunded && (
                <div className="flex items-start gap-4 p-5 rounded-[24px] bg-amber-50 border border-amber-200 text-amber-900 shadow-sm">
                    <div className="p-2.5 bg-amber-100/80 rounded-xl text-amber-700 shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-sm text-amber-950">
                            Claim Pool Solvency Notice: 0.00 TRSIV Held on Contract
                        </h4>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                            The referral claim smart contract (<code className="font-mono bg-amber-100/70 px-1.5 py-0.5 rounded text-amber-950 font-semibold">{referralContract}</code>) currently has no TRSIV token balance on BSC Testnet. When users attempt to claim their referral bonuses on the user dashboard, the transaction will revert unless TRSIV tokens are transferred to this address from the token owner wallet.
                        </p>
                    </div>
                </div>
            )}

            {/* Configuration Form Card */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-200/60 bg-white/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 bg-[#36A886]/10 rounded-2xl text-[#36A886] border border-[#36A886]/20">
                            <Gift className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                                Referral Program Settings
                            </h2>
                            <p className="text-zinc-500 text-xs mt-0.5">
                                Set smart contract claim recipient address and direct buyer commission percentages.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSaveSettings} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Referral Claim Contract Address */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center justify-between">
                                <span>Referral Claim Contract Address</span>
                                <span className="font-mono text-[10px] text-zinc-400">BSC Testnet</span>
                            </label>
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    required
                                    value={referralContract}
                                    onChange={(e) => setReferralContract(e.target.value.trim())}
                                    placeholder="0x..."
                                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-mono text-xs focus:border-[#36A886] focus:ring-2 focus:ring-[#36A886]/10 outline-none pr-12 transition-all"
                                />
                                <div className="absolute right-3">
                                    <CopyButton text={referralContract} />
                                </div>
                            </div>
                            <p className="text-[11px] text-zinc-400 px-1">
                                Smart contract implementing <code className="font-mono text-zinc-600">claim()</code> with backend ECDSA signed vouchers.
                            </p>
                        </div>

                        {/* Direct Referral Bonus (%) */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                                Direct Referral Bonus (%)
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    required
                                    value={referralCommission}
                                    onChange={(e) => setReferralCommission(e.target.value)}
                                    placeholder="5.00"
                                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 pr-10 text-zinc-900 font-mono text-sm focus:border-[#36A886] focus:ring-2 focus:ring-[#36A886]/10 outline-none transition-all"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">
                                    %
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 px-1">
                                Percentage of purchased TRSIV tokens awarded to the referrer on every successful ICO purchase.
                            </p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex items-center justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-[#36A886] hover:bg-[#36A886] text-white px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                        >
                            {isSaving ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            ) : (
                                <Save className="w-4 h-4 text-white/90" />
                            )}
                            Save Referral Configuration
                        </button>
                    </div>
                </form>
            </div>

            {/* Referral Claims Ledger Table */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-200/60 bg-white/40 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-[#001060] tracking-tight">
                            Referral Claims & Payout Ledger
                        </h3>
                        <p className="text-zinc-500 text-xs mt-0.5">
                            Audit log of user on-chain bonus claims executed through the referral claim contract.
                        </p>
                    </div>
                    <span className="text-xs font-bold font-mono text-zinc-500 px-3 py-1 bg-white rounded-lg border border-zinc-200">
                        {claims.length} Records
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#36A886] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-8 py-5">ID</th>
                                <th className="px-6 py-5">Beneficiary Wallet</th>
                                <th className="px-6 py-5">Amount (TRSIV)</th>
                                <th className="px-6 py-5">Nonce</th>
                                <th className="px-6 py-5">Status</th>
                                <th className="px-8 py-5">Tx Hash</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 bg-[#ECE9EA]">
                            {claims.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-12 text-center text-zinc-400">
                                        <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="font-semibold text-sm">No referral claims recorded yet</p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            When users claim their referral bonus tokens, transactions will appear here.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                claims.map((claim, idx) => (
                                    <tr key={claim.id || idx} className="hover:bg-zinc-100/60 transition-colors">
                                        <td className="px-8 py-4 font-mono text-xs text-zinc-500">
                                            #{claim.id}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-semibold text-zinc-900" title={claim.wallet_address}>
                                                    {shortenAddress(claim.wallet_address)}
                                                </span>
                                                <CopyButton text={claim.wallet_address} />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-sm text-[#001060]">
                                            +{parseFloat(claim.amount || 0).toLocaleString()} <span className="text-xs font-semibold text-zinc-500">TRSIV</span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-zinc-500">
                                            {claim.nonce}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                {claim.status || "success"}
                                            </span>
                                        </td>
                                        <td className="px-8 py-4 font-mono text-xs">
                                            <TxHashLink hash={claim.tx_hash} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
