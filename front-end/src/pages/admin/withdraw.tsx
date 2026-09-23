"use client";

import { useEffect, useState, useCallback } from "react";
import {
    ArrowUpRight,
    RotateCw,
    ArrowDownToLine,
    ShieldCheck,
    Coins,
    Crown,
    CheckCircle2,
    Clock,
    UserCheck,
    AlertTriangle,
    XCircle,
    UserPlus,
    Loader2,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useAccount, useWriteContract } from "wagmi";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { formatDecimal, shortenAddress, cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import TxHashLink from "@/components/TxHashLink";
import { isOwnerAddress, CONTRACT_OWNERS, OWNER_QUORUM } from "@/lib/roles";
import {
    ICO_ABI,
    ICO_CONTRACT_ADDRESS,
    OWNER_OP_LABELS,
    ProposalItem,
    getProposalStatus,
} from "@/lib/icoAbi";

const ERC20_ABI = [
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
];

const FALLBACK_RPCS = [
    process.env.NEXT_PUBLIC_RPC_URL,
    "https://bsc-testnet-rpc.publicnode.com",
    "https://data-seed-prebsc-1-s1.binance.org:8545",
    "https://data-seed-prebsc-2-s1.binance.org:8545",
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
        } catch { }
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
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    // Replace Owner Modal
    const [showReplaceModal, setShowReplaceModal] = useState(false);
    const [oldOwnerAddr, setOldOwnerAddr] = useState(CONTRACT_OWNERS[0] || "");
    const [newOwnerAddr, setNewOwnerAddr] = useState("");
    const [isSubmittingOwner, setIsSubmittingOwner] = useState(false);

    const { writeContractAsync } = useWriteContract();

    // Fetch Settings
    const { data: settingsData, refetch: refetchSettings } = useQuery({
        queryKey: ["admin-settings"],
        queryFn: () => apiRequest("/settings"),
        refetchInterval: 30000,
    });
    const settings = settingsData?.data || null;
    const icoContract = settings?.ico_contract || ICO_CONTRACT_ADDRESS;

    // Fetch Withdraw History
    const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
        queryKey: ["withdraw-history"],
        queryFn: () => apiRequest("/getWithdrawHistory"),
        refetchInterval: 15000,
    });
    const history: WithdrawRecord[] = historyData?.data || [];

    // Fetch On-chain Proposals
    const { data: proposalsData, isLoading: loadingProposals, refetch: refetchProposals } = useQuery({
        queryKey: ["admin-proposals"],
        queryFn: () => apiRequest("/proposals"),
        refetchInterval: 5000,
    });
    const allProposals: ProposalItem[] = proposalsData?.data || [];
    const ownerProposals = allProposals.filter((p) => p.role === "owner");

    const fetchOnChainBalances = useCallback(async () => {
        if (!icoContract) return;
        setIsRefreshing(true);
        try {
            const provider = await getWorkingProvider();

            const fetchTokenBal = async (tokenAddr: string, decimals: number) => {
                if (!tokenAddr) return "0.00000";
                try {
                    const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
                    const bal = await contract.balanceOf(icoContract);
                    return parseFloat(ethers.formatUnits(bal, decimals)).toFixed(5);
                } catch {
                    return "0.00000";
                }
            };

            let formattedBnb = "0.00000";
            try {
                const bnbBal = await provider.getBalance(icoContract);
                formattedBnb = parseFloat(ethers.formatEther(bnbBal)).toFixed(5);
            } catch { }

            const usdtBal = await fetchTokenBal(settings?.usdt_address || "0xFF891d2335d111fb71Eecec16255a6F285eF9aD3", 6);
            const usdcBal = await fetchTokenBal(settings?.usdc_address || "0xFC266AF032A9243dba4f9Dfe0BE69e6f76d1b80b", 18);
            const trustiveBal = await fetchTokenBal(settings?.contract_address || "0xe12F60d7c0bc493b033c789Aa533E772541041eA", Number(settings?.token_decimal || 18));

            setBalances({ bnb: formattedBnb, usdt: usdtBal, usdc: usdcBal, trustive: trustiveBal });
        } catch (err) {
            console.error("Failed to read on-chain balances:", err);
        } finally {
            setIsRefreshing(false);
        }
    }, [icoContract, settings]);

    useEffect(() => {
        if (icoContract) {
            fetchOnChainBalances();
        }
    }, [icoContract, fetchOnChainBalances]);

    const handleRefreshAll = async () => {
        setIsRefreshing(true);
        await Promise.all([
            refetchSettings(),
            refetchHistory(),
            refetchProposals(),
            fetchOnChainBalances(),
        ]);
        setIsRefreshing(false);
        toast.success("Balances & proposals refreshed");
    };

    // Propose Recovery (Creates on-chain proposal)
    const handleProposeWithdraw = async (coinId: 'BNB' | 'USDT' | 'USDC' | 'TRUSTIVE' | 'TRSIV', currentBal: string) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!isOwnerAddress(address)) {
            return toast.error("Unauthorized: Fund recovery proposals are strictly restricted to the 3 Contract Owners (2/3 Multisig).");
        }
        if (parseFloat(currentBal) <= 0) return toast.warn("No available balance to withdraw.");

        if (!(await confirmAction(`Create on-chain Multi-Sig proposal to withdraw ${currentBal} ${coinId} to ${shortenAddress(address)}? Requires 2 of 3 Owner confirmations.`))) return;

        try {
            let hash: string;

            if (coinId === 'BNB') {
                hash = await writeContractAsync({
                    address: icoContract as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: 'proposeRecoverBNB',
                    args: [address as `0x${string}`],
                });
            } else {
                let tokenAddr = "";
                if (coinId === 'USDT') tokenAddr = settings?.usdt_address || "0xFF891d2335d111fb71Eecec16255a6F285eF9aD3";
                else if (coinId === 'USDC') tokenAddr = settings?.usdc_address || "0xFC266AF032A9243dba4f9Dfe0BE69e6f76d1b80b";
                else if (coinId === 'TRUSTIVE' || coinId === 'TRSIV') tokenAddr = settings?.contract_address || "0xe12F60d7c0bc493b033c789Aa533E772541041eA";

                if (!tokenAddr) return toast.error(`${coinId} contract address not found!`);

                hash = await writeContractAsync({
                    address: icoContract as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: 'proposeRecoverToken',
                    args: [tokenAddr as `0x${string}`, address as `0x${string}`],
                });
            }

            // Sync with backend ledger
            await apiRequest("/createWithdraw", {
                method: "POST",
                body: JSON.stringify({
                    to_address: address,
                    coin: coinId,
                    amount: currentBal,
                    tx_hash: hash,
                }),
            }).catch(() => { });

            toast.success(`Multi-Sig Recovery Proposal Submitted! Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => {
                refetchProposals();
                refetchHistory();
                fetchOnChainBalances();
            }, 4000);
        } catch (err: any) {
            console.error(err);
            toast.error("Withdraw proposal failed: " + (err.shortMessage || err.message));
        }
    };

    // Confirm Proposal
    const handleConfirmProposal = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!isOwnerAddress(address)) return toast.error("Only Contract Owners can confirm owner proposals.");

        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: icoContract as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'confirm',
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} confirmed! Hash: ${hash.slice(0, 10)}...`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Confirmation failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Execute Proposal (Once quorum reached)
    const handleExecuteProposal = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!isOwnerAddress(address)) return toast.error("Only Contract Owners can execute owner proposals.");

        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: icoContract as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'execute',
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} executed! Funds released. Hash: ${hash.slice(0, 10)}...`);
            setTimeout(() => {
                refetchProposals();
                refetchHistory();
                fetchOnChainBalances();
            }, 5000);
        } catch (err: any) {
            toast.error("Execution failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Cancel Proposal
    const handleCancelProposal = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: icoContract as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'cancelProposal',
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} cancelled. Hash: ${hash.slice(0, 10)}...`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Cancellation failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Submit Replace Owner Proposal
    const handleProposeReplaceOwner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isConnected || !address) return toast.warn("Please connect your wallet first.");
        if (!isOwnerAddress(address)) return toast.error("Only Owners can propose owner replacement.");
        if (!ethers.isAddress(newOwnerAddr)) return toast.error("Invalid new owner Ethereum address.");

        setIsSubmittingOwner(true);
        try {
            const hash = await writeContractAsync({
                address: icoContract as `0x${string}`,
                abi: ICO_ABI,
                functionName: 'proposeReplaceOwner',
                args: [oldOwnerAddr as `0x${string}`, newOwnerAddr as `0x${string}`],
            });
            toast.success(`Proposal to replace owner submitted! Tx: ${hash.slice(0, 10)}...`);
            setShowReplaceModal(false);
            setNewOwnerAddr("");
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Proposal failed: " + (err.shortMessage || err.message));
        } finally {
            setIsSubmittingOwner(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                            Withdraw & Treasury Recovery
                        </h1>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-xs">
                            <Crown className="w-3.5 h-3.5 text-amber-600" />
                            Owner Multisig (2/3 Quorum)
                        </span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1 font-normal">
                        Initiate, confirm, and execute multi-signature recovery proposals to withdraw collected ICO revenues from contract <span className="font-mono text-xs text-[#36A886] font-semibold">{shortenAddress(icoContract)}</span>.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReplaceModal(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        Replace Owner
                    </button>
                    <button
                        onClick={handleRefreshAll}
                        disabled={isRefreshing}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        title="Refresh live balances and ledger"
                    >
                        <RotateCw className={`w-3.5 h-3.5 text-zinc-500 ${isRefreshing ? "animate-spin text-[#36A886]" : ""}`} />
                        <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                    </button>
                </div>
            </div>

            {/* Multisig Treasury Info Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-700 shrink-0">
                        <Crown className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                            Owner Multi-Signature Quorum (2 of 3 Required)
                        </h3>
                        <p className="text-xs text-amber-800/80 mt-0.5">
                            Withdrawal proposals require multi-signature approval from at least 2 of the 3 Contract Owners. Once 2 confirmations are met, any Owner can execute the proposal to release the funds.
                        </p>
                    </div>
                </div>
                <div className="text-xs font-mono font-bold text-amber-900 bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg shrink-0">
                    {isOwnerAddress(address) ? "✓ Authorized Owner" : "⚠️ Connect Owner Wallet"}
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
                        onClick={() => handleProposeWithdraw('BNB', balances.bnb)}
                        className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-amber-600/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Propose BNB Withdraw
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
                        onClick={() => handleProposeWithdraw('USDT', balances.usdt)}
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-emerald-600/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Propose USDT Withdraw
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
                        onClick={() => handleProposeWithdraw('USDC', balances.usdc)}
                        className="w-full py-3.5 bg-[#36A886] hover:bg-[#2548D0] text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-[#36A886]/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Propose USDC Withdraw
                    </button>
                </div>

                {/* TRSIV CARD */}
                <div className="bg-[#ECE9EA] p-8 rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[240px]">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-[0.2em] uppercase">
                            System Inventory
                        </span>
                        <div className="px-3 py-1 bg-purple-500/10 text-purple-600 rounded-xl text-xs font-extrabold uppercase tracking-widest border border-purple-500/20 shadow-xs">
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
                        onClick={() => handleProposeWithdraw('TRSIV', balances.trustive)}
                        className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase tracking-wider text-xs rounded-xl flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-purple-600/20"
                    >
                        <ArrowUpRight className="w-4 h-4" /> Propose TRSIV Withdraw
                    </button>
                </div>
            </div>

            {/* Live Owner Multi-Sig Proposals Section */}
            <div className="bg-white rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4 p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                                Active Multi-Sig Recovery Proposals
                            </h2>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase border border-amber-300">
                                2 of 3 Quorum
                            </span>
                        </div>
                        <p className="text-zinc-500 text-xs mt-0.5 font-medium">
                            Proposals submitted by Owners. Requires 2 Owner confirmations to execute fund recovery.
                        </p>
                    </div>
                    <button
                        onClick={() => refetchProposals()}
                        className="text-xs font-bold text-[#36A886] uppercase tracking-wider hover:underline self-start sm:self-auto cursor-pointer"
                    >
                        Refresh Proposals
                    </button>
                </div>

                {loadingProposals ? (
                    <div className="py-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                        <p className="mt-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Checking on-chain proposals...</p>
                    </div>
                ) : ownerProposals.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 font-medium italic bg-zinc-50 rounded-2xl border border-zinc-100">
                        No active Owner proposals. Click any &quot;Propose Withdraw&quot; button above to create a multi-sig proposal.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {ownerProposals.map((prop) => {
                            const status = getProposalStatus(prop);
                            const opLabel = OWNER_OP_LABELS[prop.payload?.opType ?? 0] || "Owner Proposal";
                            const isProposer = address && prop.proposer.toLowerCase() === address.toLowerCase();

                            return (
                                <div
                                    key={prop.id}
                                    className="p-5 rounded-2xl border border-zinc-200 bg-zinc-50/60 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                                >
                                    <div className="space-y-1.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-bold text-xs text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">
                                                Proposal #{prop.id}
                                            </span>
                                            <span className="text-xs font-bold text-[#001060]">
                                                {opLabel}
                                            </span>
                                            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", status.color)}>
                                                {status.label}
                                            </span>
                                        </div>

                                        <div className="text-xs text-zinc-600 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                                            <span>Target: <span className="font-semibold text-zinc-800">{shortenAddress(prop.payload?.account || "")}</span></span>
                                            <span>Proposer: <span className="text-zinc-600">{shortenAddress(prop.proposer)}</span></span>
                                            {prop.expiresAt > 0 && !prop.executed && !prop.cancelled && (
                                                <span className="text-zinc-500 flex items-center gap-1 font-sans">
                                                    <Clock className="w-3 h-3 text-amber-500" />
                                                    {status.isExpired ? "Expired" : `Expires in ${Math.max(0, Math.floor((prop.expiresAt - Math.floor(Date.now() / 1000))))}s`}
                                                </span>
                                            )}
                                        </div>

                                        {/* Quorum Progress Bar */}
                                        <div className="pt-1 max-w-xs">
                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                                <span>Confirmations</span>
                                                <span className={prop.confirmations >= 2 ? "text-emerald-600 font-black" : "text-amber-600"}>
                                                    {prop.confirmations} / 2 Required
                                                </span>
                                            </div>
                                            <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                                                <div
                                                    className={cn("h-full transition-all", prop.confirmations >= 2 ? "bg-emerald-500" : "bg-amber-500")}
                                                    style={{ width: `${Math.min(100, (prop.confirmations / 2) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {!prop.executed && !prop.cancelled && !status.isExpired && (
                                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                            {/* Confirm Button */}
                                            <button
                                                onClick={() => handleConfirmProposal(prop.id)}
                                                disabled={actionLoadingId === prop.id}
                                                className="px-4 py-2 bg-[#36A886] hover:bg-[#2548D0] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                                            >
                                                {actionLoadingId === prop.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <UserCheck className="w-3.5 h-3.5" />
                                                )}
                                                Confirm (Vote)
                                            </button>

                                            {/* Execute Button */}
                                            {prop.isExecutable && (
                                                <button
                                                    onClick={() => handleExecuteProposal(prop.id)}
                                                    disabled={actionLoadingId === prop.id}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5 animate-bounce"
                                                >
                                                    {actionLoadingId === prop.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                    )}
                                                    Execute (2/2)
                                                </button>
                                            )}

                                            {/* Cancel Button */}
                                            {isProposer && (
                                                <button
                                                    onClick={() => handleCancelProposal(prop.id)}
                                                    disabled={actionLoadingId === prop.id}
                                                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                                                    title="Cancel Proposal"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
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
                            <tr className="bg-[#36A886] text-white uppercase font-bold text-xs tracking-widest">
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
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#36A886] mx-auto"></div>
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
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${record.tx_hash
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

            {/* Replace Owner Modal */}
            {showReplaceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full border border-zinc-200 shadow-2xl space-y-6">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                            <div className="flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-600" />
                                <h3 className="text-lg font-bold text-[#001060]">Propose Replace Owner</h3>
                            </div>
                            <button
                                onClick={() => setShowReplaceModal(false)}
                                className="text-zinc-400 hover:text-zinc-700 font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleProposeReplaceOwner} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                                    Owner to Replace (Old Member)
                                </label>
                                <select
                                    value={oldOwnerAddr}
                                    onChange={(e) => setOldOwnerAddr(e.target.value)}
                                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                >
                                    {CONTRACT_OWNERS.map((addr) => (
                                        <option key={addr} value={addr}>
                                            {addr} {address && addr.toLowerCase() === address.toLowerCase() ? "(Your Address)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                                    New Owner Ethereum Address
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newOwnerAddr}
                                    onChange={(e) => setNewOwnerAddr(e.target.value)}
                                    placeholder="0x..."
                                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none focus:border-amber-500"
                                />
                            </div>

                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Submitting this transaction creates an on-chain proposal. It requires <strong>2 of 3 Owner confirmations</strong> before it can be executed to rotate ownership.
                            </p>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowReplaceModal(false)}
                                    className="px-4 py-2.5 text-zinc-600 font-bold text-xs uppercase"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingOwner}
                                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {isSubmittingOwner && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Submit Proposal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
