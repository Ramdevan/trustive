import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import {
    Loader2,
    Crown,
    Lock,
    Eye,
    EyeOff,
    ChevronDown,
    ArrowRight,
    UserCheck,
    CheckCircle2,
    Shield,
} from "lucide-react";
import { shortenAddress, cn } from "@/lib/utils";

const OWNER_ACCOUNTS = [
    {
        id: 1,
        name: "Owner 1 (Primary Treasury)",
        email: "owner1@trustive.com",
        wallet: "0x861b38d9E97ebE86883A55eB4b2b70cca795785E",
        role: "owner"
    },
    {
        id: 2,
        name: "Owner 2 (Governance)",
        email: "owner2@trustive.com",
        wallet: "0xb01507c1661C22404D2371Ae9043Dc715663EB22",
        role: "owner"
    },
    {
        id: 3,
        name: "Owner 3 (Security)",
        email: "owner3@trustive.com",
        wallet: "0x0bAaaD913DE9567dEb71368296d56a84a22C949d",
        role: "owner"
    }
];

export default function OwnerLogin() {
    const router = useRouter();
    const [credentials, setCredentials] = useState({
        email: "",
        password: "",
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [require2FA, setRequire2FA] = useState(false);
    const [twoFaCode, setTwoFaCode] = useState("");
    const [showAccountsHelper, setShowAccountsHelper] = useState(false);

    const getApiUrl = () =>
        process.env.NEXT_PUBLIC_ADMIN_API_URL ||
        (process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin` : "http://localhost:3007/api/admin");

    useEffect(() => {
        try {
            const token = localStorage.getItem("admin_token");
            const role = localStorage.getItem("admin_role");
            if (token && role === "owner") {
                router.replace("/owner/dashboard");
            }
        } catch { }
    }, [router]);

    const selectOwner = (owner: typeof OWNER_ACCOUNTS[0]) => {
        setCredentials({
            email: owner.email,
            password: "Owner@123",
        });
        setError("");
        setSuccessMsg(`Selected ${owner.name}. Password auto-filled.`);
        setTimeout(() => setSuccessMsg(""), 3000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setLoading(true);

        try {
            const res = await fetch(`${getApiUrl()}/login`, {
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
                        if (data.data?.name) {
                            localStorage.setItem("admin_name", data.data.name);
                        }
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                        setSuccessMsg("Authenticated as Owner! Redirecting...");
                        setTimeout(() => {
                            window.location.href = "/owner/dashboard";
                        }, 500);
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
            setError("Failed to connect to authentication server");
            console.error("Owner login error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Owner Portal Login | Trustive ICO</title>
            </Head>
            <div className="min-h-screen bg-[#F4F4F6] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
                <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-amber-100/40 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-[460px] relative z-10 space-y-6">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="relative inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl shadow-xl shadow-amber-600/15">
                            <Crown className="w-8 h-8 text-amber-600" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-manrope font-extrabold text-[#001060] tracking-tight uppercase">
                                TRUSTIVE
                            </h1>
                            <p className="text-amber-700 font-bold text-[11px] uppercase tracking-[3px] flex items-center justify-center gap-1.5">
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                                👑 Owner Control Center (2/3 Quorum)
                            </p>
                        </div>
                    </div>

                    {/* Login Card */}
                    <div className="bg-white rounded-[32px] border-2 border-amber-300/80 p-8 shadow-[0_8px_30px_rgba(217,119,6,0.08)] space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center animate-in fade-in">
                                {error}
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center animate-in fade-in">
                                {successMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                                    Owner Email
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={credentials.email}
                                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                                    placeholder="owner1@trustive.com"
                                    className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-zinc-900 font-medium text-sm transition-all bg-zinc-50/50 hover:bg-white focus:bg-white"
                                />
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={credentials.password}
                                        onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                        placeholder="••••••••••••"
                                        className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-zinc-900 font-medium text-sm transition-all bg-zinc-50/50 hover:bg-white focus:bg-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* 2FA Input (Conditional) */}
                            {require2FA && (
                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block flex items-center justify-between">
                                        <span>Two-Factor Authentication Code</span>
                                        <span className="text-[10px] text-zinc-400 font-normal">6 digits</span>
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        required
                                        value={twoFaCode}
                                        onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                                        placeholder="123456"
                                        className="w-full px-4 py-3.5 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-zinc-900 font-mono text-center tracking-[8px] text-lg font-bold bg-amber-50/30"
                                    />
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md bg-[#001060] hover:bg-[#000b45] text-white active:scale-[0.98] disabled:opacity-50 mt-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-4 h-4 text-amber-400" />
                                        Log In to Owner Panel
                                    </>
                                )}
                            </button>
                        </form>

                        {/* 3 Authorized Owner Accounts Accordion */}
                        <div className="pt-2 border-t border-zinc-100 space-y-2">
                            <button
                                type="button"
                                onClick={() => setShowAccountsHelper(!showAccountsHelper)}
                                className="w-full flex items-center justify-between py-2 text-xs font-bold text-amber-800 uppercase tracking-wider hover:text-amber-900 transition-colors cursor-pointer"
                            >
                                <span className="flex items-center gap-1.5">
                                    <Crown className="w-3.5 h-3.5 text-amber-600" />
                                    3 Authorized Owners (2/3 Quorum)
                                </span>
                                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", showAccountsHelper && "rotate-180")} />
                            </button>

                            {showAccountsHelper && (
                                <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        Click any owner account below to auto-fill credentials:
                                    </p>
                                    <div className="space-y-2">
                                        {OWNER_ACCOUNTS.map((o) => (
                                            <button
                                                key={o.id}
                                                type="button"
                                                onClick={() => selectOwner(o)}
                                                className="w-full text-left p-3 rounded-xl border border-amber-200/80 bg-amber-50/40 hover:bg-amber-100/60 transition-all flex items-center justify-between group cursor-pointer"
                                            >
                                                <div className="space-y-0.5 min-w-0 pr-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-bold text-[#001060]">{o.name}</span>
                                                    </div>
                                                    <div className="text-[11px] text-zinc-600 font-mono truncate">{o.email}</div>
                                                    <div className="text-[10px] text-zinc-400 font-mono truncate">Wallet: {shortenAddress(o.wallet)}</div>
                                                </div>
                                                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-white px-2.5 py-1 rounded-lg border border-amber-200 shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                                    Select
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-zinc-400 text-center font-mono pt-1">
                                        Default password for owner accounts: <span className="text-zinc-600 font-bold">Owner@123</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Switch to Admin link */}
                    <div className="text-center space-y-2">
                        <Link
                            href="/admin/login"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#315EFB] hover:text-[#2548D0] uppercase tracking-wider transition-colors hover:underline"
                        >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Switch to Admin Operations Portal (/admin/login)</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
