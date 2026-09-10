"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ShieldCheck, Lock, Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
    const router = useRouter();
    const [credentials, setCredentials] = useState({
        email: "",
        password: "",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [require2FA, setRequire2FA] = useState(false);
    const [twoFaCode, setTwoFaCode] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/admin";
            const res = await fetch(`${apiUrl}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    ...credentials,
                    twoFaCode: require2FA ? twoFaCode : undefined
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
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                        window.location.href = "/admin/dashboard";
                    } else {
                        setError("Token not received from server");
                    }
                }
            } else {
                setError(data.msg || "Invalid credentials");
                if (require2FA && data.msg?.includes("2FA")) {
                    setTwoFaCode("");
                }
            }
        } catch (err) {
            setError("Failed to connect to server");
            console.error("Login error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="w-full max-w-[420px] relative z-10 space-y-8">
                {/* Logo and Header */}
                <div className="text-center space-y-6">
                    <div className="relative inline-flex items-center justify-center w-20 h-20 bg-[#212E73] rounded-2xl rotate-12 shadow-lg shadow-[#212E73]/20">
                        <ShieldCheck className="w-10 h-10 text-white -rotate-12" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-4xl font-paytone text-zinc-900 tracking-tight uppercase">TRUSTIVE ADMIN</h1>
                        <p className="text-zinc-500 font-medium text-[10px] uppercase tracking-[6px]">Secure Access Terminal</p>
                    </div>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-[32px] border border-zinc-200/90 p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all duration-500">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center animate-shake">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {!require2FA ? (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                                            Admin Identifier
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={credentials.email}
                                            onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                                            className="w-full px-5 py-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] outline-none transition-all text-zinc-900 text-sm placeholder:text-zinc-400 font-medium"
                                            placeholder="admin@trustive.com"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                                            Security Token
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                required
                                                value={credentials.password}
                                                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                                className="w-full px-5 py-4 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-[#212E73] focus:ring-1 focus:ring-[#212E73] outline-none transition-all text-zinc-900 text-sm placeholder:text-zinc-400 font-medium"
                                                placeholder="••••••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 transition-colors focus:outline-none"
                                                title={showPassword ? "Hide password" : "Show password"}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="w-4 h-4" />
                                                ) : (
                                                    <Eye className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-2 py-4 animate-in fade-in duration-300">
                                    <label className="text-[10px] font-bold text-[#212E73] uppercase tracking-[4px] px-1 block text-center mb-4">
                                        Verification Required
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            required
                                            maxLength={6}
                                            autoFocus
                                            value={twoFaCode}
                                            onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                                            className="w-full px-5 py-6 bg-zinc-50 border-2 border-[#212E73]/30 rounded-2xl focus:border-[#212E73] outline-none transition-all text-zinc-900 text-3xl text-center tracking-[1rem] font-bold placeholder:text-zinc-300"
                                            placeholder="000000"
                                        />
                                    </div>
                                    <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest mt-4 leading-relaxed font-bold">
                                        Enter the algorithm generated code <br /> from your authenticator device
                                    </p>
                                    <button 
                                        type="button"
                                        onClick={() => setRequire2FA(false)}
                                        className="w-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-6 hover:text-zinc-800 transition-colors"
                                    >
                                        Back to Identity Login
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#212E73] hover:bg-[#1a255c] text-white py-4 rounded-xl font-paytone text-sm transition-all active:scale-[0.98] disabled:opacity-50 shadow-md shadow-[#212E73]/20 mt-4 cursor-pointer"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="animate-spin h-4 w-4" />
                                    VERIFYING...
                                </span>
                            ) : (
                                require2FA ? "VERIFY & PROCEED" : "INITIATE SESSION"
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer Notes */}
                <p className="text-center text-[9px] text-zinc-500 uppercase tracking-[4px] font-medium">
                    Prop Defi Management • 2026 Internal Control
                </p>
            </div>
        </div>
    );
}
