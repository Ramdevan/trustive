"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowUpRight, RotateCw } from "lucide-react";
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
    { "inputs": [{ "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "recoverETH", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "_tokenAddress", "type": "address" }, { "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "recoverToken", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

const ERC20_ABI = [
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
];

const FALLBACK_RPCS = [
    process.env.NEXT_PUBLIC_RPC_URL,
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.drpc.org"
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
    return new ethers.JsonRpcProvider(FALLBACK_RPCS[0] || "https://ethereum-sepolia-rpc.publicnode.com");
}

interface WithdrawRecord {
    id: number;
    to_address: string;
    coin: string;
    amount: string;
    tx_hash: string;
    created_at?: string;
}

export default function AdminWallet() {
    const queryClient = useQueryClient();
    const { address, isConnected } = useAccount();
    const [balances, setBalances] = useState({ eth: "0.00000", usdt: "0.00000", usdc: "0.00000", trustive: "0.00000" });
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

            let formattedEth = "0.00000";
            try {
                const ethBal = await provider.getBalance(settings.ico_contract);
                formattedEth = parseFloat(ethers.formatEther(ethBal)).toFixed(5);
            } catch { }

            const usdtBal = await fetchTokenBal(settings.usdt_address, 6);
            const usdcBal = await fetchTokenBal(settings.usdc_address, 6);
            const trustiveBal = await fetchTokenBal(settings.contract_address, Number(settings.token_decimal || 18));

            setBalances({ eth: formattedEth, usdt: usdtBal, usdc: usdcBal, trustive: trustiveBal });
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
        toast.success("Wallet balances & history updated");
    };

    const handleWithdraw = async (coinId: 'ETH' | 'USDT' | 'USDC' | 'TRUSTIVE', currentBal: string) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!settings?.ico_contract) return toast.error("ICO contract not mapped in settings.");
        if (parseFloat(currentBal) <= 0) return toast.warn("No available balance to withdraw.");

        if (!(await confirmAction(`Are you sure you want to withdraw ${currentBal} ${coinId} to your wallet?`))) return;

        try {
            let hash: string;

            if (coinId === 'ETH') {
                hash = await writeContractAsync({
                    address: settings.ico_contract as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: 'recoverETH',
                    args: [address as `0x${string}`],
                });
            } else {
                let tokenAddr = "";
                if (coinId === 'USDT') tokenAddr = settings.usdt_address;
                else if (coinId === 'USDC') tokenAddr = settings.usdc_address;
                else if (coinId === 'TRUSTIVE') tokenAddr = settings.contract_address;

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
        <div className="space-y-10 animate-in fade-in duration-200">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
                <div>
                    <h1 className="text-2xl font-bold uppercase tracking-tight text-zinc-900">Admin Wallet</h1>
                    <p className="text-xs text-zinc-500 mt-1">Admin Console / Admin Wallet</p>
                </div>
                <button
                    onClick={handleRefreshAll}
                    disabled={isRefreshing}
                    className="bg-white border border-zinc-200/90 hover:bg-zinc-50 text-zinc-900 px-6 py-3.5 rounded-xl flex items-center gap-3 font-black text-xs uppercase tracking-widest transition-all shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                    <RotateCw className={`w-4 h-4 opacity-80 ${isRefreshing ? "animate-spin text-[#212E73]" : ""}`} />
                    <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                </button>
            </div>

            {/* Withdraw Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* ETH CARD */}
                <div className="bg-white p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[220px]">
                    <div className="flex justify-center items-center">
                        <div className="px-4 py-1.5 bg-blue-500/10 text-blue-600 rounded-xl text-xs font-black uppercase tracking-widest border border-blue-500/20 shadow-sm">ETH</div>
                    </div>
                    <div className="mt-8 space-y-1 text-center">
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Available Balance</p>
                        <div className="font-space-grotesk font-bold text-4xl text-zinc-900 tracking-tight">
                            {balances.eth} <span className="text-lg text-zinc-500">ETH</span>
                        </div>
                    </div>
                    <button onClick={() => handleWithdraw('ETH', balances.eth)} className="mt-8 w-full py-4 bg-[#212E73] hover:bg-[#1a255c] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md">
                        <ArrowUpRight className="w-4 h-4 opacity-80" /> Withdraw ETH
                    </button>
                </div>

                {/* USDT CARD */}
                <div className="bg-white p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[220px]">
                    <div className="flex justify-center items-center">
                        <div className="px-4 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-500/20 shadow-sm">USDT</div>
                    </div>
                    <div className="mt-8 space-y-1 text-center">
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Available Liquidity</p>
                        <div className="font-space-grotesk font-bold text-4xl text-zinc-900 tracking-tight">
                            {balances.usdt} <span className="text-lg text-zinc-500">USDT</span>
                        </div>
                    </div>
                    <button onClick={() => handleWithdraw('USDT', balances.usdt)} className="mt-8 w-full py-4 bg-[#212E73] hover:bg-[#1a255c] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md">
                        <ArrowUpRight className="w-4 h-4 opacity-80" /> Withdraw USDT
                    </button>
                </div>

                {/* USDC CARD */}
                <div className="bg-white p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[220px]">
                    <div className="flex justify-center items-center">
                        <div className="px-4 py-1.5 bg-blue-500/10 text-blue-600 rounded-xl text-xs font-black uppercase tracking-widest border border-blue-500/20 shadow-sm">USDC</div>
                    </div>
                    <div className="mt-8 space-y-1 text-center">
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Available Liquidity</p>
                        <div className="font-space-grotesk font-bold text-4xl text-zinc-900 tracking-tight">
                            {balances.usdc} <span className="text-lg text-zinc-500">USDC</span>
                        </div>
                    </div>
                    <button onClick={() => handleWithdraw('USDC', balances.usdc)} className="mt-8 w-full py-4 bg-[#212E73] hover:bg-[#1a255c] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md">
                        <ArrowUpRight className="w-4 h-4 opacity-80" /> Withdraw USDC
                    </button>
                </div>

                {/* TRUSTIVE CARD */}
                <div className="bg-white p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[220px]">
                    <div className="flex justify-center items-center">
                        <div className="px-4 py-1.5 bg-[#212E73]/10 text-[#212E73] rounded-xl text-xs font-black uppercase tracking-widest border border-[#212E73]/20 shadow-sm">TRUSTIVE</div>
                    </div>
                    <div className="mt-8 space-y-1 text-center">
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">System Inventory</p>
                        <div className="font-space-grotesk font-bold text-4xl text-zinc-900 tracking-tight">
                            {balances.trustive} <span className="text-lg text-zinc-500">TRUSTIVE</span>
                        </div>
                    </div>
                    <button onClick={() => handleWithdraw('TRUSTIVE', balances.trustive)} className="mt-8 w-full py-4 bg-[#212E73] hover:bg-[#1a255c] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md">
                        <ArrowUpRight className="w-4 h-4 opacity-80" /> Withdraw Trustive
                    </button>
                </div>

            </div>

            {/* Treasury Ledger */}
            <div className="bg-white rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="p-8 border-b border-zinc-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Treasury Ledger</h2>
                        <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-black mt-1">Immutable Transaction History</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#212E73] text-white">
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">ID</th>
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">Address</th>
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">Transaction Hash</th>
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">Coin</th>
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">Amount</th>
                                <th className="px-10 py-6 text-center text-xs font-black uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {loadingHistory ? (
                                <tr>
                                    <td colSpan={6} className="px-10 py-24 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#212E73] mx-auto"></div>
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-10 py-24 text-center text-zinc-500 font-medium italic">No treasury movements recorded.</td>
                                </tr>
                            ) : (
                                history.map((record, i) => (
                                    <tr key={record.id || i} className="hover:bg-zinc-50/70 transition-colors group">
                                        <td className="px-10 py-8 text-center">
                                            <span className="text-zinc-600 font-mono text-base">{record.id}</span>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-zinc-700 font-mono text-sm">{shortenAddress(record.to_address)}</span>
                                                <CopyButton text={record.to_address} label="Copy Destination Address" />
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex justify-center">
                                                <TxHashLink hash={record.tx_hash} />
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex items-center justify-center">
                                                <span className="inline-flex px-4 py-1.5 bg-zinc-100 text-zinc-700 rounded-full font-black text-[10px] tracking-widest uppercase border border-zinc-200">
                                                    {record.coin}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <span className="text-[#212E73] font-bold text-base tracking-widest">{formatDecimal(record.amount, 5, 2)}</span>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <span className={`inline-flex font-black text-xs uppercase tracking-[0.2em] items-center ${record.tx_hash ? 'text-green-600' : 'text-red-500'}`}>
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
