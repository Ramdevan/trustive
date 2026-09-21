"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowUpRight, RotateCw, ArrowDownToLine, ShieldCheck, Coins } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useAccount, useWriteContract } from "wagmi";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { formatDecimal, shortenAddress } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import TxHashLink from "@/components/TxHashLink";

// Minimal ABIs
const ICO_ABI = [
    { "inputs": [{ "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "proposeRecoverBNB", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "tokenAddr", "type": "address" }, { "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "proposeRecoverToken", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "tokenAddr", "type": "address" }, { "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "recoverToken", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" }
];

const ERC20_ABI = [
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
];

const FALLBACK_RPCS = [
    process.env.NEXT_PUBLIC_RPC_URL,
    "https://bsc-testnet-rpc.publicnode.com",
    "https://data-seed-prebsc-1-s1.binance.org:8545",
    "https://data-seed-prebsc-2-s1.binance.org:8545",
    "https://data-seed-prebsc-1-s3.binance.org:8545",
    "https://bsc-testnet.drpc.org"
].filter(Boolean) as string[];

async function getWorkingProvider() {
    for (const rpc of FALLBACK_RPCS) {
        try {
            const provider = new ethers.JsonRpcProvider(rpc);
            await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 4000))
            ]);
            return provider;
        } catch {
            // try next RPC
        }
    }
    return new ethers.JsonRpcProvider(FALLBACK_RPCS[0] || "https://bsc-testnet-rpc.publicnode.com");
}

interface WithdrawRecord {
    id: number;
    to_address: string;
    coin: string;
    amount: string;
    tx_hash: string;
    created_at?: string;
}

export default function WithdrawPage() {
    const queryClient = useQueryClient();
    const { address, isConnected } = useAccount();
    const [balances, setBalances] = useState({ bnb: "0.00000", usdt: "0.00000", usdc: "0.00000", trustive: "0.00000" });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { writeContractAsync } = useWriteContract();

    // Fetch Settings
    const { data: settingsData, refetch: refetchSettings } = useQuery({
        queryKey: ["admin-settings"],
        queryFn: () => apiRequest("/settings"),
        refetchInterval: 30000,
    });
    const settings = settingsData?.data || null;

    // Fetch Withdraw History
    const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
        queryKey: ["withdraw-history"],
        queryFn: () => apiRequest("/getWithdrawHistory"),
        refetchInterval: 15000,
    });
    const history: WithdrawRecord[] = historyData?.data || [];

    const fetchOnChainBalances = useCallback(async () => {
        if (!settings?.ico_contract) return;
        setIsRefreshing(true);
        try {
            const provider = await getWorkingProvider();

            const fetchTokenBal = async (tokenAddr: string, decimals: number) => {
                if (!tokenAddr) return "0.00000";
                try {
                    const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
                    const bal = await contract.balanceOf(settings.ico_contract);
                    return parseFloat(ethers.formatUnits(bal, decimals)).toFixed(5);
                } catch {
                    return "0.00000";
                }
            };

            let formattedBnb = "0.00000";
            try {
                const bnbBal = await provider.getBalance(settings.ico_contract);
                formattedBnb = parseFloat(ethers.formatEther(bnbBal)).toFixed(5);
            } catch { }

            const usdtBal = await fetchTokenBal(settings.usdt_address, 6);
            const usdcBal = await fetchTokenBal(settings.usdc_address, 6);
            const trustiveBal = await fetchTokenBal(settings.contract_address, Number(settings.token_decimal || 18));

            setBalances({ bnb: formattedBnb, usdt: usdtBal, usdc: usdcBal, trustive: trustiveBal });
        } catch (err) {
            console.error("Failed to read on-chain balances:", err);
        } finally {
            setIsRefreshing(false);
        }
    }, [settings]);

    useEffect(() => {
        if (settings) {
            fetchOnChainBalances();
        }
    }, [settings, fetchOnChainBalances]);

    const handleRefreshAll = async () => {
        setIsRefreshing(true);
        await Promise.all([
            refetchSettings(),
            refetchHistory(),
            fetchOnChainBalances()
        ]);
        setIsRefreshing(false);
        toast.success("Balances & withdrawal history updated");
    };

    const handleWithdraw = async (coinId: 'BNB' | 'USDT' | 'USDC' | 'TRUSTIVE' | 'TRSIV', currentBal: string) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!settings?.ico_contract) return toast.error("ICO contract not mapped in settings.");
        if (parseFloat(currentBal) <= 0) return toast.warn("No available balance to withdraw.");

        if (!(await confirmAction(`Are you sure you want to withdraw ${currentBal} ${coinId} to your wallet?`))) return;

        try {
            let hash: string;

            if (coinId === 'BNB') {
                hash = await writeContractAsync({
                    address: settings.ico_contract as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: 'proposeRecoverBNB',
                    args: [address as `0x${string}`],
                });
            } else {
                let tokenAddr = "";
                if (coinId === 'USDT') tokenAddr = settings.usdt_address;
                else if (coinId === 'USDC') tokenAddr = settings.usdc_address;
                else if (coinId === 'TRUSTIVE' || coinId === 'TRSIV') tokenAddr = settings.contract_address;

                if (!tokenAddr) return toast.error(`${coinId} address not found in settings!`);

                hash = await writeContractAsync({
                    address: settings.ico_contract as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: 'recoverToken',
                    args: [tokenAddr as `0x${string}`, address as `0x${string}`],
                });
            }

            // Sync with backend ledger via apiRequest
            await apiRequest("/createWithdraw", {
                method: "POST",
                body: JSON.stringify({
                    to_address: address,
                    coin: coinId,
                    amount: currentBal,
                    tx_hash: hash
                })
            }).catch(() => { });

            toast.success(`Withdrawal Transaction Sent! Hash: ${hash.slice(0, 8)}...`);

            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["withdraw-history"] });
                fetchOnChainBalances();
            }, 5000);

        } catch (err: any) {
            console.error(err);
            toast.error("Withdraw transaction failed: " + (err.shortMessage || err.message));
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                            Withdraw
                        </h1>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-[#315EFB] border border-[#315EFB]/20 flex items-center gap-1.5 shadow-xs">
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            Treasury Payout
                        </span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1 font-normal">
                        Withdraw collected sale revenues (BNB, USDT, USDC) and remaining TRSIV inventory from the ICO smart contract.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefreshAll}
                        disabled={isRefreshing}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        title="Refresh live balances and ledger"
                    >
                        <RotateCw className={`w-3.5 h-3.5 text-zinc-500 ${isRefreshing ? "animate-spin text-[#315EFB]" : ""}`} />
                        <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                    </button>
                </div>
            </div>

            {/* Withdraw Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* BNB CARD */}
                <div className="bg-[#ECE9EA] p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[240px]">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Available Balance
                        </span>
                        <div className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-xl text-xs font-extrabold uppercase tracking-widest border border-amber-500/20 shadow-xs">
                            BNB
                        </div>
                    </div>
                    <div className="my-6 text-center">
                        <div className="text-3xl lg:text-4xl font-bold text-[#1E1E1E] tracking-tight font-mono">
                            {balances.bnb}
                        </div>
                        <p className="text-xs text-zinc-500 font-semibold mt-1">Native BSC Coin</p>
                    </div>
                    <button
                        onClick={() => handleWithdraw('BNB', balances.bnb)}
                        className="w-full py-3.5 bg-[#315EFB] hover:bg-[#2548D0] text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-[#315EFB]/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Withdraw BNB
                    </button>
                </div>

                {/* USDT CARD */}
                <div className="bg-[#ECE9EA] p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[240px]">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Available Liquidity
                        </span>
                        <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-xl text-xs font-extrabold uppercase tracking-widest border border-emerald-500/20 shadow-xs">
                            USDT
                        </div>
                    </div>
                    <div className="my-6 text-center">
                        <div className="text-3xl lg:text-4xl font-bold text-[#1E1E1E] tracking-tight font-mono">
                            {balances.usdt}
                        </div>
                        <p className="text-xs text-zinc-500 font-semibold mt-1">Tether USD (BEP-20)</p>
                    </div>
                    <button
                        onClick={() => handleWithdraw('USDT', balances.usdt)}
                        className="w-full py-3.5 bg-[#315EFB] hover:bg-[#2548D0] text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-[#315EFB]/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Withdraw USDT
                    </button>
                </div>

                {/* USDC CARD */}
                <div className="bg-[#ECE9EA] p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[240px]">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            Available Liquidity
                        </span>
                        <div className="px-3 py-1 bg-blue-500/10 text-blue-600 rounded-xl text-xs font-extrabold uppercase tracking-widest border border-blue-500/20 shadow-xs">
                            USDC
                        </div>
                    </div>
                    <div className="my-6 text-center">
                        <div className="text-3xl lg:text-4xl font-bold text-[#1E1E1E] tracking-tight font-mono">
                            {balances.usdc}
                        </div>
                        <p className="text-xs text-zinc-500 font-semibold mt-1">USD Coin (BEP-20)</p>
                    </div>
                    <button
                        onClick={() => handleWithdraw('USDC', balances.usdc)}
                        className="w-full py-3.5 bg-[#315EFB] hover:bg-[#2548D0] text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-[#315EFB]/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Withdraw USDC
                    </button>
                </div>

                {/* TRSIV CARD */}
                <div className="bg-[#ECE9EA] p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[240px]">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            System Inventory
                        </span>
                        <div className="px-3 py-1 bg-[#315EFB]/10 text-[#315EFB] rounded-xl text-xs font-extrabold uppercase tracking-widest border border-[#315EFB]/20 shadow-xs">
                            TRSIV
                        </div>
                    </div>
                    <div className="my-6 text-center">
                        <div className="text-2xl lg:text-3xl font-bold text-[#1E1E1E] tracking-tight font-mono truncate" title={`${balances.trustive} TRSIV`}>
                            {balances.trustive}
                        </div>
                        <p className="text-xs text-zinc-500 font-semibold mt-1">Contract Token Reserves</p>
                    </div>
                    <button
                        onClick={() => handleWithdraw('TRSIV', balances.trustive)}
                        className="w-full py-3.5 bg-[#315EFB] hover:bg-[#2548D0] text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-[#315EFB]/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Withdraw TRSIV
                    </button>
                </div>

            </div>

            {/* Treasury Ledger */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-200/60 bg-white/40 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                            Treasury Ledger
                        </h2>
                        <p className="text-zinc-500 text-xs mt-0.5 font-medium">
                            Immutable audit trail of contract fund recovery transactions.
                        </p>
                    </div>
                    <span className="text-xs font-bold font-mono text-zinc-500 px-3 py-1 bg-white rounded-lg border border-zinc-200">
                        {history.length} Withdrawals
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#315EFB] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-8 py-5 text-center">ID</th>
                                <th className="px-8 py-5 text-center">Destination Address</th>
                                <th className="px-8 py-5 text-center">Transaction Hash</th>
                                <th className="px-8 py-5 text-center">Asset</th>
                                <th className="px-8 py-5 text-center">Amount</th>
                                <th className="px-8 py-5 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 bg-[#ECE9EA]">
                            {loadingHistory ? (
                                <tr>
                                    <td colSpan={6} className="px-10 py-24 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#315EFB] mx-auto"></div>
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-10 py-24 text-center text-zinc-500 font-medium italic">
                                        No treasury movements recorded.
                                    </td>
                                </tr>
                            ) : (
                                history.map((record, i) => (
                                    <tr key={record.id || i} className="hover:bg-zinc-100/60 transition-colors group">
                                        <td className="px-8 py-5 text-center">
                                            <span className="text-zinc-500 font-mono text-xs font-semibold">#{record.id}</span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-zinc-800 font-mono text-xs font-semibold" title={record.to_address}>
                                                    {shortenAddress(record.to_address)}
                                                </span>
                                                <CopyButton text={record.to_address} label="Copy Destination Address" />
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <div className="flex justify-center">
                                                <TxHashLink hash={record.tx_hash} />
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className="inline-flex px-3.5 py-1 bg-white text-zinc-800 rounded-lg font-bold text-xs uppercase tracking-wider border border-zinc-200 shadow-xs">
                                                {record.coin}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className="text-[#001060] font-mono font-bold text-sm">
                                                {formatDecimal(record.amount, 5, 2)}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                record.tx_hash 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {record.tx_hash ? "SUCCESS" : "FAILED"}
                                            </span>
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
