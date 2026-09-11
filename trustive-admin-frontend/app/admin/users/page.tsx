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
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-zinc-900 uppercase tracking-tight">User Registry</h1>
                        <span className="px-3 py-1 bg-[#212E73]/10 border border-[#212E73]/20 rounded-full text-[10px] font-bold text-[#212E73] uppercase tracking-widest">
                            Global Asset Directory
                        </span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">Manage and monitor all participants in the Trustive ecosystem</p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-96">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search wallet, name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-2xl pl-11 pr-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] transition-colors shadow-sm"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-[32px] border border-zinc-200/90 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative z-10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#212E73] text-white uppercase font-bold text-xs tracking-widest">
                                <th className="px-10 py-6 text-center rounded-tl-[32px]">S/No</th>
                                <th className="px-10 py-6 text-center">WALLET ADDRESS</th>
                                <th className="px-10 py-6 text-center">TRUSTIVE BALANCE</th>
                                <th className="px-10 py-6 text-center">STATUS</th>
                                <th className="px-12 py-6 text-center rounded-tr-[32px]">ACCOUNT PROFILE</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-24 text-center">
                                        <div className="animate-spin h-10 w-10 border-b-2 border-[#212E73] mx-auto rounded-full" />
                                        <p className="mt-4 text-zinc-400 font-bold uppercase tracking-widest text-xs">Querying Database Registry...</p>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-24 text-center text-zinc-400 uppercase font-bold tracking-widest text-sm italic">
                                        No users identified matching the criteria
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u, i) => (
                                    <tr key={u.id} className="hover:bg-zinc-50/70 transition-colors group">
                                        <td className="px-10 py-6 text-center">
                                            <span className="text-zinc-400 font-mono text-base">
                                                {(i + 1).toString().padStart(2, '0')}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <div className="flex items-center justify-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                    {u.profile_pic ? (
                                                        <img
                                                            src={u.profile_pic.startsWith('http') || u.profile_pic.startsWith('data:') ? u.profile_pic : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007'}${u.profile_pic}`}
                                                            alt="Profile"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <UserIcon className="w-6 h-6 text-[#212E73]/60" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col min-w-0 items-start">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-zinc-900 text-base font-semibold tracking-tight truncate" title={u.wallet_address}>
                                                            {u.wallet_address ? shortenAddress(u.wallet_address) : 'Unlinked Account'}
                                                        </span>
                                                        {u.wallet_address && <CopyAddressButton address={u.wallet_address} />}
                                                    </div>
                                                    <span className="text-xs text-zinc-500 font-medium truncate">
                                                        {u.name || u.email || 'Anonymous User'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col items-center">
                                                <span className="text-zinc-900 font-bold text-lg">
                                                    {formatDecimal(u.ptc_tokens_purchased, 5, 2)}
                                                </span>
                                                <span className="text-[10px] text-[#212E73] font-bold uppercase tracking-wider mt-0.5">Trustive Tokens</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-widest border border-emerald-200">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                Active
                                            </span>
                                        </td>
                                        <td className="px-12 py-6 text-center">
                                            <button
                                                onClick={() => setSelectedUser({ id: u.id, wallet_address: u.wallet_address || null })}
                                                className="px-6 py-2.5 bg-[#212E73] hover:bg-[#1a255c] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
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
    const profileParam = address || `id/${userId}`;
    const { data: profileData, isLoading } = useQuery({
        queryKey: ["user-profile", profileParam],
        queryFn: () => apiRequest(`/user-profile/${profileParam}`),
        enabled: !!address || !!userId,
    });

    const stats: UserProfileStats | null = profileData?.stats || null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm px-4" onClick={onClose} />

            <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] border border-zinc-200 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-8 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        {/* Profile Image Box */}
                        <div className="w-20 h-20 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                            {stats?.profile_pic ? (
                                <img
                                    src={stats.profile_pic.startsWith('http') || stats.profile_pic.startsWith('data:') ? stats.profile_pic : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007'}${stats.profile_pic}`}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <UserIcon className="w-8 h-8 text-zinc-400" />
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                                    {name || "User Profile"}
                                </h2>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-zinc-500 font-mono text-sm">{address || 'No Wallet Linked'}</p>
                                    {address && <CopyAddressButton address={address} />}
                                </div>
                                <p className="text-[#212E73] text-xs font-semibold">{email}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    {isLoading ? (
                        <div className="py-24 text-center">
                            <div className="animate-spin h-10 w-10 border-b-2 border-[#212E73] mx-auto rounded-full" />
                            <p className="mt-4 text-zinc-400 font-bold uppercase tracking-widest text-xs">Assembling Data...</p>
                        </div>
                    ) : stats ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <StatCard
                                label="Trustive Balance"
                                value={formatDecimal(stats.balance, 5, 2)}
                                unit="Trustive"
                                icon={TrendingUp}
                                color="text-[#212E73]"
                            />

                            <StatCard
                                label="Total Staked Reward"
                                value={formatDecimal(stats.total_rewards, 5, 2)}
                                unit="Trustive"
                                icon={TrendingUp}
                                color="text-purple-600"
                            />
                            <StatCard
                                label="Total USDT"
                                value={formatDecimal(stats.total_usdt, 5, 2)}
                                unit="USD"
                                icon={DollarSign}
                                color="text-emerald-600"
                            />
                            <StatCard
                                label="Total Vested"
                                value={formatDecimal(stats.total_vested, 5, 2)}
                                unit="Trustive"
                                icon={ShieldCheck}
                                color="text-blue-600"
                            />
                        </div>
                    ) : (
                        <div className="py-24 text-center text-zinc-400 uppercase font-bold tracking-widest text-sm italic">
                            Failed to load user statistics
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-zinc-50/50 border-t border-zinc-200 flex items-center justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white border border-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-100 transition-all cursor-pointer shadow-sm"
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
        <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-2xl group hover:border-zinc-300 transition-all shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center transition-all shadow-sm", color)}>
                    <Icon size={20} />
                </div>
                <ChevronRight size={16} className="text-zinc-400" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.1em] mb-1">{label}</span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-zinc-900 tracking-tight">{value}</span>
                    <span className="text-[10px] font-bold text-[#212E73] uppercase tracking-widest">{unit}</span>
                </div>
            </div>
        </div>
    );
}
