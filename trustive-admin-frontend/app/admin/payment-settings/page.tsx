"use client";

import { useEffect, useState } from "react";
import { DollarSign, RefreshCw, Coins, ArrowRight, ShieldCheck, CheckCircle2, TrendingUp, Layers } from "lucide-react";
import { useWriteContract, useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { apiRequest } from "@/lib/api-client";
import { formatDecimal, formatUSD, shortenAddress } from "@/lib/utils";
import TxHashLink from "@/components/TxHashLink";
import { CopyButton } from "@/components/CopyButton";

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
                if (settingsData.settings) {
                    const s = settingsData.settings;
                    if (s.ico_contract) {
                        setContractAddress(s.ico_contract);
                    }
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

        if (!(await confirmAction(`Are you sure you want to update the token price?\n\n• New Price: $${priceNum} per TRSIV\n• Rate: 1 USD = ${tokensPerUSDFormatted} TRSIV`))) return;

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
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                        Token Price & Payment Settings
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Manage live on-chain token pricing for ICO sales and audit historical rate adjustments.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#315EFB] hover:bg-[#2548D0] text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Price in USD */}
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                                Effective Token Price
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-[#315EFB]/10 text-[#315EFB] flex items-center justify-center">
                                <DollarSign className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-bold text-[#1E1E1E] font-mono">
                                {currentPriceUSD !== null ? formatUSD(currentPriceUSD) : "—"}
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
                            <div className="w-9 h-9 rounded-xl bg-[#315EFB]/10 text-[#315EFB] flex items-center justify-center">
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
                                BSC Testnet on-chain price authority
                            </p>
                        </div>
                    </div>
                </div>
            </div>

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
                            <tr className="bg-[#315EFB] text-white uppercase font-bold text-xs tracking-widest">
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
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#315EFB] mx-auto"></div>
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
                                        <tr key={i} className="hover:bg-zinc-100/60 transition-colors group">
                                            <td className="px-10 py-5">
                                                <span className="text-zinc-500 font-mono text-sm">#{record.id}</span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-zinc-600 font-bold text-base font-mono">{formatUSD(rawOld)}</span>
                                                    <span className="text-xs text-zinc-400">/ TRSIV</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[#315EFB] font-bold text-base font-mono">{formatUSD(rawNew)}</span>
                                                    <span className="text-xs text-[#315EFB]/70">/ TRSIV</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-zinc-600 text-xs font-semibold uppercase tracking-wider">
                                                    {new Date(record.timestamp).toLocaleString("en-GB")}
                                                </span>
                                            </td>
                                            <td className="px-10 py-5">
                                                {record.tx_hash ? (
                                                    <TxHashLink hash={record.tx_hash} />
                                                ) : (
                                                    <span className="text-zinc-400 text-xs italic font-mono">Ledger Only</span>
                                                )}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white border border-zinc-200 w-full max-w-md rounded-[32px] p-8 shadow-2xl relative">
                        <div className="w-12 h-12 rounded-2xl bg-[#315EFB]/10 flex items-center justify-center text-[#315EFB] mb-6">
                            <DollarSign className="w-6 h-6" />
                        </div>

                        <h3 className="text-xl font-bold text-[#001060] tracking-tight">Change Token Price</h3>
                        <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
                            This calls <code className="font-mono text-[#315EFB]">setTokenPricePerUSD</code> on the ICO smart contract and logs the change to the ledger.
                        </p>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                                    New Price (in USD per TRSIV)
                                </label>
                                <div className="relative mt-2">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        min="0.000001"
                                        placeholder="0.01"
                                        value={newPriceUSD}
                                        onChange={(e) => setNewPriceUSD(e.target.value)}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 pl-8 text-zinc-900 font-mono text-sm focus:border-[#315EFB] focus:bg-white outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {previewTokensPerUSD && previewTokensPerUSD > 0 && (
                                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1">
                                    <div className="flex justify-between text-zinc-500">
                                        <span>Rate:</span>
                                        <span className="font-mono font-bold text-zinc-900">
                                            1 USD = {formatDecimal(previewTokensPerUSD, 4)} TRSIV
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-zinc-500">
                                        <span>Current:</span>
                                        <span className="font-mono text-zinc-600">
                                            {currentPriceUSD !== null ? formatUSD(currentPriceUSD) : "—"}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowModal(false)}
                                    disabled={isWriting}
                                    className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpdate}
                                    disabled={isWriting || !newPriceUSD}
                                    className="flex-1 py-3 bg-[#315EFB] hover:bg-[#2548D0] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                                >
                                    {isWriting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                            <span>Signing...</span>
                                        </>
                                    ) : (
                                        <span>Confirm Update</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
