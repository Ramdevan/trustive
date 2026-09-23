"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Loader2,
    Crown,
    ShieldCheck,
    Lock,
    Eye,
    EyeOff,
    Wallet,
    ChevronDown,
    Copy,
    Check,
    ArrowRight,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
    CONTRACT_OWNERS,
    getAddressRole,
    isOwnerAddress,
} from "@/lib/roles";
import { shortenAddress, cn } from "@/lib/utils";

export default function OwnerLogin() {
    const router = useRouter();
    const [credentials, setCredentials] = useState({
        email: "",
        password: "",
    });

    const { address, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [walletLoggingIn, setWalletLoggingIn] = useState(false);
    const [require2FA, setRequire2FA] = useState(false);
    const [twoFaCode, setTwoFaCode] = useState("");
    const [showAddresses, setShowAddresses] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

    // Auto-redirect if already authenticated as owner
    useEffect(() => {
        try {
            const token = localStorage.getItem("admin_token");
            const role = localStorage.getItem("admin_role");
            if (token && role === "owner") {
                router.replace("/owner/dashboard");
            }
        } catch { }
    }, [router]);

    const copyAddress = (addr: string) => {
        navigator.clipboard.writeText(addr);
        setCopiedAddr(addr);
        setTimeout(() => setCopiedAddr(null), 2000);
    };

    // Web3 Direct Wallet Login
    const handleWalletLogin = async () => {
        if (!isConnected || !address) {
            if (openConnectModal) openConnectModal();
            return;
        }

        if (!isOwnerAddress(address)) {
            setError("The connected wallet is not one of the 3 authorized Contract Owners.");
            return;
        }

        setError("");
        setSuccessMsg("");
        setWalletLoggingIn(true);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/admin";
            const res = await fetch(`${apiUrl}/wallet-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address }),
            });

            const data = await res.json();

            if (data.status) {
                const token = data.data?.token || data.token;
                if (token) {
                    localStorage.setItem("admin_token", token);
                    localStorage.setItem("admin_role", "owner");
                    localStorage.setItem("admin_last_activity", Date.now().toString());
                    setSuccessMsg("Authenticated as CONTRACT OWNER! Redirecting...");
                    setTimeout(() => {
                        window.location.href = "/owner/dashboard";
                    }, 500);
                } else {
                    setError("Token not received from server");
                }
            } else {
                setError(data.msg || "Wallet authorization failed");
            }
        } catch (err) {
            setError("Failed to connect to authentication server");
            console.error("Owner wallet login error:", err);
        } finally {
            setWalletLoggingIn(false);
        }
    };

    // Standard Credentials Login
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setLoading(true);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/admin";
            const res = await fetch(`${apiUrl}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...credentials,
                    role: "owner",
                    twoFaCode: require2FA ? twoFaCode : undefined,
                }),
            });
            const data = await res.json();

            if (data.status) {
                if (data.require2FA) {
                    setRequire2FA(true);
                    setLoading(false);
                } else {
                    const token = data.data?.token || data.token;
                    if (token) {
                        localStorage.setItem("admin_token", token);
                        localStorage.setItem("admin_role", "owner");
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                        window.location.href = "/owner/dashboard";
                    } else {
                        setError("Token not received from server");
                    }
                }
            } else {
                setError(data.msg || "Invalid owner credentials");
                if (require2FA && data.msg?.includes("2FA")) {
                    setTwoFaCode("");
                }
            }
        } catch (err) {
            setError("Failed to connect to server");
            console.error("Owner login error:", err);
        } finally {
            setLoading(false);
        }
    };

    const isConnectedOwner = isOwnerAddress(address);

    return (
        <div className="min-h-screen bg-[#F4F4F6] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-[460px] relative z-10 space-y-6">
                {/* Header */}
                <div className="text-center space-y-4">
                    <div className="relative inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl rotate-6 shadow-xl shadow-amber-600/15">
                        <Crown className="w-8 h-8 text-amber-600 -rotate-6" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-3xl font-manrope font-extrabold text-[#001060] tracking-tight uppercase">
                            TRUSTIVE
                        </h1>
                        <p className="text-amber-700 font-bold text-[11px] uppercase tracking-[4px] flex items-center justify-center gap-1.5">
                            <Crown className="w-3.5 h-3.5 text-amber-500" />
                            👑 Owner Multi-Sig Control (2/3 Quorum)
                        </p>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-[32px] border-2 border-amber-300/80 p-8 shadow-[0_8px_30px_rgba(217,119,6,0.08)] space-y-6">
                    {/* Status Alerts */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center">
                            {error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center">
                            {successMsg}
                        </div>
                    )}

                    {/* Section 1: Web3 Owner Wallet Quick-Login */}
                    <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Wallet className="w-3.5 h-3.5 text-amber-600" />
                                Owner Web3 Instant Login
                            </span>
                            {isConnected && (
                                <span
                                    className={cn(
                                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border",
                                        isConnectedOwner
                                            ? "bg-amber-100 text-amber-800 border-amber-300"
                                            : "bg-red-100 text-red-700 border-red-200"
                                    )}
                                >
                                    {isConnectedOwner ? "OWNER WALLET" : "NON-OWNER"}
                                </span>
                            )}
                        </div>

                        {isConnected && address ? (
                            <div className="flex items-center justify-between text-xs font-mono bg-white px-3 py-2 rounded-xl border border-amber-200">
                                <span className="text-zinc-700 truncate font-semibold">{shortenAddress(address)}</span>
                                <span className="text-[10px] text-zinc-400 font-sans">Connected</span>
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-600 leading-snug">
                                Connect any of the contract&apos;s 3 authorized Owner wallets for 1-click on-chain verification.
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={handleWalletLogin}
                            disabled={walletLoggingIn}
                            className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20 active:scale-95 disabled:opacity-50"
                        >
                            {walletLoggingIn ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Verifying Owner Signature...
                                </>
                            ) : isConnected ? (
                                <>
                                    <Crown className="w-4 h-4" />
                                    Sign in as Contract Owner
                                </>
                            ) : (
                                <>
                                    <Wallet className="w-4 h-4" />
                                    Connect Owner Wallet
                                </>
                            )}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center">
                        <div className="border-t border-zinc-200 w-full" />
                        <span className="bg-white px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest absolute">
                            Or Use Owner Credentials
                        </span>
                    </div>

                    {/* Section 2: Owner Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!require2FA ? (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                                        Owner Email
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={credentials.email}
                                        onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none transition-all text-zinc-900 text-sm placeholder:text-zinc-400 font-medium"
                                        placeholder="owner@trustive.com"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            required
                                            value={credentials.password}
                                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                            className="w-full px-4 py-3.5 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none transition-all text-zinc-900 text-sm placeholder:text-zinc-400 font-medium"
                                            placeholder="••••••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 transition-colors focus:outline-none"
                                            title={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2 py-2 animate-in fade-in duration-300">
                                <label className="text-[10px] font-bold text-amber-700 uppercase tracking-[4px] px-1 block text-center mb-3">
                                    2-Factor Verification Code
                                </label>
                                <input
                                    type="text"
                                    required
                                    maxLength={6}
                                    autoFocus
                                    value={twoFaCode}
                                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                                    className="w-full px-4 py-4 bg-zinc-50 border-2 border-amber-500/40 rounded-2xl focus:border-amber-600 outline-none transition-all text-zinc-900 text-2xl text-center tracking-[0.8rem] font-bold placeholder:text-zinc-300"
                                    placeholder="000000"
                                />
                                <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest mt-2 leading-relaxed font-semibold">
                                    Enter the 6-digit code from your authenticator app
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#001060] hover:bg-[#001880] text-white py-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 shadow-md cursor-pointer"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="animate-spin h-4 w-4" />
                                    Authenticating Owner...
                                </span>
                            ) : require2FA ? (
                                "Verify & Continue"
                            ) : (
                                "Log In to Owner Panel"
                            )}
                        </button>
                    </form>

                    {/* Section 3: 3 Contract Owners List */}
                    <div className="pt-2 border-t border-zinc-100">
                        <button
                            type="button"
                            onClick={() => setShowAddresses(!showAddresses)}
                            className="w-full flex items-center justify-between text-[11px] font-bold text-amber-700 hover:text-amber-800 transition-colors py-1 cursor-pointer uppercase tracking-wider"
                        >
                            <span>👑 3 Authorized Owners (2/3 Quorum)</span>
                            <ChevronDown className={cn("w-4 h-4 transition-transform", showAddresses && "rotate-180")} />
                        </button>

                        {showAddresses && (
                            <div className="mt-3 bg-zinc-50 rounded-2xl p-4 border border-zinc-200 text-xs space-y-2 animate-in fade-in duration-150">
                                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-semibold mb-1">
                                    <span>ICO CONTRACT: 0xeFE1...4DbC</span>
                                    <span className="text-amber-700">BSC Testnet</span>
                                </div>
                                {CONTRACT_OWNERS.map((addr, idx) => (
                                    <div
                                        key={addr}
                                        className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-zinc-200/80 font-mono text-[11px]"
                                    >
                                        <div className="truncate flex-1 pr-2 text-zinc-700">
                                            <span className="font-bold text-amber-600 font-sans mr-2">#{idx + 1}</span>
                                            {addr}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => copyAddress(addr)}
                                            className="p-1 text-zinc-400 hover:text-amber-600 transition-colors shrink-0"
                                            title="Copy address"
                                        >
                                            {copiedAddr === addr ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Switch to Admin Link */}
                <div className="text-center pt-2">
                    <Link
                        href="/admin/login"
                        className="inline-flex items-center gap-2 text-xs font-bold text-[#36A886] hover:text-[#2548D0] uppercase tracking-wider transition-colors"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        Switch to Admin Operations Portal (/admin)
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
