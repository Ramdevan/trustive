"use client";

import { useEffect, useState } from "react";
import {
    Settings,
    Shield,
    Wallet,
    Globe,
    Save,
    Loader2,
    Lock,
    Mail,
    Smartphone,
    Info,
    AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { toast } from "react-toastify";

export default function AdminSettings() {
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [localSettings, setLocalSettings] = useState<any>(null);

    const { data: settingsData, isLoading: loading } = useQuery({
        queryKey: ["settings"],
        queryFn: () => apiRequest("/settings"),
    });

    const settings = localSettings || settingsData?.data || null;

    useEffect(() => {
        if (settingsData?.data && !localSettings) {
            setLocalSettings(settingsData.data);
        }
    }, [settingsData, localSettings]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = await apiRequest("/updateSettings", {
                method: 'POST',
                body: JSON.stringify(settings)
            });
            if (data.status) {
                toast.success("Security configuration updated");
                queryClient.invalidateQueries({ queryKey: ["settings"] });
            }
        } catch (err) {
            toast.error("Failed to update settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-700">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">System Configuration</h1>
                <p className="text-zinc-500 text-sm mt-1">Manage global protocol variables and administrative credentials.</p>
            </div>

            <form onSubmit={handleUpdate} className="space-y-8">
                {/* Network Infrastructure Section */}
                <div className="bg-sidebar rounded-[32px] border border-white/5 overflow-hidden shadow-xl">
                    <div className="p-8 border-b border-white/5 bg-black/10 flex items-center gap-3">
                        <div className="p-2 bg-accent/20 rounded-lg text-accent">
                            <Globe className="w-5 h-5" />
                        </div>
                        <h3 className="text-white font-bold">Network Infrastructure</h3>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Network Chain</label>
                            <input
                                value={settings?.chain || ""}
                                onChange={(e) => setLocalSettings({ ...settings, chain: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-medium"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Trustive Token Address</label>
                            <input
                                value={settings?.contract_address || ""}
                                onChange={(e) => setLocalSettings({ ...settings, contract_address: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">ICO Engine Contract</label>
                            <input
                                value={settings?.ico_contract || ""}
                                onChange={(e) => setLocalSettings({ ...settings, ico_contract: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Staking Protocol Contract</label>
                            <input
                                value={settings?.staking_contract || ""}
                                onChange={(e) => setLocalSettings({ ...settings, staking_contract: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Administrative Access Section */}
                <div className="bg-sidebar rounded-[32px] border border-white/5 overflow-hidden shadow-xl">
                    <div className="p-8 border-b border-white/5 bg-black/10 flex items-center gap-3">
                        <div className="p-2 bg-red-400/20 rounded-lg text-red-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h3 className="text-white font-bold">Administrative Access</h3>
                    </div>
                    <div className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <Mail className="w-3 h-3" /> Root Email
                                </label>
                                <input
                                    type="email"
                                    value={settings?.admin_email || ""}
                                    onChange={(e) => setLocalSettings({ ...settings, admin_email: e.target.value })}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <Lock className="w-3 h-3" /> Security Token
                                </label>
                                <input
                                    type="password"
                                    value={settings?.admin_password || ""}
                                    onChange={(e) => setLocalSettings({ ...settings, admin_password: e.target.value })}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-accent outline-none font-mono tracking-[0.4em]"
                                    placeholder="Leave blank to keep current"
                                    autoComplete="new-password"
                                />
                                {/* The stored value is a hash and is never sent back, so this
                                    starts empty and only a typed value replaces the password. */}
                                <p className="text-[10px] text-zinc-600 px-1">
                                    Stored hashed. Leave blank to keep the current password.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-red-400/5 rounded-2xl border border-red-400/10 flex gap-4">
                            <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Critical Override Warning</p>
                                <p className="text-zinc-500 text-xs leading-relaxed">Updating administrative credentials will immediately terminate all active sessions. Ensure your new security token is stored in a secure offline vault.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-4 pb-12">
                    <button
                        type="button"
                        className="px-6 py-3 bg-white/5 text-zinc-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                    >
                        Reset Changes
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-10 py-3 bg-accent text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.05] active:scale-95 transition-all shadow-xl shadow-accent/20 flex items-center gap-3"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Commit Configuration
                    </button>
                </div>
            </form>
        </div>
    );
}
