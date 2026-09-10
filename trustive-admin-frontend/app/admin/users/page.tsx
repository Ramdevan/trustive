"use client";

import { useState } from "react";
import {
    Search,
    Users,
    User as UserIcon,
    X,
    TrendingUp,
    Coins,
    ShieldCheck,
    Wallet,
    ChevronRight,
    Box,
    Gem,
    Users2,
    DollarSign,
    Zap,
    Copy,
    Check
} from "lucide-react";
import { toast } from "react-toastify";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { cn, shortenAddress, formatDecimal } from "@/lib/utils";

interface User {
    id: number;
    name: string;
    email: string;
    wallet_address: string;
    ptc_tokens_purchased: string;
    total_usd_invested: string;
    profile_pic?: string | null;
    kyc_status?: string | null;
}

interface UserProfileStats {
    balance: string;
    total_staked: string;
    total_rewards: string;
    total_vested: string;
    total_eth: string;
    total_usdt: string;
    unclaimed_boxes: number;
    nft_assets: number;
    referral_bonus: number;
    profile_pic?: string | null;
}

function CopyAddressButton({ address }: { address: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!address) return;
        navigator.clipboard.writeText(address);
        setCopied(true);
        toast.success("Wallet address copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-lg text-zinc-500 hover:text-accent hover:bg-white/5 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
            title="Copy wallet address"
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
                <Copy className="w-3.5 h-3.5" />
            )}
        </button>
    );
}

export default function UsersPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedUser, setSelectedUser] = useState<{ id: number; wallet_address: string | null } | null>(null);

    const { data: usersData, isLoading } = useQuery({
        queryKey: ["users"],
        queryFn: () => apiRequest("/users"),
    });

    const users: User[] = usersData?.users || [];

    const filteredUsers = users.filter((u) => {
        const query = searchTerm.toLowerCase();
        return (
            (u.name && u.name.toLowerCase().includes(query)) ||
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.wallet_address && u.wallet_address.toLowerCase().includes(query))
        );
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-white uppercase tracking-tight">User Registry</h1>
                        <span className="px-3 py-1 bg-[#E5B258]/10 border border-[#E5B258]/20 rounded-full text-[10px] font-black text-[#E5B258] uppercase tracking-widest">
                            Global Asset Directory
                        </span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">Manage and monitor all participants in the Trustive ecosystem</p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-96">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search wallet, name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#0A0908] border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent/40 transition-colors"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-[#0A0908] rounded-[32px] border border-white/5 overflow-hidden shadow-2xl relative z-10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#E5B258] text-black uppercase font-black text-xs tracking-widest">
                                <th className="px-10 py-8 text-center rounded-tl-[32px]">S/No</th>
                                <th className="px-10 py-8 text-center">WALLET ADDRESS</th>
                                <th className="px-10 py-8 text-center">TRUSTIVE BALANCE</th>
                                <th className="px-10 py-8 text-center">KYC STATUS</th>
                                <th className="px-10 py-8 text-center">STATUS</th>
                                <th className="px-12 py-8 text-center rounded-tr-[32px]">ACCOUNT PROFILE</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
                                        <div className="animate-spin h-10 w-10 border-b-2 border-accent mx-auto rounded-full" />
                                        <p className="mt-4 text-white/20 font-bold uppercase tracking-widest text-xs">Querying Database Registry...</p>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center text-white/20 uppercase font-black tracking-widest text-sm">
                                        No users identified matching the criteria
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u, i) => (
                                    <tr key={u.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-10 py-8 text-center">
                                            <span className="text-white/20 font-mono text-base group-hover:text-white/40 transition-colors">
                                                {(i + 1).toString().padStart(2, '0')}
                                            </span>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex items-center justify-center gap-5">
                                                <div className="w-12 h-12 rounded-xl bg-accent/5 border border-white/5 flex items-center justify-center shrink-0 group-hover:border-accent/20 transition-all overflow-hidden">
                                                    {u.profile_pic ? (
                                                        <img
                                                            src={u.profile_pic.startsWith('http') || u.profile_pic.startsWith('data:') ? u.profile_pic : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007'}${u.profile_pic}`}
                                                            alt="Profile"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <UserIcon className="w-6 h-6 text-accent/40 group-hover:text-accent transition-colors" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col min-w-0 items-start">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-white text-base font-medium tracking-tight truncate" title={u.wallet_address}>
                                                            {u.wallet_address ? shortenAddress(u.wallet_address) : 'Unlinked Account'}
                                                        </span>
                                                        {u.wallet_address && <CopyAddressButton address={u.wallet_address} />}
                                                    </div>
                                                    <span className="text-xs text-white/30 uppercase font-bold tracking-widest mt-1 truncate">
                                                        {u.name || u.email || 'Anonymous User'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col items-center">
                                                <span className="text-white font-bold text-lg">
                                                    {formatDecimal(u.ptc_tokens_purchased, 5, 2)}
                                                </span>
                                                <span className="text-[10px] text-accent/60 font-bold uppercase tracking-wider mt-1">Trustive Tokens</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            {u.kyc_status === 'verified' ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    Verified
                                                </span>
                                            ) : u.kyc_status === 'pending' ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold uppercase tracking-wider border border-amber-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                    Pending
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/60 text-zinc-400 text-xs font-bold uppercase tracking-wider border border-zinc-700/30">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                                    Unverified
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 text-green-500 text-xs font-bold uppercase tracking-widest border border-green-500/20">
                                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                Active
                                            </span>
                                        </td>
                                        <td className="px-12 py-8 text-center">
                                            <button
                                                onClick={() => setSelectedUser({ id: u.id, wallet_address: u.wallet_address || null })}
                                                className="px-8 py-3 bg-accent text-black text-xs font-black uppercase tracking-[0.1em] rounded-full hover:bg-accent/90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/10"
                                            >
                                                View Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Profile Modal */}
            {selectedUser && (
                <ProfileModal
                    address={selectedUser.wallet_address || ""}
                    userId={selectedUser.id}
                    name={users.find(u => u.id === selectedUser.id)?.name || ""}
                    email={users.find(u => u.id === selectedUser.id)?.email || ""}
                    onClose={() => setSelectedUser(null)}
                />
            )}
        </div>
    );
}

function ProfileModal({ address, userId, name, email, onClose }: { address: string; userId: number; name: string; email: string; onClose: () => void }) {
    // Use wallet address if available, otherwise fall back to user ID
    const profileParam = address || `id/${userId}`;
    const { data: profileData, isLoading } = useQuery({
        queryKey: ["user-profile", profileParam],
        queryFn: () => apiRequest(`/user-profile/${profileParam}`),
        enabled: !!address || !!userId,
    });

    const stats: UserProfileStats | null = profileData?.stats || null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm px-4" onClick={onClose} />

            <div className="relative w-full max-w-4xl bg-sidebar rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_0_100px_rgba(229,169,62,0.1)] animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        {/* Profile Image Box */}
                        <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl">
                            {stats?.profile_pic ? (
                                <img
                                    src={stats.profile_pic.startsWith('http') || stats.profile_pic.startsWith('data:') ? stats.profile_pic : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007'}${stats.profile_pic}`}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <UserIcon className="w-10 h-10 text-white/10" />
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                    {name || "User Profile"}
                                </h2>
                                <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-bold text-green-500 uppercase tracking-widest">
                                    Verification Success
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-white/40 font-mono text-sm tracking-tight">{address || 'No Wallet Linked'}</p>
                                    {address && <CopyAddressButton address={address} />}
                                </div>
                                <p className="text-accent/60 text-xs font-medium lowercase tracking-wide">{email}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-all group self-start"
                    >
                        <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    {isLoading ? (
                        <div className="py-24 text-center">
                            <div className="animate-spin h-12 w-12 border-b-2 border-accent mx-auto rounded-full" />
                            <p className="mt-4 text-white/20 font-bold uppercase tracking-widest text-xs">Assembling Data...</p>
                        </div>
                    ) : stats ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <StatCard
                                label="Trustive Balance"
                                value={formatDecimal(stats.balance, 5, 2)}
                                unit="Trustive"
                                icon={TrendingUp}
                                color="text-accent"
                            />

                            <StatCard
                                label="Total Staked Reward"
                                value={formatDecimal(stats.total_rewards, 5, 2)}
                                unit="Trustive"
                                icon={TrendingUp}
                                color="text-purple-400"
                            />
                            <StatCard
                                label="Total USDT"
                                value={formatDecimal(stats.total_usdt, 5, 2)}
                                unit="USD"
                                icon={DollarSign}
                                color="text-green-500"
                            />
                            <StatCard
                                label="Total Vested"
                                value={formatDecimal(stats.total_vested, 5, 2)}
                                unit="Trustive"
                                icon={ShieldCheck}
                                color="text-blue-500"
                            />

                        </div>
                    ) : (
                        <div className="py-24 text-center text-white/20 uppercase font-black tracking-widest text-sm">
                            Failed to load user statistics
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-white/5 text-white/60 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-white/10 hover:text-white transition-all"
                    >
                        Close Registry
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, unit, icon: Icon, color }: {
    label: string;
    value: string;
    unit: string;
    icon: any;
    color: string
}) {
    return (
        <div className="p-6 bg-white/[0.03] border border-white/5 rounded-3xl group hover:border-white/10 transition-all shadow-lg hover:shadow-black/40">
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center transition-all group-hover:scale-110", color)}>
                    <Icon size={20} />
                </div>
                <ChevronRight size={16} className="text-white/10" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] mb-1">{label}</span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black text-white tracking-tight">{value}</span>
                    <span className="text-[9px] font-bold text-accent uppercase tracking-widest">{unit}</span>
                </div>
            </div>
        </div>
    );
}
