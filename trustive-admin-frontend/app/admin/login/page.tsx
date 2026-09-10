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
        <div className="min-h-screen bg-background bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/50 via-background to-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent opacity-[0.03] blur-[150px] rounded-full"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent opacity-[0.03] blur-[150px] rounded-full"></div>

            <div className="w-full max-w-[420px] relative z-10 space-y-8">
                {/* Logo and Header */}
                <div className="text-center space-y-6">
                    <div className="relative inline-flex items-center justify-center w-20 h-20 bg-accent rounded-2xl rotate-12 shadow-[0_0_50px_rgba(229,178,88,0.2)]">
                        <ShieldCheck className="w-10 h-10 text-black -rotate-12" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-4xl font-paytone text-white tracking-tight uppercase">TRUSTIVE ADMIN</h1>
                        <p className="text-zinc-500 font-medium text-[10px] uppercase tracking-[6px]">Secure Access Terminal</p>
                    </div>
                </div>

                {/* Login Card */}
                <div className="bg-sidebar rounded-[32px] border border-white/5 p-8 shadow-2xl backdrop-blur-xl transition-all duration-500">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-center animate-shake">
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
                                            className="w-full px-5 py-4 bg-black/40 border border-white/5 rounded-xl focus:border-accent outline-none transition-all text-white text-sm placeholder:text-zinc-700 font-medium"
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
                                                className="w-full px-5 py-4 pr-12 bg-black/40 border border-white/5 rounded-xl focus:border-accent outline-none transition-all text-white text-sm placeholder:text-zinc-700 font-medium"
                                                placeholder="••••••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white transition-colors focus:outline-none"
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
                                <div className="space-y-2 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <label className="text-[10px] font-black text-accent uppercase tracking-[4px] px-1 block text-center mb-4">
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
                                            className="w-full px-5 py-6 bg-accent/5 border-2 border-accent/20 rounded-2xl focus:border-accent outline-none transition-all text-white text-3xl text-center tracking-[1rem] font-black placeholder:text-zinc-800"
                                            placeholder="000000"
                                        />
                                    </div>
                                    <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest mt-4 leading-relaxed font-bold">
                                        Enter the algorithm generated code <br /> from your authenticator device
                                    </p>
                                    <button 
                                        type="button"
                                        onClick={() => setRequire2FA(false)}
                                        className="w-full text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-6 hover:text-white transition-colors"
                                    >
                                        Back to Identity Login
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-accent hover:bg-accent/90 text-black py-4 rounded-xl font-paytone text-sm transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-accent/10 mt-4"
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
                <p className="text-center text-[9px] text-zinc-600 uppercase tracking-[4px] font-medium opacity-50">
                    Prop Defi Management • 2026 Internal Control
                </p>
            </div>
        </div>
    );
}
