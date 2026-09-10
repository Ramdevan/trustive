"use client";

import { useEffect, useState } from "react";
import { DollarSign, Activity, CheckCircle2, TrendingUp, RefreshCw } from "lucide-react";
import { useWriteContract, useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { apiRequest } from "@/lib/api-client";
import { formatDecimal, formatUSD } from "@/lib/utils";
import TxHashLink from "@/components/TxHashLink";

// Minimal ABI to read & set the token price
const ICO_ABI = [
    {
        "inputs": [],
        "name": "tokenAmountPerUSD",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenAmount", "type": "uint256" }],
        "name": "setTokenPricePerUSD",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

export default function PaymentSettings() {
    const { address, isConnected } = useAccount();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newPriceUSD, setNewPriceUSD] = useState("");
    const [contractAddress, setContractAddress] = useState("");
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

    // Determine current effective USD price per Trustive (matches user dashboard)
    const currentPriceUSD: number | null = backendPrice.usd_per_token !== null
        ? backendPrice.usd_per_token
        : (onChainUSDPerToken !== null ? onChainUSDPerToken : null);

    const currentTokensPerUSD: number | null = currentPriceUSD && currentPriceUSD > 0
        ? (1 / currentPriceUSD)
        : (backendPrice.tokens_per_usd !== null ? backendPrice.tokens_per_usd : onChainTokensPerUSD);

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
            console.error("Failed to fetch settings:", err);
        }
    };

    const handleUpdate = async () => {
        const priceNum = Number(newPriceUSD);
        if (!newPriceUSD || isNaN(priceNum) || priceNum <= 0) {
            return toast.warn("Please enter a valid price in USD (e.g. 0.01)");
        }
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        if (!contractAddress) return toast.error("ICO contract not configured in DB");

        // Calculate tokens per USD (e.g., if price is 0.01 USD, then 1 USD = 100 Trustive)
        const calculatedTokensPerUSD = 1 / priceNum;
        const tokensPerUSDFormatted = formatDecimal(calculatedTokensPerUSD, 5);

        if (!(await confirmAction(`Are you sure you want to update the token price?\n\n• New Price: $${priceNum} per Trustive\n• Rate: 1 USD = ${tokensPerUSDFormatted} Trustive`))) return;

        try {
            // Convert to 18 decimals string representation for the smart contract
            const tokensPerUSDString = calculatedTokensPerUSD.toFixed(18);

            // Send transaction to the blockchain
            const hash = await writeContractAsync({
                address: contractAddress as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'setTokenPricePerUSD',
                args: [parseUnits(tokensPerUSDString, 18)],
            });

            // Update database backend with exact price and history record
            const data = await apiRequest("/updateTokenPrice", {
                method: 'POST',
                body: JSON.stringify({ price: priceNum.toString(), tx_hash: hash })
            });

            if (data.status) {
                setShowModal(false);
                setNewPriceUSD("");
                toast.success("Token price successfully updated on-chain and in ledger!");
                fetchHistory();
                fetchSettings();
                refetchOnChainPrice();
            } else {
                toast.error(data.msg || "Failed to update internal ledger");
            }
        } catch (error: any) {
            console.error(error);
            toast.error(error.shortMessage || error.message || "Transaction Failed");
        }
    };

    const previewTokensPerUSD = newPriceUSD && Number(newPriceUSD) > 0 ? (1 / Number(newPriceUSD)) : null;

    return (
        <div className="space-y-10 animate-in fade-in duration-200">
            {/* Header with Actions & Current Price Widget */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#212E73] hover:bg-[#1a255c] text-white px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                        <DollarSign className="w-4 h-4 text-white/90" />
                        Change Token Price
                    </button>
                    
                    <button
                        onClick={() => {
                            fetchHistory();
                            fetchSettings();
                            refetchOnChainPrice();
                        }}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-5 py-3.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                        title="Refresh live price and ledger"
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Price Change Ledger Table */}
            <div className="bg-white rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative z-10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#212E73] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-12 py-6 rounded-tl-[32px]">ID</th>
                                <th className="px-10 py-6">BEFORE</th>
                                <th className="px-10 py-6">AFTER</th>
                                <th className="px-10 py-6">TIMESTAMP</th>
                                <th className="px-12 py-6 rounded-tr-[32px]">Transaction Hash</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-24 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#212E73] mx-auto"></div>
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-24 text-center text-zinc-500 font-medium italic">No ledger updates found.</td>
                                </tr>
                            ) : (
                                history.map((record, i) => {
                                    const rawOld = parseFloat(record.old_value);
                                    const rawNew = parseFloat(record.new_value);

                                    return (
                                        <tr key={i} className="hover:bg-zinc-50/70 transition-colors group">
                                            <td className="px-12 py-6">
                                                <span className="text-zinc-500 font-mono text-base">{record.id}</span>
                                            </td>
                                            <td className="px-10 py-6">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-zinc-600 font-bold text-lg font-mono">{formatUSD(rawOld)}</span>
                                                    <span className="text-xs text-zinc-400">/ Trustive</span>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-[#212E73] font-bold text-xl font-mono">{formatUSD(rawNew)}</span>
                                                    <span className="text-xs text-[#212E73]/70">/ Trustive</span>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6">
                                                <span className="text-zinc-600 text-sm font-semibold uppercase tracking-wider">
                                                    {new Date(record.timestamp).toLocaleString("en-GB")}
                                                </span>
                                            </td>
                                            <td className="px-12 py-6">
                                                <TxHashLink hash={record.transaction_hash} fallback="Off-chain" />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Change Price Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-[32px] border border-zinc-200 overflow-hidden shadow-2xl relative">
                        <div className="p-8 sm:p-10 space-y-6">

                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-[#212E73]/10 text-[#212E73] rounded-2xl flex items-center justify-center shrink-0 border border-[#212E73]/20">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-2xl font-bold text-zinc-900 tracking-tight truncate">Modify Token Valuation</h2>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Update on-chain ICO pricing engine</p>
                                </div>
                            </div>

                            {/* Current Token Price Box */}
                            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-2 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-[#212E73]" /> Current Token Price
                                    </span>
                                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold uppercase tracking-widest border border-emerald-200">
                                        Active
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between pt-1 gap-4">
                                    <div className="min-w-0">
                                        <p className="text-3xl font-extrabold text-[#212E73] font-mono tracking-tight truncate">
                                            {currentPriceUSD !== null ? formatUSD(currentPriceUSD) : "—"}
                                        </p>
                                        <p className="text-xs text-zinc-500 font-medium">per 1 Trustive token</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-base font-bold text-zinc-900 font-mono">
                                            {currentTokensPerUSD !== null && currentTokensPerUSD < 1e9
                                                ? `${formatDecimal(currentTokensPerUSD, 5)} Trustive`
                                                : "—"}
                                        </p>
                                        <p className="text-xs text-zinc-500 font-medium">per 1 USD</p>
                                    </div>
                                </div>
                            </div>

                            {/* New Token Price (USD) Input */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block">
                                    New Token Price (USD $)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 text-lg font-bold">
                                        $
                                    </span>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="0.01"
                                        value={newPriceUSD}
                                        onChange={(e) => setNewPriceUSD(e.target.value)}
                                        className="w-full bg-white border border-zinc-200 rounded-2xl pl-12 pr-24 py-4 text-zinc-900 font-mono text-lg focus:outline-none focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-zinc-400 shadow-sm"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                                        USD / Trustive
                                    </span>
                                </div>

                                {/* Dynamic Preview */}
                                {previewTokensPerUSD !== null && (
                                    <div className="bg-[#212E73]/5 border border-[#212E73]/20 rounded-xl p-3.5 flex items-center justify-between text-xs animate-in fade-in duration-200">
                                        <span className="text-zinc-600 font-medium">Resulting Conversion:</span>
                                        <span className="font-mono font-bold text-[#212E73]">
                                            1 USD = {formatDecimal(previewTokensPerUSD, 5)} Trustive
                                        </span>
                                    </div>
                                )}
                            </div>

                        </div>

                        <div className="p-6 bg-zinc-50 flex gap-4 border-t border-zinc-200">
                            <button
                                onClick={() => setShowModal(false)}
                                disabled={isWriting}
                                className="flex-1 px-6 py-3.5 bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer border border-zinc-200 shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={isWriting || !newPriceUSD || Number(newPriceUSD) <= 0}
                                className="flex-[2] px-6 py-3.5 bg-[#212E73] hover:bg-[#1a255c] text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:scale-[1.01] active:scale-[0.99]"
                            >
                                {isWriting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Processing On-Chain...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 text-white" />
                                        Confirm & Update Price
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
