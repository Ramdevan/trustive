"use client";

import { useEffect, useState } from "react";
import {
    ShieldCheck,
    Vote,
    AlertOctagon,
    Play,
    Pause,
    Key,
    Coins,
    Sliders,
    UserCheck,
    UserPlus,
    Clock,
    CheckCircle2,
    RotateCw,
    Loader2,
    Crown,
    ExternalLink,
} from "lucide-react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";
import { apiRequest } from "@/lib/api-client";
import { shortenAddress, cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
    isOwnerAddress,
    isAdminAddress,
    CONTRACT_OWNERS,
    CONTRACT_ADMINS,
} from "@/lib/roles";
import {
    ICO_ABI,
    ICO_CONTRACT_ADDRESS,
    ADMIN_OP_LABELS,
    OWNER_OP_LABELS,
    ProposalItem,
    getProposalStatus,
} from "@/lib/icoAbi";

export default function GovernancePage() {
    const { address, isConnected } = useAccount();
    const isOwner = isOwnerAddress(address);
    const isAdmin = isAdminAddress(address);

    const [activeTab, setActiveTab] = useState<"all" | "admin" | "owner">("all");
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    // Modals
    const [modalType, setModalType] = useState<"signer" | "token" | "stale" | "replaceAdmin" | null>(null);
    const [inputSigner, setInputSigner] = useState("");
    const [inputToken, setInputToken] = useState("");
    const [inputStale, setInputStale] = useState("86400");
    const [oldAdmin, setOldAdmin] = useState(CONTRACT_ADMINS[0] || "");
    const [newAdmin, setNewAdmin] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { writeContractAsync } = useWriteContract();

    // Read live contract state
    const { data: pausedData, refetch: refetchPaused } = useReadContract({
        address: ICO_CONTRACT_ADDRESS as `0x${string}`,
        abi: ICO_ABI,
        functionName: "paused",
    });
    const isPaused = Boolean(pausedData);

    const { data: signerData, refetch: refetchSigner } = useReadContract({
        address: ICO_CONTRACT_ADDRESS as `0x${string}`,
        abi: ICO_ABI,
        functionName: "signer",
    });

    const { data: tokenAddrData, refetch: refetchTokenAddr } = useReadContract({
        address: ICO_CONTRACT_ADDRESS as `0x${string}`,
        abi: ICO_ABI,
        functionName: "tokenAddress",
    });

    const { data: staleData, refetch: refetchStale } = useReadContract({
        address: ICO_CONTRACT_ADDRESS as `0x${string}`,
        abi: ICO_ABI,
        functionName: "priceStaleThreshold",
    });

    // Fetch proposals
    const { data: proposalsData, isLoading: loadingProposals, refetch: refetchProposals } = useQuery({
        queryKey: ["admin-proposals"],
        queryFn: () => apiRequest("/proposals"),
        refetchInterval: 5000,
    });
    const proposals: ProposalItem[] = proposalsData?.data || [];

    const filteredProposals = proposals.filter((p) => {
        if (activeTab === "admin") return p.role === "admin";
        if (activeTab === "owner") return p.role === "owner";
        return true;
    });

    const handleRefreshAll = () => {
        refetchPaused();
        refetchSigner();
        refetchTokenAddr();
        refetchStale();
        refetchProposals();
        toast.success("Governance state refreshed");
    };

    // Emergency Pause / Unpause Proposal (Admin 3/5 Quorum)
    const handleProposePause = async () => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        if (!isAdmin && !isOwner) return toast.error("Unauthorized: Admin role required");

        const targetState = !isPaused;
        if (!(await confirmAction(`Propose to ${targetState ? "EMERGENCY PAUSE" : "RESUME"} contract token sales?\n\nRequires 3 of 5 Admin multi-sig confirmations.`))) return;

        try {
            const hash = await writeContractAsync({
                address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                abi: ICO_ABI,
                functionName: "proposeSetPaused",
                args: [targetState],
            });
            toast.success(`Proposal to ${targetState ? "pause" : "unpause"} submitted! Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Proposal failed: " + (err.shortMessage || err.message));
        }
    };

    // Confirm Proposal
    const handleConfirm = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                abi: ICO_ABI,
                functionName: "confirm",
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

    // Revoke Confirmation
    const handleRevoke = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                abi: ICO_ABI,
                functionName: "revokeConfirmation",
                args: [BigInt(id)],
            });
            toast.success(`Confirmation on proposal #${id} revoked.`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Revocation failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Execute Proposal
    const handleExecute = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                abi: ICO_ABI,
                functionName: "execute",
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} successfully executed on-chain! Tx: ${hash.slice(0, 10)}...`);
            setTimeout(() => {
                refetchProposals();
                handleRefreshAll();
            }, 5000);
        } catch (err: any) {
            toast.error("Execution failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Cancel Proposal
    const handleCancel = async (id: number) => {
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setActionLoadingId(id);
        try {
            const hash = await writeContractAsync({
                address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                abi: ICO_ABI,
                functionName: "cancelProposal",
                args: [BigInt(id)],
            });
            toast.success(`Proposal #${id} cancelled.`);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Cancellation failed: " + (err.shortMessage || err.message));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Modal Form Submissions
    const handleModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isConnected || !address) return toast.warn("Please connect your wallet");
        setIsSubmitting(true);

        try {
            let hash: string;
            if (modalType === "signer") {
                if (!ethers.isAddress(inputSigner)) return toast.error("Invalid signer address");
                hash = await writeContractAsync({
                    address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: "proposeSetSignerAddress",
                    args: [inputSigner as `0x${string}`],
                });
            } else if (modalType === "token") {
                if (!ethers.isAddress(inputToken)) return toast.error("Invalid token address");
                hash = await writeContractAsync({
                    address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: "proposeSetTokenAddress",
                    args: [inputToken as `0x${string}`],
                });
            } else if (modalType === "stale") {
                const thresholdNum = Number(inputStale);
                if (isNaN(thresholdNum) || thresholdNum <= 0) return toast.error("Invalid threshold");
                hash = await writeContractAsync({
                    address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: "proposeSetPriceStaleThreshold",
                    args: [BigInt(thresholdNum)],
                });
            } else if (modalType === "replaceAdmin") {
                if (!ethers.isAddress(newAdmin)) return toast.error("Invalid new admin address");
                hash = await writeContractAsync({
                    address: ICO_CONTRACT_ADDRESS as `0x${string}`,
                    abi: ICO_ABI,
                    functionName: "proposeReplaceAdmin",
                    args: [oldAdmin as `0x${string}`, newAdmin as `0x${string}`],
                });
            } else {
                return;
            }

            toast.success(`Multi-Sig Proposal submitted! Tx: ${hash.slice(0, 10)}...`);
            setModalType(null);
            setTimeout(() => refetchProposals(), 4000);
        } catch (err: any) {
            toast.error("Submission failed: " + (err.shortMessage || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-[#001060] tracking-tight">
                            Multi-Sig Governance & Operations
                        </h1>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-[#315EFB] border border-blue-200 flex items-center gap-1.5 shadow-xs">
                            <Vote className="w-3.5 h-3.5" />
                            Admin & Owner Governance
                        </span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1">
                        Consensus proposals for contract <span className="font-mono text-xs font-semibold text-[#315EFB]">{shortenAddress(ICO_CONTRACT_ADDRESS)}</span>. Admin operations require 3/5 quorum; Owner actions require 2/3 quorum.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefreshAll}
                        className="bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-xs"
                    >
                        <RotateCw className="w-3.5 h-3.5 text-zinc-500" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Live Contract Status Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Status / Pause */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-widest uppercase">
                            ICO Sale Status
                        </span>
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", isPaused ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
                            {isPaused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className={cn("text-2xl font-black uppercase font-manrope", isPaused ? "text-red-600" : "text-emerald-600")}>
                            {isPaused ? "PAUSED" : "ACTIVE"}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            {isPaused ? "Token sales currently halted" : "Token purchases operational"}
                        </p>
                    </div>
                </div>

                {/* Signer Address */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-widest uppercase">
                            EIP-712 Signer
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#315EFB] flex items-center justify-center">
                            <Key className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="font-mono text-xs font-bold text-zinc-900 truncate" title={signerData ? String(signerData) : ""}>
                            {signerData ? shortenAddress(String(signerData)) : "Loading..."}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            Backend signature authority
                        </p>
                    </div>
                </div>

                {/* Token Address */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-widest uppercase">
                            TRSIV Token
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Coins className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="font-mono text-xs font-bold text-zinc-900 truncate" title={tokenAddrData ? String(tokenAddrData) : ""}>
                            {tokenAddrData ? shortenAddress(String(tokenAddrData)) : "Loading..."}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            Primary ICO Asset (BEP-20)
                        </p>
                    </div>
                </div>

                {/* Stale Threshold */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-[#001060] tracking-widest uppercase">
                            Oracle Stale Limit
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Sliders className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-xl font-mono font-bold text-zinc-900">
                            {staleData ? `${staleData.toString()}s` : "86,400s"}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            24h freshness window
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Proposal Action Cards (Admins & Owners) */}
            <div className="bg-[#ECE9EA] rounded-[32px] border border-zinc-200/90 p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                            Initiate Multi-Sig Operation
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Create an on-chain proposal. Voting rights: 3 of 5 Admins or 2 of 3 Owners.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-[#315EFB] border border-blue-200">
                            🛡️ 3/5 Admin Quorum
                        </span>
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                            👑 2/3 Owner Quorum
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Emergency Pause Action */}
                    <button
                        onClick={handleProposePause}
                        className={cn(
                            "p-5 rounded-2xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer space-y-2",
                            isPaused
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100"
                                : "bg-red-50 border-red-200 text-red-900 hover:bg-red-100"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider">Sale Control</span>
                            {isPaused ? <Play className="w-4 h-4 text-emerald-600" /> : <AlertOctagon className="w-4 h-4 text-red-600" />}
                        </div>
                        <h3 className="font-bold text-sm">
                            {isPaused ? "Propose Resume Sales" : "Propose Emergency Pause"}
                        </h3>
                        <p className="text-[11px] opacity-80 leading-relaxed">
                            {isPaused ? "Reactivate token purchases on-chain" : "Halt all token sales in emergencies"}
                        </p>
                    </button>

                    {/* Update Signer Address */}
                    <button
                        onClick={() => {
                            setInputSigner(signerData ? String(signerData) : "");
                            setModalType("signer");
                        }}
                        className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer space-y-2"
                    >
                        <div className="flex items-center justify-between text-[#315EFB]">
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Security</span>
                            <Key className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#001060]">Update Backend Signer</h3>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Change EIP-712 cryptographic signature key
                        </p>
                    </button>

                    {/* Configure Oracle Staleness */}
                    <button
                        onClick={() => {
                            setInputStale(staleData ? staleData.toString() : "86400");
                            setModalType("stale");
                        }}
                        className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer space-y-2"
                    >
                        <div className="flex items-center justify-between text-amber-600">
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Oracles</span>
                            <Sliders className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#001060]">Oracle Stale Threshold</h3>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Update price feed timeout duration (seconds)
                        </p>
                    </button>

                    {/* Replace Admin Member */}
                    <button
                        onClick={() => setModalType("replaceAdmin")}
                        className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer space-y-2"
                    >
                        <div className="flex items-center justify-between text-[#315EFB]">
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Governance</span>
                            <UserPlus className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#001060]">Replace Admin Member</h3>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Propose replacing one of the 5 multisig admins
                        </p>
                    </button>
                </div>
            </div>

            {/* Live Proposals Feed & Voting Queue */}
            <div className="bg-white rounded-[32px] border border-zinc-200/90 p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-[#001060] tracking-tight">
                            Live Multi-Signature Proposals
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Vote, confirm, and execute proposals submitted by Admins and Owners.
                        </p>
                    </div>

                    {/* Role Filter Tabs */}
                    <div className="flex items-center p-1 bg-zinc-100 rounded-xl">
                        <button
                            onClick={() => setActiveTab("all")}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer", activeTab === "all" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800")}
                        >
                            All ({proposals.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("admin")}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer", activeTab === "admin" ? "bg-[#315EFB] text-white shadow-xs" : "text-zinc-500 hover:text-zinc-800")}
                        >
                            Admin (3/5)
                        </button>
                        <button
                            onClick={() => setActiveTab("owner")}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer", activeTab === "owner" ? "bg-amber-600 text-white shadow-xs" : "text-zinc-500 hover:text-zinc-800")}
                        >
                            Owner (2/3)
                        </button>
                    </div>
                </div>

                {loadingProposals ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#315EFB] mx-auto"></div>
                        <p className="mt-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Reading on-chain proposals...</p>
                    </div>
                ) : filteredProposals.length === 0 ? (
                    <div className="py-16 text-center text-zinc-500 font-medium italic bg-zinc-50 rounded-2xl border border-zinc-100">
                        No active {activeTab !== "all" ? activeTab : ""} proposals found. Use the quick action cards above to initiate one.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredProposals.map((prop) => {
                            const status = getProposalStatus(prop);
                            const isOwnerProp = prop.role === "owner";
                            const requiredThreshold = isOwnerProp ? 2 : 3;
                            const totalMembers = isOwnerProp ? 3 : 5;
                            const opLabel = isOwnerProp
                                ? OWNER_OP_LABELS[prop.payload?.opType ?? 0] || "Owner Operation"
                                : ADMIN_OP_LABELS[prop.payload?.opType ?? 0] || "Admin Operation";
                            const isProposer = address && prop.proposer.toLowerCase() === address.toLowerCase();

                            return (
                                <div
                                    key={prop.id}
                                    className="p-6 rounded-2xl border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                                >
                                    <div className="space-y-2 flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="font-mono font-bold text-xs text-zinc-900 bg-white px-2.5 py-1 rounded-lg border border-zinc-200">
                                                #{prop.id}
                                            </span>
                                            <span className={cn(
                                                "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                                isOwnerProp ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-blue-100 text-[#315EFB] border-blue-300"
                                            )}>
                                                {isOwnerProp ? "👑 Owner Proposal" : "🛡️ Admin Proposal"}
                                            </span>
                                            <span className="font-bold text-sm text-[#001060]">
                                                {opLabel}
                                            </span>
                                            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", status.color)}>
                                                {status.label}
                                            </span>
                                        </div>

                                        {/* Payload Parameters */}
                                        <div className="text-xs text-zinc-600 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                                            <span>Proposer: <span className="text-zinc-800 font-semibold">{shortenAddress(prop.proposer)}</span></span>
                                            {prop.payload?.account && (
                                                <span>Target: <span className="text-zinc-800 font-semibold">{shortenAddress(prop.payload.account)}</span></span>
                                            )}
                                            {prop.payload?.boolValue !== undefined && (
                                                <span>Target State: <span className="text-zinc-800 font-bold">{prop.payload.boolValue ? "PAUSED" : "ACTIVE"}</span></span>
                                            )}
                                            {prop.expiresAt > 0 && !prop.executed && !prop.cancelled && (
                                                <span className="text-zinc-500 flex items-center gap-1 font-sans">
                                                    <Clock className="w-3 h-3 text-amber-500" />
                                                    {status.isExpired ? "Expired" : `Expires in ${Math.max(0, Math.floor((prop.expiresAt - Math.floor(Date.now() / 1000))))}s`}
                                                </span>
                                            )}
                                        </div>

                                        {/* Quorum Progress Bar */}
                                        <div className="pt-2 max-w-sm">
                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                                <span>Consensus Progress</span>
                                                <span className={prop.confirmations >= requiredThreshold ? "text-emerald-600 font-black" : "text-amber-600"}>
                                                    {prop.confirmations} of {requiredThreshold} Required ({totalMembers} Members)
                                                </span>
                                            </div>
                                            <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                                                <div
                                                    className={cn("h-full transition-all", prop.confirmations >= requiredThreshold ? "bg-emerald-500" : "bg-amber-500")}
                                                    style={{ width: `${Math.min(100, (prop.confirmations / requiredThreshold) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    {!prop.executed && !prop.cancelled && !status.isExpired && (
                                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                            {/* Confirm Vote */}
                                            <button
                                                onClick={() => handleConfirm(prop.id)}
                                                disabled={actionLoadingId === prop.id}
                                                className="px-4 py-2.5 bg-[#315EFB] hover:bg-[#2548D0] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                                            >
                                                {actionLoadingId === prop.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <UserCheck className="w-3.5 h-3.5" />
                                                )}
                                                Confirm (Vote)
                                            </button>

                                            {/* Revoke Vote */}
                                            <button
                                                onClick={() => handleRevoke(prop.id)}
                                                disabled={actionLoadingId === prop.id}
                                                className="px-3 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                                title="Revoke your vote"
                                            >
                                                Revoke
                                            </button>

                                            {/* Execute Action (when quorum reached) */}
                                            {prop.isExecutable && (
                                                <button
                                                    onClick={() => handleExecute(prop.id)}
                                                    disabled={actionLoadingId === prop.id}
                                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5 animate-bounce"
                                                >
                                                    {actionLoadingId === prop.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                    )}
                                                    Execute ({requiredThreshold}/{requiredThreshold})
                                                </button>
                                            )}

                                            {/* Cancel Proposal */}
                                            {isProposer && (
                                                <button
                                                    onClick={() => handleCancel(prop.id)}
                                                    disabled={actionLoadingId === prop.id}
                                                    className="px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
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

            {/* Modal for Parameter Adjustments */}
            {modalType && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full border border-zinc-200 shadow-2xl space-y-6">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                            <h3 className="text-lg font-bold text-[#001060]">
                                {modalType === "signer" && "Propose Signer Address"}
                                {modalType === "token" && "Propose Token Address"}
                                {modalType === "stale" && "Propose Price Stale Threshold"}
                                {modalType === "replaceAdmin" && "Propose Replace Admin"}
                            </h3>
                            <button
                                onClick={() => setModalType(null)}
                                className="text-zinc-400 hover:text-zinc-700 font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleModalSubmit} className="space-y-4">
                            {modalType === "signer" && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">New Backend Signer Address</label>
                                    <input
                                        type="text"
                                        required
                                        value={inputSigner}
                                        onChange={(e) => setInputSigner(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                    />
                                </div>
                            )}

                            {modalType === "token" && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">New TRSIV Token Address</label>
                                    <input
                                        type="text"
                                        required
                                        value={inputToken}
                                        onChange={(e) => setInputToken(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                    />
                                </div>
                            )}

                            {modalType === "stale" && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Max Stale Seconds (e.g. 86400 = 24h)</label>
                                    <input
                                        type="number"
                                        required
                                        value={inputStale}
                                        onChange={(e) => setInputStale(e.target.value)}
                                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                    />
                                </div>
                            )}

                            {modalType === "replaceAdmin" && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Admin to Replace</label>
                                        <select
                                            value={oldAdmin}
                                            onChange={(e) => setOldAdmin(e.target.value)}
                                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                        >
                                            {CONTRACT_ADMINS.map((addr) => (
                                                <option key={addr} value={addr}>{addr}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">New Admin Address</label>
                                        <input
                                            type="text"
                                            required
                                            value={newAdmin}
                                            onChange={(e) => setNewAdmin(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-xs text-zinc-900 outline-none"
                                        />
                                    </div>
                                </>
                            )}

                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Requires <strong>3 of 5 Admin multi-sig confirmations</strong> before execution.
                            </p>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setModalType(null)}
                                    className="px-4 py-2.5 text-zinc-600 font-bold text-xs uppercase"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-[#315EFB] hover:bg-[#2548D0] text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
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
