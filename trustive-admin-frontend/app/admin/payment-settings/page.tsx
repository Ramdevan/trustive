"use client";

import { useEffect, useState } from "react";
import { DollarSign, Activity, CheckCircle2, TrendingUp, RefreshCw, CreditCard, ShieldCheck, Eye, EyeOff, Save, Key, Globe, Gift, AlertTriangle } from "lucide-react";
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

    // MoonPay Gateway State
    const [moonpayEnabled, setMoonpayEnabled] = useState<boolean>(true);
    const [moonpayApiKey, setMoonpayApiKey] = useState<string>("");
    const [moonpaySecretKey, setMoonpaySecretKey] = useState<string>("");
    const [moonpayEnv, setMoonpayEnv] = useState<string>("sandbox");
    const [showSecretKey, setShowSecretKey] = useState<boolean>(false);
    const [isSavingMoonpay, setIsSavingMoonpay] = useState<boolean>(false);

    // Referral Program State
    const [referralContract, setReferralContract] = useState<string>("0x66ae3C6846C0a340936B127BBBec4f3FC2C08935");
    const [referralCommission, setReferralCommission] = useState<string>("5.00");
    const [referralContractBalance, setReferralContractBalance] = useState<string>("0");
    const [isSavingReferral, setIsSavingReferral] = useState<boolean>(false);

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
                    setMoonpayEnabled(s.moonpay_enabled !== undefined ? Boolean(s.moonpay_enabled) : true);
                    setMoonpayApiKey(s.moonpay_api_key || "");
                    setMoonpaySecretKey(s.moonpay_secret_key || "");
                    setMoonpayEnv(s.moonpay_environment || "sandbox");
                    if (s.referral_contract) {
                        setReferralContract(s.referral_contract);
                    }
                    if (s.referral_level1 !== undefined) {
                        setReferralCommission(String(s.referral_level1));
                    }
                }
                if (settingsData.referral_contract_balance !== undefined) {
                    setReferralContractBalance(settingsData.referral_contract_balance);
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

    const handleSaveMoonPay = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsSavingMoonpay(true);
        try {
            const res = await apiRequest("/payment-settings", {
                method: 'POST',
                body: JSON.stringify({
                    moonpay_enabled: moonpayEnabled ? 1 : 0,
                    moonpay_api_key: moonpayApiKey.trim(),
                    moonpay_secret_key: moonpaySecretKey.trim(),
                    moonpay_environment: moonpayEnv
                })
            });

            if (res && res.status) {
                toast.success("MoonPay gateway settings successfully updated!");
                fetchHistory();
                fetchSettings();
            } else {
                toast.error(res?.msg || "Failed to update MoonPay settings");
            }
        } catch (err: any) {
            console.error("Save MoonPay error:", err);
            toast.error("Failed to update MoonPay settings");
        } finally {
            setIsSavingMoonpay(false);
        }
    };

    const handleSaveReferral = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsSavingReferral(true);
        try {
            const res = await apiRequest("/payment-settings", {
                method: 'POST',
                body: JSON.stringify({
                    referral_contract: referralContract.trim(),
                    referral_level1: parseFloat(referralCommission) || 5.0
                })
            });

            if (res && res.status) {
                toast.success("Referral program settings successfully updated!");
                fetchHistory();
                fetchSettings();
            } else {
                toast.error(res?.msg || "Failed to update referral settings");
            }
        } catch (err: any) {
            console.error("Save Referral error:", err);
            toast.error("Failed to update referral settings");
        } finally {
            setIsSavingReferral(false);
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
        <div className="space-y-10 animate-in fade-in duration-200">
            {/* Header with Actions & Current Price Widget */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#315EFB] hover:bg-[#2548D0] text-white px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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

            {/* MoonPay Fiat Gateway Configuration Card */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative z-10">
                <div className="p-8 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 bg-[#7D00FF]/10 rounded-2xl text-[#7D00FF] border border-[#7D00FF]/20">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-xl font-bold text-[#001060] tracking-tight">MoonPay Fiat Onramp Gateway</h2>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                                    moonpayEnabled 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                                }`}>
                                    {moonpayEnabled ? 'Active' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-zinc-500 text-xs mt-0.5">
                                Manage credit card, Apple Pay & Google Pay crypto onramps for the ICO buy page.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={moonpayEnabled}
                                onChange={(e) => setMoonpayEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7D00FF]"></div>
                            <span className="ml-2.5 text-xs font-bold text-zinc-700 uppercase tracking-wider">
                                {moonpayEnabled ? 'Gateway Enabled' : 'Gateway Disabled'}
                            </span>
                        </label>
                    </div>
                </div>

                <form onSubmit={handleSaveMoonPay} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Environment selector */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-[#315EFB]" /> Gateway Environment
                            </label>
                            <select
                                value={moonpayEnv}
                                onChange={(e) => setMoonpayEnv(e.target.value)}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-semibold text-sm focus:border-[#315EFB] focus:bg-white outline-none cursor-pointer"
                            >
                                <option value="sandbox">Sandbox (Testing / Staging)</option>
                                <option value="production">Production (Live Payments)</option>
                            </select>
                            <p className="text-[11px] text-zinc-400 px-1">
                                {moonpayEnv === 'sandbox' 
                                    ? 'Using Sandbox: Uses test credit cards without real charges.' 
                                    : 'Using Production: Real transactions with Visa, Mastercard, and Apple Pay.'}
                            </p>
                        </div>

                        {/* Publishable API Key */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                <Key className="w-3.5 h-3.5 text-[#315EFB]" /> Publishable API Key
                            </label>
                            <input
                                type="text"
                                value={moonpayApiKey}
                                onChange={(e) => setMoonpayApiKey(e.target.value)}
                                placeholder="pk_test_... or pk_live_..."
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-mono text-xs focus:border-[#315EFB] focus:bg-white outline-none"
                            />
                            <p className="text-[11px] text-zinc-400 px-1">
                                Safe for client-side widget rendering.
                            </p>
                        </div>

                        {/* Secret Key (Full Width) */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Secret Key (HMAC-SHA256 URL Signing)
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowSecretKey(!showSecretKey)}
                                    className="text-zinc-500 hover:text-zinc-800 text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer"
                                >
                                    {showSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    {showSecretKey ? 'Hide Key' : 'Reveal Key'}
                                </button>
                            </label>
                            <div className="relative">
                                <input
                                    type={showSecretKey ? "text" : "password"}
                                    value={moonpaySecretKey}
                                    onChange={(e) => setMoonpaySecretKey(e.target.value)}
                                    placeholder="sk_test_... or sk_live_..."
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-mono text-xs focus:border-[#315EFB] focus:bg-white outline-none pr-12"
                                />
                            </div>
                            <p className="text-[11px] text-zinc-400 px-1">
                                Securely stored on backend. Used to sign iframe query parameters so wallet addresses cannot be tampered with.
                            </p>
                        </div>
                    </div>

                    {/* Information Note */}
                    <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-100 flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#7D00FF] mt-1.5 shrink-0" />
                        <div className="text-xs text-zinc-600 space-y-1">
                            <p className="font-bold text-zinc-900">Configured Delivery Currencies: BNB (<code className="font-mono text-[11px] text-[#7D00FF]">bnb_bsc</code>) & USDT (<code className="font-mono text-[11px] text-[#7D00FF]">usdt_bsc</code>)</p>
                            <p className="text-zinc-500 leading-relaxed">
                                MoonPay delivers purchased BEP-20 assets directly to the buyer's connected Web3 wallet address on Binance Smart Chain.
                            </p>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex items-center justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSavingMoonpay}
                            className="bg-[#315EFB] hover:bg-[#2548D0] text-white px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                        >
                            {isSavingMoonpay ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <Save className="w-4 h-4 text-white/90" />
                            )}
                            Save MoonPay Configuration
                        </button>
                    </div>
                </form>
            </div>

            {/* Referral Program Configuration */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative z-10">
                <div className="p-8 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
                            <Gift className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-[#001060]">Referral Program Configuration</h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Active
                                </span>
                            </div>
                            <p className="text-sm text-zinc-500 mt-0.5">
                                Configure the on-chain referral claim contract address and direct buyer commission rate.
                            </p>
                        </div>
                    </div>

                    {/* Live Contract TRSIV Balance Indicator */}
                    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white border border-zinc-200 shadow-sm">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Claim Pool Balance</div>
                            <div className="text-sm font-bold font-mono text-zinc-900">
                                {parseFloat(referralContractBalance || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} TRSIV
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => fetchSettings()}
                            title="Refresh balance"
                            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSaveReferral} className="p-8 space-y-6">
                    {/* Contract Warning Banner if Pool Balance is 0 */}
                    {parseFloat(referralContractBalance || '0') <= 0 && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Referral Contract Funding Notice</p>
                                <p className="text-amber-800 mt-0.5">
                                    The referral claim contract (<code className="font-mono bg-amber-100/70 px-1 py-0.5 rounded text-amber-900">{referralContract || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935'}</code>) currently holds 0.00 TRSIV tokens on BSC Testnet. Transfer TRSIV tokens to this address from your owner wallet so users can claim their referral earnings on-chain without revert errors.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Referral Contract Address */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                                Referral Claim Contract Address
                            </label>
                            <input
                                type="text"
                                required
                                value={referralContract}
                                onChange={(e) => setReferralContract(e.target.value.trim())}
                                placeholder="0x..."
                                className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 focus:outline-none focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/10 font-mono text-xs text-zinc-900 transition-all bg-zinc-50/50"
                            />
                            <p className="text-[11px] text-zinc-400">
                                Smart contract implementing claim() with authorized ECDSA signatures on BSC Testnet.
                            </p>
                        </div>

                        {/* Referral Commission Level 1 (%) */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700">
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
                                    className="w-full px-4 py-3.5 pr-10 rounded-xl border border-zinc-200 focus:outline-none focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/10 font-mono text-sm text-zinc-900 transition-all bg-zinc-50/50"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">
                                    %
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-400">
                                Percentage of tokens awarded to referrer when an invited buyer makes an ICO purchase.
                            </p>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex items-center justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSavingReferral}
                            className="bg-[#315EFB] hover:bg-[#2548D0] text-white px-8 py-3.5 rounded-xl flex items-center gap-3 font-bold text-xs uppercase tracking-widest transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                        >
                            {isSavingReferral ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <Save className="w-4 h-4 text-white/90" />
                            )}
                            Save Referral Configuration
                        </button>
                    </div>
                </form>
            </div>

            {/* Price Change Ledger Table */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative z-10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#315EFB] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-12 py-6 rounded-tl-[32px]">ID</th>
                                <th className="px-10 py-6">BEFORE</th>
                                <th className="px-10 py-6">AFTER</th>
                                <th className="px-10 py-6">TIMESTAMP</th>
                                <th className="px-12 py-6 rounded-tr-[32px]">Transaction Hash</th>
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
                                        <tr key={i} className="hover:bg-zinc-50/70 transition-colors group">
                                            <td className="px-12 py-6">
                                                <span className="text-zinc-500 font-mono text-base">{record.id}</span>
                                            </td>
                                            <td className="px-10 py-6">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-zinc-600 font-bold text-lg font-mono">{formatUSD(rawOld)}</span>
                                                    <span className="text-xs text-zinc-400">/ TRSIV</span>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-[#315EFB] font-bold text-xl font-mono">{formatUSD(rawNew)}</span>
                                                    <span className="text-xs text-[#315EFB]/70">/ TRSIV</span>
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
                    <div className="bg-[#ECE9EA] w-full max-w-lg rounded-[32px] border border-zinc-200 overflow-hidden shadow-2xl relative">
                        <div className="p-8 sm:p-10 space-y-6">

                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-[#315EFB]/10 text-[#315EFB] rounded-2xl flex items-center justify-center shrink-0 border border-[#315EFB]/20">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-2xl font-bold text-[#001060] tracking-tight truncate">Modify Token Valuation</h2>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Update on-chain ICO pricing engine</p>
                                </div>
                            </div>

                            {/* Current Token Price Box */}
                            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-2 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-[#315EFB]" /> Current Token Price
                                    </span>
                                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold uppercase tracking-widest border border-emerald-200">
                                        Active
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between pt-1 gap-4">
                                    <div className="min-w-0">
                                        <p className="text-3xl font-extrabold text-[#315EFB] font-mono tracking-tight truncate">
                                            {currentPriceUSD !== null ? formatUSD(currentPriceUSD) : "—"}
                                        </p>
                                        <p className="text-xs text-zinc-500 font-medium">per 1 TRSIV token</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-base font-bold text-zinc-900 font-mono">
                                            {currentTokensPerUSD !== null && currentTokensPerUSD < 1e9
                                                ? `${formatDecimal(currentTokensPerUSD, 5)} TRSIV`
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
                                        className="w-full bg-white border border-zinc-200 rounded-2xl pl-12 pr-24 py-4 text-zinc-900 font-mono text-lg focus:outline-none focus:border-[#315EFB] focus:ring-1 focus:ring-[#315EFB] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-zinc-400 shadow-sm"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                                        USD / TRSIV
                                    </span>
                                </div>

                                {/* Dynamic Preview */}
                                {previewTokensPerUSD !== null && (
                                    <div className="bg-[#315EFB]/5 border border-[#315EFB]/20 rounded-xl p-3.5 flex items-center justify-between text-xs animate-in fade-in duration-200">
                                        <span className="text-zinc-600 font-medium">Resulting Conversion:</span>
                                        <span className="font-mono font-bold text-[#315EFB]">
                                            1 USD = {formatDecimal(previewTokensPerUSD, 5)} TRSIV
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
                                className="flex-[2] px-6 py-3.5 bg-[#315EFB] hover:bg-[#2548D0] text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:scale-[1.01] active:scale-[0.99]"
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
