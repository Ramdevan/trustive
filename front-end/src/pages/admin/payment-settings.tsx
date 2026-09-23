"use client";

import { useEffect, useState } from "react";
import {
    DollarSign,
    RefreshCw,
    Coins,
    ArrowRight,
    ShieldCheck,
    CheckCircle2,
    TrendingUp,
    Layers,
    UserCheck,
    Clock,
    Loader2,
} from "lucide-react";
import { useWriteContract, useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { apiRequest } from "@/lib/api-client";
import { formatDecimal, formatUSD, shortenAddress, cn } from "@/lib/utils";
import TxHashLink from "@/components/TxHashLink";
import { CopyButton } from "@/components/CopyButton";
import {
    ICO_ABI,
    ICO_CONTRACT_ADDRESS,
    ProposalItem,
    getProposalStatus,
} from "@/lib/icoAbi";
import { useQuery } from "@tanstack/react-query";
import { isAdminAddress, isOwnerAddress } from "@/lib/roles";

export default function PaymentSettings() {
    const { address, isConnected } = useAccount();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newPriceUSD, setNewPriceUSD] = useState("");
    const [contractAddress, setContractAddress] = useState(ICO_CONTRACT_ADDRESS);
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
    const [backendPrice, setBackendPrice] = useState<{ usd_per_token: number | null; tokens_per_usd: number | null }>({
        usd_per_token: null,
        tokens_per_usd: null
    });

    const { writeContractAsync, isPending: isWriting } = useWriteContract();

    // Read live on-chain tokenAmountPerUSD from contract
    const { data: onChainTokensPerUSDWei, refetch: refetchOnChainPrice } = useReadContract({
        address: (contractAddress && contractAddress.startsWith("0x") ? contractAddress : undefined) as `0x${string}` | undefined,
        abi: ICO_ABI,
        functionName: 'tokenAmountPerUSD',
        query: {
            enabled: Boolean(contractAddress && contractAddress.startsWith("0x")),
            refetchInterval: 10000,
        }
    });

    // Format on-chain raw tokens per USD
    let onChainTokensPerUSD: number | null = null;
    let onChainUSDPerToken: number | null = null;

    if (onChainTokensPerUSDWei) {
        try {
            const rawTokens = parseFloat(formatUnits(onChainTokensPerUSDWei, 18));
            if (rawTokens > 0 && rawTokens < 1e12) {
                onChainTokensPerUSD = rawTokens;
                onChainUSDPerToken = 1 / rawTokens;
            }
        } catch (e) { }
    }

    // Determine current effective USD price per Trustive
    const currentPriceUSD: number | null = backendPrice.usd_per_token !== null
        ? backendPrice.usd_per_token
        : (onChainUSDPerToken !== null ? onChainUSDPerToken : null);

    const currentTokensPerUSD: number | null = currentPriceUSD && currentPriceUSD > 0
        ? (1 / currentPriceUSD)
        : (backendPrice.tokens_per_usd !== null ? backendPrice.tokens_per_usd : onChainTokensPerUSD);

    // Fetch on-chain proposals
    const { data: proposalsData, refetch: refetchProposals } = useQuery({
        queryKey: ["admin-proposals"],
        queryFn: () => apiRequest("/proposals"),
        refetchInterval: 5000,
    });
    const allProposals: ProposalItem[] = proposalsData?.data || [];
    // Filter price update proposals (Admin OpType 1 = SetTokenPricePerUSD)
    const priceProposals = allProposals.filter((p) => p.role === "admin" && p.payload?.opType === 1);

    useEffect(() => {
        fetchHistory();
        fetchSettings();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await apiRequest("/getPaymentSettingsHistory");
            if (data.status) {
                setHistory(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch history:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const [settingsData, activeSaleData] = await Promise.all([
                apiRequest("/payment-settings"),
                apiRequest("/getActiveSales").catch(() => ({ status: false }))
            ]);

            if (settingsData && settingsData.status) {
                if (settingsData.settings?.ico_contract) {
                    setContractAddress(settingsData.settings.ico_contract);
                }
                if (settingsData.current_price) {
                    setBackendPrice(settingsData.current_price);
                }
            }

            if (activeSaleData?.status && (activeSaleData.sale?.price ?? activeSaleData.sale?.token_price) != null) {
                const salePriceVal = parseFloat(activeSaleData.sale?.price ?? activeSaleData.sale?.token_price);
                if (!isNaN(salePriceVal) && salePriceVal > 0) {
                    setBackendPrice({
                        usd_per_token: salePriceVal,
                        tokens_per_usd: 1 / salePriceVal
                    });
                }
            }
        } catch (err) {
            console.error("Failed to load settings:", err);
        }
    };

    // Propose price update (3/5 Multisig on-chain)
    const handleUpdate = async () => {
        const priceNum = Number(newPriceUSD);
        if (!newPriceUSD || isNaN(priceNum) || priceNum <= 0) {
            return toast.warn("Please enter a valid price in USD (e.g. 0.01)");
        }
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        if (!contractAddress) return toast.error("ICO contract not configured");

        const calculatedTokensPerUSD = 1 / priceNum;
        const tokensPerUSDFormatted = formatDecimal(calculatedTokensPerUSD, 5);

        if (!(await confirmAction(`Propose token price adjustment?\n\n• New Price: $${priceNum} per TRSIV\n• Rate: 1 USD = ${tokensPerUSDFormatted} TRSIV\n\nRequires 3 of 5 Admin multi-sig confirmations to take effect.`))) return;

        try {
            const tokensPerUSDString = calculatedTokensPerUSD.toFixed(18);

            // Send proposal transaction
            const hash = await writeContractAsync({
                address: contractAddress as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'proposeSetTokenPricePerUSD',
                args: [parseUnits(tokensPerUSDString, 18)],
            });

            // Update ledger
            await apiRequest("/updateTokenPrice", {
                method: 'POST',
                body: JSON.stringify({ price: priceNum.toString(), tx_hash: hash })
            }).catch(() => { });

            setShowModal(false);
            setNewPriceUSD("");
            toast.success(`Multi-Sig Price Proposal Created! Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => {
                refetchProposals();
                fetchHistory();
                refetchOnChainPrice();
            }, 4000);
        } catch (error: any) {
            console.error(error);
            toast.error(error.shortMessage || error.message || "Transaction Failed");
        }
    };

    // Confirm price proposal
    const handleConfirm = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: contractAddress as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'confirm',
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} confirmed! Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Confirmation failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Execute price proposal
    const handleExecute = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: contractAddress as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'execute',
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} executed! New token price is live on-chain. Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => {
                refetchProposals();
                refetchOnChainPrice();
                fetchSettings();
            }, 5000);
        } catch (err: any) {
            toast.error("Execution failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    const previewTokensPerUSD = newPriceUSD && Number(newPriceUSD) > 0 ? (1 / Number(newPriceUSD)) : null;

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                        Token Price & Payment Settings
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Manage live on-chain token pricing for ICO sales with 3/5 Admin Multi-Sig governance.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#36A886] hover:bg-[#2548D0] text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                        <DollarSign className="w-4 h-4 text-white/90" />
                        Propose New Price
                    </button>

                    <button
                        onClick={() => {
                            fetchHistory();
                            fetchSettings();
                            refetchOnChainPrice();
                            refetchProposals();
                        }}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-3 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-xs"
                        title="Refresh live price and ledger"
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Active Pricing & Contract Card */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-zinc-200/60">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Live On-Chain Rate
                            </span>
                            <span className="text-xs text-zinc-400">•</span>
                            <span className="text-xs text-zinc-500 font-medium">Auto-synced with smart contract</span>
                        </div>
                        <h2 className="text-2xl font-bold text-[#001060] tracking-tight">
                            Current Token Value
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-white rounded-xl border border-zinc-200 shadow-xs flex items-center gap-2 font-mono text-xs text-zinc-600">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Chain ID: 97 (BSC Testnet)
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    {/* Price in USD */}
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                                Unit Price
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#36A886] border border-blue-200 flex items-center justify-center">
                                <DollarSign className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-bold text-[#1E1E1E] font-mono">
                                {currentPriceUSD !== null ? `$${currentPriceUSD.toFixed(4)}` : "—"}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-medium mt-1">
                                USD per 1 TRSIV token
                            </p>
                        </div>
                    </div>

                    {/* Rate: Tokens Per 1 USD */}
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                                Exchange Rate
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-[#36A886]/10 text-[#36A886] flex items-center justify-center">
                                <Coins className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-2xl font-bold text-[#1E1E1E] font-mono">
                                {currentTokensPerUSD !== null ? `${formatDecimal(currentTokensPerUSD, 4)} TRSIV` : "—"}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-medium mt-1">
                                Tokens received per 1.00 USD
                            </p>
                        </div>
                    </div>

                    {/* Contract Address */}
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                                ICO Smart Contract
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                                <ShieldCheck className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-zinc-900 truncate" title={contractAddress}>
                                    {contractAddress ? shortenAddress(contractAddress) : "Not Configured"}
                                </span>
                                {contractAddress && <CopyButton text={contractAddress} />}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-medium mt-1">
                                3/5 Admin Multi-Sig Authority
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Multi-Sig Price Proposals */}
            {priceProposals.length > 0 && (
                <div className="bg-white rounded-[32px] border border-zinc-200/90 p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                        <div>
                            <h3 className="text-lg font-bold text-[#001060]">Active Price Proposals (3/5 Quorum)</h3>
                            <p className="text-xs text-zinc-500">Requires 3 Admin confirmations to execute price changes.</p>
                        </div>
                        <span className="px-2.5 py-1 bg-blue-100 text-[#36A886] text-[10px] font-bold rounded-lg uppercase">
                            {priceProposals.length} Pending
                        </span>
                    </div>

                    <div className="space-y-3">
                        {priceProposals.map((prop) => {
                            const status = getProposalStatus(prop);
                            // raw amount is tokenAmountPerUSD with 18 decimals
                            let newTokensPerUSD = "—";
                            let newPrice = "—";
                            try {
                                if (prop.payload?.amount) {
                                    const raw = parseFloat(formatUnits(BigInt(prop.payload.amount), 18));
                                    if (raw > 0) {
                                        newTokensPerUSD = formatDecimal(raw, 4);
                                        newPrice = `$${(1 / raw).toFixed(4)}`;
                                    }
                                }
                            } catch { }

                            return (
                                <div key={prop.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-zinc-800 bg-white px-2 py-0.5 rounded border">
                                                Proposal #{prop.id}
                                            </span>
                                            <span className="font-bold text-xs text-[#001060]">
                                                New Price: {newPrice} ({newTokensPerUSD} TRSIV/USD)
                                            </span>
                                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", status.color)}>
                                                {status.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-zinc-500 flex items-center gap-3">
                                            <span>Proposer: {shortenAddress(prop.proposer)}</span>
                                            <span className="font-bold text-blue-600">{prop.confirmations} / 3 Confirmed</span>
                                        </div>
                                    </div>

                                    {!prop.executed && !prop.cancelled && !status.isExpired && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleConfirm(prop.id)}
                                                disabled={actionLoadingId === prop.id}
                                                className="px-4 py-2 bg-[#36A886] text-white rounded-xl text-xs font-bold uppercase cursor-pointer hover:bg-[#2548D0]"
                                            >
                                                Confirm (Vote)
                                            </button>
                                            {prop.isExecutable && (
                                                <button
                                                    onClick={() => handleExecute(prop.id)}
                                                    disabled={actionLoadingId === prop.id}
                                                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase cursor-pointer hover:bg-emerald-700 animate-bounce"
                                                >
                                                    Execute (3/3)
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Price Change Ledger Table */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-200/60 bg-white/40 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                            Price Change Ledger
                        </h2>
                        <p className="text-zinc-500 text-xs mt-0.5">
                            Audit history of all on-chain price modifications and ledger sync events.
                        </p>
                    </div>
                    <span className="text-xs font-bold font-mono text-zinc-500 px-3 py-1 bg-white rounded-lg border border-zinc-200">
                        {history.length} Logs
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#36A886] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-10 py-5">ID</th>
                                <th className="px-8 py-5">BEFORE</th>
                                <th className="px-8 py-5">AFTER</th>
                                <th className="px-8 py-5">TIMESTAMP</th>
                                <th className="px-10 py-5">Transaction Hash</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 bg-[#ECE9EA]">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-24 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#36A886] mx-auto"></div>
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-24 text-center text-zinc-500 font-medium italic">
                                        No historical price adjustments logged yet.
                                    </td>
                                </tr>
                            ) : (
                                history.map((item, index) => (
                                    <tr key={item.id || index} className="hover:bg-zinc-100/60 transition-colors">
                                        <td className="px-10 py-5 font-mono text-xs font-semibold text-zinc-500">
                                            #{item.id || index + 1}
                                        </td>
                                        <td className="px-8 py-5 font-mono text-sm font-semibold text-zinc-700">
                                            {formatUSD(item.before_price)}
                                        </td>
                                        <td className="px-8 py-5 font-mono text-sm font-bold text-[#001060]">
                                            <div className="flex items-center gap-2">
                                                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                                                {formatUSD(item.after_price)}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-xs text-zinc-500 font-medium">
                                            {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                                        </td>
                                        <td className="px-10 py-5">
                                            <div className="flex items-center gap-2">
                                                <TxHashLink hash={item.tx_hash} />
                                                {item.tx_hash && <CopyButton text={item.tx_hash} />}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Change Price Multi-Sig Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#ECE9EA] w-full max-w-lg rounded-[32px] border border-zinc-200/90 p-8 shadow-2xl relative space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#36A886]/10 text-[#36A886] flex items-center justify-center border border-[#36A886]/20">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-[#001060]">
                                        Propose Token Price
                                    </h3>
                                    <p className="text-xs text-zinc-500 font-medium">
                                        Multi-Sig Proposal (Requires 3 of 5 Admin Votes)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900 flex items-center justify-center cursor-pointer transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-600 mb-2">
                                    New Price per 1 Trustive (USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        placeholder="0.01"
                                        value={newPriceUSD}
                                        onChange={(e) => setNewPriceUSD(e.target.value)}
                                        className="w-full bg-white border border-zinc-200 rounded-xl pl-8 pr-4 py-3.5 text-zinc-900 font-mono text-sm focus:outline-none focus:border-[#36A886] transition-colors"
                                    />
                                </div>
                            </div>

                            {previewTokensPerUSD !== null && (
                                <div className="p-4 bg-white rounded-xl border border-zinc-200 space-y-2">
                                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">
                                        Calculated On-Chain Exchange Rate
                                    </span>
                                    <div className="flex items-center justify-between text-xs font-mono">
                                        <span className="text-zinc-500">1.00 USD will yield:</span>
                                        <span className="font-bold text-[#001060]">
                                            {formatDecimal(previewTokensPerUSD, 4)} TRSIV
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200/80 text-[11px] text-blue-900 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-[#36A886]" />
                                    Multi-Signature Consensus Process:
                                </p>
                                <p className="leading-relaxed text-blue-800">
                                    Submitting this transaction creates an on-chain proposal. It requires <strong>3 of 5 Admin signatures</strong> before it can be executed to update live pricing.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 text-xs font-bold uppercase tracking-wider cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={isWriting}
                                className="bg-[#36A886] hover:bg-[#2548D0] text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                            >
                                {isWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Submit Multi-Sig Proposal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
