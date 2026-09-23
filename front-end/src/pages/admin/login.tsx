import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import {
    Loader2,
    ShieldCheck,
    Crown,
    Lock,
    Eye,
    EyeOff,
    ChevronDown,
    ArrowRight,
    CheckCircle2,
    Shield,
} from "lucide-react";
import { shortenAddress, cn } from "@/lib/utils";

const ADMIN_ACCOUNTS = [
    {
        id: 1,
        name: "Admin 1 (Lead Operations)",
        email: "admin1@trustive.com",
        wallet: "0x3300f29508D7D04c75C55BeF8F56bC822E30A2D3",
        role: "admin"
    },
    {
        id: 2,
        name: "Admin 2 (Sales Operations)",
        email: "admin2@trustive.com",
        wallet: "0x88A4f903D778Eee639fE1987fBD89c2892594471",
        role: "admin"
    },
    {
        id: 3,
        name: "Admin 3 (Pricing & Tokens)",
        email: "admin3@trustive.com",
        wallet: "0x61c3810A04AdeabeE2ABdCa465Af5BB389C979Df",
        role: "admin"
    },
    {
        id: 4,
        name: "Admin 4 (Compliance & Users)",
        email: "admin4@trustive.com",
        wallet: "0x55451A3f10D392BEa6A19DD9Fb366c17d462A5d2",
        role: "admin"
    },
    {
        id: 5,
        name: "Admin 5 (Vesting & Audits)",
        email: "admin5@trustive.com",
        wallet: "0x724318431F8ce8a22e464c7057dECB474d603EeD",
        role: "admin"
    }
];

export default function AdminLogin() {
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
            if (token && (role === "admin" || role === "owner")) {
                router.replace("/admin/dashboard");
            }
        } catch { }
    }, [router]);

    const selectAdmin = (admin: typeof ADMIN_ACCOUNTS[0]) => {
        setCredentials({
            email: admin.email,
            password: "Admin@123",
        });
        setError("");
        setSuccessMsg(`Selected ${admin.name}. Password auto-filled.`);
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
                    role: "admin",
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
                        localStorage.setItem("admin_role", data.data?.role || "admin");
                        if (data.data?.name) {
                            localStorage.setItem("admin_name", data.data.name);
                        }
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                        setSuccessMsg("Authenticated as Admin! Redirecting...");
                        setTimeout(() => {
                            window.location.href = "/admin/dashboard";
                        }, 500);
                    } else {
                        setError("Token not received from server");
                    }
                }
            } else {
                setError(data.msg || "Invalid admin credentials");
                if (require2FA && data.msg?.includes("2FA")) {
                    setTwoFaCode("");
                }
            }
        } catch (err) {
            setError("Failed to connect to authentication server");
            console.error("Admin login error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Admin Portal Login | Trustive ICO</title>
            </Head>
            <div className="min-h-screen bg-[#F4F4F6] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
                <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-200/40 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-[460px] relative z-10 space-y-6">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="relative inline-flex items-center justify-center w-16 h-16 bg-blue-500/10 border-2 border-blue-500/30 rounded-2xl shadow-xl shadow-[#36A886]/15">
                            <ShieldCheck className="w-8 h-8 text-[#36A886]" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-manrope font-extrabold text-[#001060] tracking-tight uppercase">
                                TRUSTIVE
                            </h1>
                            <p className="text-[#36A886] font-bold text-[11px] uppercase tracking-[3px] flex items-center justify-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-[#36A886]" />
                                🛡️ Admin Operations Portal (3/5 Quorum)
                            </p>
                        </div>
                    </div>

                    {/* Login Card */}
                    <div className="bg-white rounded-[32px] border-2 border-blue-200/80 p-8 shadow-[0_8px_30px_rgba(49,94,251,0.08)] space-y-6">
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
                                    Admin Email
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={credentials.email}
                                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                                    placeholder="admin1@trustive.com"
                                    className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#36A886] text-zinc-900 font-medium text-sm transition-all bg-zinc-50/50 hover:bg-white focus:bg-white"
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
                                        className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#36A886] text-zinc-900 font-medium text-sm transition-all bg-zinc-50/50 hover:bg-white focus:bg-white pr-10"
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
                                    <label className="text-[11px] font-bold text-[#36A886] uppercase tracking-wider block flex items-center justify-between">
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
                                        className="w-full px-4 py-3.5 rounded-xl border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#36A886] text-zinc-900 font-mono text-center tracking-[8px] text-lg font-bold bg-blue-50/30"
                                    />
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md bg-[#36A886] hover:bg-[#2548D0] text-white active:scale-[0.98] disabled:opacity-50 mt-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-4 h-4 text-blue-200" />
                                        Log In to Admin Panel
                                    </>
                                )}
                            </button>
                        </form>

                        {/* 5 Authorized Admin Accounts Accordion */}
                        <div className="pt-2 border-t border-zinc-100 space-y-2">
                            <button
                                type="button"
                                onClick={() => setShowAccountsHelper(!showAccountsHelper)}
                                className="w-full flex items-center justify-between py-2 text-xs font-bold text-blue-800 uppercase tracking-wider hover:text-blue-900 transition-colors cursor-pointer"
                            >
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-[#36A886]" />
                                    5 Authorized Admins (3/5 Quorum)
                                </span>
                                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", showAccountsHelper && "rotate-180")} />
                            </button>

                            {showAccountsHelper && (
                                <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        Click any admin account below to auto-fill credentials:
                                    </p>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {ADMIN_ACCOUNTS.map((a) => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => selectAdmin(a)}
                                                className="w-full text-left p-2.5 rounded-xl border border-blue-200/80 bg-blue-50/40 hover:bg-blue-100/60 transition-all flex items-center justify-between group cursor-pointer"
                                            >
                                                <div className="space-y-0.5 min-w-0 pr-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-bold text-[#001060]">{a.name}</span>
                                                    </div>
                                                    <div className="text-[11px] text-zinc-600 font-mono truncate">{a.email}</div>
                                                    <div className="text-[10px] text-zinc-400 font-mono truncate">Wallet: {shortenAddress(a.wallet)}</div>
                                                </div>
                                                <span className="text-[10px] font-bold text-[#36A886] uppercase tracking-wider bg-white px-2 py-1 rounded-lg border border-blue-200 shrink-0 group-hover:bg-[#36A886] group-hover:text-white transition-colors">
                                                    Select
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-zinc-400 text-center font-mono pt-1">
                                        Default password for admin accounts: <span className="text-zinc-600 font-bold">Admin@123</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Switch to Owner link */}
                    <div className="text-center space-y-2">
                        <Link
                            href="/owner/login"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 uppercase tracking-wider transition-colors hover:underline"
                        >
                            <Crown className="w-3.5 h-3.5 text-amber-500" />
                            <span>Switch to Owner Control Center (/owner/login)</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
