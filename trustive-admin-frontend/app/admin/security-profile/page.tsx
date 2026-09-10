"use client";

import { useState, useEffect } from "react";
import { 
    Shield, 
    Lock, 
    Smartphone, 
    AlertCircle,
    Loader2,
    ArrowRight,
    Eye,
    EyeOff
} from "lucide-react";
import { toast } from "react-hot-toast";
import { confirmAction } from "@/lib/confirm";

export default function AdminProfile() {
    const [passwords, setPasswords] = useState({
        current: "",
        new: "",
        confirm: ""
    });
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // 2FA State
    const [twoFaStatus, setTwoFaStatus] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
    const [verificationCode, setVerificationCode] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState("");
    const [disableCode, setDisableCode] = useState("");
    const [showDisablePassword, setShowDisablePassword] = useState(false);

    useEffect(() => {
        fetch2FAStatus();
    }, []);

    const fetch2FAStatus = async () => {
        try {
            const res = await fetch("/api/admin/2fa-status", {
                headers: { "Authorization": `Bearer ${localStorage.getItem("admin_token")}` }
            });
            const data = await res.json();
            if (data.status) setTwoFaStatus(data.enabled);
        } catch (err) {
            console.error(err);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error("New passwords do not match");
        }
        
        setLoading(true);
        try {
            const res = await fetch("/api/admin/change-password", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
                },
                body: JSON.stringify({
                    currentPassword: passwords.current,
                    newPassword: passwords.new
                })
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Password updated successfully");
                setPasswords({ current: "", new: "", confirm: "" });
            } else {
                toast.error(data.msg || "Failed to update password");
            }
        } catch (err) {
            toast.error("Network error");
        } finally {
            setLoading(false);
        }
    };

    const initiate2FASetup = async () => {
        setVerifying(true);
        try {
            const res = await fetch("/api/admin/generate-2fa", {
                method: "POST",
                headers: { "Authorization": `Bearer ${localStorage.getItem("admin_token")}` }
            });
            const data = await res.json();
            if (data.status) {
                setSetupData({ secret: data.secret, qrCode: data.qrCode });
                setShowSetup(true);
            }
        } catch (err) {
            toast.error("Failed to generate 2FA");
        } finally {
            setVerifying(false);
        }
    };

    const verifyAndEnable2FA = async () => {
        if (verificationCode.length !== 6) return;
        setVerifying(true);
        try {
            const res = await fetch("/api/admin/verify-2fa", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
                },
                body: JSON.stringify({ code: verificationCode })
            });
            const data = await res.json();
            if (data.status) {
                toast.success("2FA Enabled Successfully");
                setTwoFaStatus(true);
                setShowSetup(false);
                setSetupData(null);
                setVerificationCode("");
            } else {
                toast.error(data.msg || "Invalid code");
            }
        } catch (err) {
            toast.error("Verification failed");
        } finally {
            setVerifying(false);
        }
    };

    const closeDisable = () => {
        setShowDisable(false);
        setDisablePassword("");
        setDisableCode("");
        setShowDisablePassword(false);
    };

    // A yes/no confirm proved nothing about who was at the keyboard, so the
    // server now wants the admin password and a live authenticator code.
    const disable2FA = async () => {
        if (!disablePassword || disableCode.length !== 6) return;
        setVerifying(true);
        try {
            const res = await fetch("/api/admin/disable-2fa", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
                },
                body: JSON.stringify({ password: disablePassword, code: disableCode })
            });
            const data = await res.json();
            if (data.status) {
                toast.success("2FA Disabled");
                setTwoFaStatus(false);
                closeDisable();
            } else {
                toast.error(data.msg || "Failed to disable 2FA");
                setDisableCode("");
            }
        } catch (err) {
            toast.error("Failed to disable 2FA");
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-paytone text-zinc-900 uppercase tracking-tight">Security & Profile</h1>
                <p className="text-zinc-500 text-sm font-medium">Manage your administrative credentials and multi-factor authentication</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Password Management */}
                <div className="bg-white rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#212E73]/10 rounded-2xl flex items-center justify-center border border-[#212E73]/20">
                            <Lock className="w-6 h-6 text-[#212E73]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-wider">Change Password</h3>
                            <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Update your access token</p>
                        </div>
                    </div>

                    <form onSubmit={handlePasswordChange} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[3px] ml-1">Current Password</label>
                                <div className="relative">
                                    <input
                                        type={showCurrent ? "text" : "password"}
                                        required
                                        value={passwords.current}
                                        onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 pr-12 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none transition-all placeholder:text-zinc-400"
                                        placeholder="••••••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer p-1"
                                        title={showCurrent ? "Hide password" : "Show password"}
                                    >
                                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[3px] ml-1">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showNew ? "text" : "password"}
                                        required
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 pr-12 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none transition-all placeholder:text-zinc-400"
                                        placeholder="Enter new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew(!showNew)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer p-1"
                                        title={showNew ? "Hide password" : "Show password"}
                                    >
                                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[3px] ml-1">Confirm New Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirm ? "text" : "password"}
                                        required
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 pr-12 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none transition-all placeholder:text-zinc-400"
                                        placeholder="Confirm new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer p-1"
                                        title={showConfirm ? "Hide password" : "Show password"}
                                    >
                                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#212E73] hover:bg-[#1a255c] text-white py-4 rounded-2xl font-paytone text-sm uppercase transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-md"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Update Credentials"}
                        </button>
                    </form>
                </div>

                {/* 2FA Management */}
                <div className="bg-white rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 space-y-8 flex flex-col">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-200">
                                <Shield className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-wider">Multi-Factor Auth</h3>
                                <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Enhanced Identity Verification</p>
                            </div>
                        </div>
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            twoFaStatus 
                                ? "bg-green-50 border-green-200 text-green-700" 
                                : "bg-red-50 border-red-200 text-red-700"
                        }`}>
                            {twoFaStatus ? "Secured" : "Unsecured"}
                        </div>
                    </div>

                    {!showSetup ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 py-4">
                            <div className={`p-6 rounded-full border-2 transition-all duration-500 ${twoFaStatus ? 'border-green-200 bg-green-50' : 'border-zinc-200 bg-zinc-50'}`}>
                                <Smartphone className={`w-16 h-16 ${twoFaStatus ? 'text-green-600' : 'text-zinc-400'}`} />
                            </div>
                            <div className="max-w-[18rem] space-y-4">
                                <h4 className="text-zinc-900 font-bold text-sm uppercase tracking-wider">
                                    {twoFaStatus ? "Verification Active" : "Level Up Security"}
                                </h4>
                                <p className="text-zinc-500 text-xs leading-relaxed uppercase tracking-widest font-medium">
                                    {twoFaStatus 
                                        ? "Your account is protected by an algorithm-based 6-digit dynamic token." 
                                        : "Protect your administrative panel by requiring a digital token from Google Authenticator."
                                    }
                                </p>
                            </div>
                            <button
                                onClick={twoFaStatus ? () => setShowDisable(true) : initiate2FASetup}
                                disabled={verifying}
                                className={`w-full py-4 rounded-2xl font-paytone text-sm uppercase transition-all active:scale-[0.98] cursor-pointer ${
                                    twoFaStatus 
                                        ? "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200" 
                                        : "bg-[#212E73] text-white hover:bg-[#1a255c] shadow-md"
                                }`}
                            >
                                {verifying ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (twoFaStatus ? "Disable 2FA" : "Enable Multi-Factor")}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8 py-2 animate-in zoom-in-95 duration-500">
                            <div className="flex flex-col items-center justify-center space-y-6">
                                <div className="p-3 bg-white rounded-3xl border border-zinc-200 shadow-lg">
                                    <img src={setupData?.qrCode} alt="Setup QR" className="w-40 h-40" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-[10px] font-black text-[#212E73] uppercase tracking-[4px]">Backup Secret</p>
                                    <code className="bg-zinc-100 px-4 py-2 rounded-xl text-zinc-900 font-mono text-xs border border-zinc-200 inline-block select-all">
                                        {setupData?.secret}
                                    </code>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-zinc-100">
                                <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest font-bold">
                                    Enter the 6-digit code <br /> from your app to verify setup
                                </p>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-zinc-900 text-center text-xl font-black tracking-widest focus:border-[#212E73] outline-none transition-all"
                                        placeholder="000 000"
                                    />
                                    <button
                                        onClick={verifyAndEnable2FA}
                                        disabled={verificationCode.length !== 6 || verifying}
                                        className="bg-[#212E73] text-white p-4 rounded-2xl hover:bg-[#1a255c] transition-all disabled:opacity-50 active:scale-95 cursor-pointer shadow-md"
                                    >
                                        {verifying ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6" />}
                                    </button>
                                </div>
                                <button 
                                    onClick={() => setShowSetup(false)}
                                    className="w-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-900 transition-colors py-2 cursor-pointer"
                                >
                                    Cancel Setup
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Security Notice */}
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <div className="space-y-1">
                    <p className="text-amber-700 text-[10px] font-black uppercase tracking-[3px]">Identity Policy Notice</p>
                    <p className="text-zinc-600 text-[11px] leading-relaxed">
                        Changes to your security credentials will invalidate your current session and require re-authentication. 
                        Always keep your 2FA backup secret in a safe offline location. Loss of your authenticator device without a backup 
                        may lead to permanent administrative lockout.
                    </p>
                </div>
            </div>

            {showDisable && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget && !verifying) closeDisable(); }}
                >
                    <div className="w-full max-w-md rounded-[32px] bg-white border border-zinc-200/90 shadow-2xl p-8 space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-zinc-900 font-bold text-lg uppercase tracking-wider leading-tight">Disable 2FA?</h3>
                                <p className="text-zinc-500 text-xs leading-relaxed">
                                    The admin panel will be protected by the password alone. Confirm it is you with
                                    your password and a current code from your authenticator app.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Admin Password</label>
                                <div className="relative">
                                    <input
                                        type={showDisablePassword ? "text" : "password"}
                                        value={disablePassword}
                                        onChange={e => setDisablePassword(e.target.value)}
                                        autoComplete="current-password"
                                        placeholder="Enter your password"
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-4 pr-11 py-3 text-zinc-900 text-sm focus:border-[#212E73] outline-none placeholder:text-zinc-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowDisablePassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                                        aria-label={showDisablePassword ? "Hide password" : "Show password"}
                                    >
                                        {showDisablePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Authenticator Code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={disableCode}
                                    onChange={e => setDisableCode(e.target.value.replace(/\D/g, ""))}
                                    onKeyDown={e => { if (e.key === "Enter") disable2FA(); }}
                                    placeholder="000000"
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 text-center font-bold tracking-[0.4em] focus:border-[#212E73] outline-none placeholder:text-zinc-400"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={closeDisable}
                                disabled={verifying}
                                className="flex-1 py-4 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200 font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-40 cursor-pointer"
                            >
                                Keep 2FA On
                            </button>
                            <button
                                onClick={disable2FA}
                                disabled={verifying || !disablePassword || disableCode.length !== 6}
                                className="flex-1 py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
                            >
                                {verifying ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Disable 2FA"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
