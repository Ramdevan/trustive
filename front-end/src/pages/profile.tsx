import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import { confirmAction } from '@/utils/confirm';
import { LuUser, LuMail, LuLock, LuCamera, LuCircleCheck, LuWallet, LuTriangleAlert, LuEye, LuEyeOff } from 'react-icons/lu';
import { toast } from 'react-hot-toast';
import { useWeb3 } from '@/context/Web3Context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function Profile() {
    const router = useRouter();
    const { account, isConnected } = useWeb3();
    const [user, setUser] = useState<{
        name: string;
        email: string;
        wallet_address: string;
        profile_pic: string | null;
    }>(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('user_data');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    return {
                        name: parsed.name || '',
                        email: parsed.email || '',
                        wallet_address: parsed.wallet_address || '',
                        profile_pic: parsed.profile_pic || null
                    };
                }
            } catch {}
        }
        return {
            name: '',
            email: '',
            wallet_address: '',
            profile_pic: null
        };
    });

    const [loading, setLoading] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return !localStorage.getItem('user_data');
        }
        return false;
    });
    const [saving, setSaving] = useState(false);

    const [newName, setNewName] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('user_data');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    return parsed.name || '';
                }
            } catch {}
        }
        return '';
    });

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // 2FA State
    const [twoFaEnabled, setTwoFaEnabled] = useState(false);
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [twoFaSecret, setTwoFaSecret] = useState('');
    const [twoFaCodeInput, setTwoFaCodeInput] = useState('');
    const [showDisable2FA, setShowDisable2FA] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [showDisablePassword, setShowDisablePassword] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('user_token');
        if (!token) {
            router.replace('/login');
            return;
        }
        fetchProfile();
        fetch2FAStatus();
    }, []);

    const fetch2FAStatus = async () => {
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/2fa-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status) setTwoFaEnabled(data.enabled);
        } catch (err) {
            console.error(err);
        }
    };

    const initiate2FASetup = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/generate-2fa`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status && data.qrCode) {
                setQrCode(data.qrCode);
                setTwoFaSecret(data.secret || '');
                setShow2FASetup(true);
            } else {
                // Without this the button looked dead when the server refused
                toast.error(data.msg || 'Failed to start 2FA setup');
            }
        } catch (err) {
            toast.error('Failed to initiate 2FA');
        } finally {
            setSaving(false);
        }
    };

    const verifyAndEnable2FA = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/verify-2fa`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code: twoFaCodeInput })
            });
            const data = await res.json();
            if (data.status) {
                toast.success('2FA enabled successfully');
                setTwoFaEnabled(true);
                setShow2FASetup(false);
                setTwoFaCodeInput('');
            } else {
                toast.error(data.msg || 'Invalid code');
            }
        } catch (err) {
            toast.error('Verification failed');
        } finally {
            setSaving(false);
        }
    };

    const closeDisable2FA = () => {
        setShowDisable2FA(false);
        setDisablePassword('');
        setDisableCode('');
        setShowDisablePassword(false);
    };

    // A yes/no confirm proved nothing about who was at the keyboard, so turning
    // 2FA off now costs the account password plus a live authenticator code.
    const disable2FA = async () => {
        if (disablePassword.length === 0 || disableCode.length !== 6) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/disable-2fa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password: disablePassword, code: disableCode })
            });
            const data = await res.json();
            if (data.status) {
                toast.success('2FA disabled');
                setTwoFaEnabled(false);
                closeDisable2FA();
            } else {
                toast.error(data.msg || 'Failed to disable 2FA');
                setDisableCode('');
            }
        } catch (err) {
            toast.error('Failed to disable 2FA');
        } finally {
            setSaving(false);
        }
    };

    const fetchProfile = async () => {
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status && data.user) {
                setUser(data.user);
                setNewName(data.user.name || '');
                try {
                    const cached = localStorage.getItem('user_data');
                    const existing = cached ? JSON.parse(cached) : {};
                    localStorage.setItem('user_data', JSON.stringify({ ...existing, ...data.user }));
                } catch {}
            } else {
                toast.error(data.msg || 'Failed to fetch profile');
            }
        } catch (err) {
            console.error(err);
            toast.error('Connection error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateName = async () => {
        if (!newName || newName.trim() === '') return toast.error('Name is required');
        
        const confirmed = await confirmAction(`Update your username to "${newName.trim()}"?`);
        if (!confirmed) return;

        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/update-name`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newName })
            });
            const data = await res.json();
            if (data.status) {
                toast.success('Name updated successfully');
                setUser(prev => {
                    const updated = { ...prev, name: newName };
                    try {
                        const cached = localStorage.getItem('user_data');
                        const existing = cached ? JSON.parse(cached) : {};
                        localStorage.setItem('user_data', JSON.stringify({ ...existing, name: newName }));
                    } catch {}
                    return updated;
                });
            } else {
                toast.error(data.msg || 'Update failed');
            }
        } catch (err) {
            toast.error('Connection error');
        } finally {
            setSaving(false);
        }
    };
    const handleLinkWallet = async () => {
        if (!account) return toast.error('Please connect your wallet first');
        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/link-wallet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ wallet_address: account })
            });
            const data = await res.json();
            if (data.status) {
                toast.success('Wallet linked successfully');
                setUser(prev => {
                    const updated = { ...prev, wallet_address: account };
                    try {
                        const cached = localStorage.getItem('user_data');
                        const existing = cached ? JSON.parse(cached) : {};
                        localStorage.setItem('user_data', JSON.stringify({ ...existing, wallet_address: account }));
                    } catch {}
                    return updated;
                });
            } else {
                toast.error(data.msg || 'Linking failed');
            }
        } catch (err) {
            toast.error('Connection error');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (passwords.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('user_token');
            const res = await fetch(`${API_URL}/api/user/update-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                })
            });
            const data = await res.json();
            if (data.status) {
                toast.success('Password updated successfully');
                setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                toast.error(data.msg || 'Update failed');
            }
        } catch (err) {
            toast.error('Connection error');
        } finally {
            setSaving(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            toast.error('File size too large (max 2MB)');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const token = localStorage.getItem('user_token');
                const res = await fetch(`${API_URL}/api/user/update-profile-pic`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ profile_pic: base64 })
                });
                const data = await res.json();
                if (data.status) {
                    setUser(prev => {
                        const updated = { ...prev, profile_pic: base64 };
                        try {
                            const cached = localStorage.getItem('user_data');
                            const existing = cached ? JSON.parse(cached) : {};
                            localStorage.setItem('user_data', JSON.stringify({ ...existing, profile_pic: base64 }));
                        } catch {}
                        return updated;
                    });
                    toast.success('Profile picture updated');
                } else {
                    toast.error('Update failed');
                }
            } catch (err) {
                toast.error('Upload error');
            }
        };
        reader.readAsDataURL(file);
    };

    if (loading) {
        return (
            <AuthGuard>
            <Layout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                </div>
            </Layout>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <header className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold text-white tracking-tight">Account Settings</h1>
                    <p className="text-zinc-500">Manage your profile and security preferences</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Avatar & Basic Info */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-card border border-white/5 rounded-3xl p-8 flex flex-col items-center text-center shadow-xl shadow-black/20">
                            <div className="relative group">
                                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-accent/20 bg-zinc-900 flex items-center justify-center">
                                    {user.profile_pic ? (
                                        <img src={user.profile_pic} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <LuUser className="w-12 h-12 text-accent/40" />
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 w-10 h-10 bg-accent rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-transform border-4 border-card">
                                    <LuCamera className="w-4 h-4 text-black" />
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                </label>
                            </div>
                            <h2 className="mt-6 text-xl font-bold text-white uppercase tracking-tight">{user.name}</h2>
                            
                            <div className="mt-4 w-full space-y-3">
                                <div className="flex flex-col items-center gap-1">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Account Wallet</p>
                                    <p className="text-sm text-zinc-300 font-mono break-all px-2">
                                        {user.wallet_address || 'No wallet linked'}
                                    </p>
                                </div>

                                {/* Link Wallet Action */}
                                {!user.wallet_address && isConnected && account && (
                                    <button
                                        onClick={handleLinkWallet}
                                        disabled={saving}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-xs font-bold transition-all"
                                    >
                                        <LuWallet className="w-4 h-4" />
                                        {saving ? 'Linking...' : 'Link Current Wallet'}
                                    </button>
                                )}

                                {/* Wallet Mismatch Warning */}
                                {user.wallet_address && isConnected && account && user.wallet_address.toLowerCase() !== account.toLowerCase() && (
                                    <div className="flex flex-col items-center gap-1 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-medium text-center">
                                        <div className="flex items-center gap-2">
                                            <LuTriangleAlert className="w-4 h-4" />
                                            <span>Wallet Mismatch</span>
                                        </div>
                                        <p className="opacity-70">Connected: {account.slice(0,6)}...{account.slice(-4)}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Settings Forms */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Personal Details */}
                        <section className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-xl shadow-black/20">
                            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                                    <LuMail className="w-4 h-4 text-accent" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Personal Information</h3>
                            </div>
                            <div className="p-8 space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Full Name</label>
                                    <div className="flex flex-col md:flex-row gap-4">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            placeholder="Enter your full name"
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-accent/50 focus:ring-0 transition-colors"
                                        />
                                        <button
                                            onClick={handleUpdateName}
                                            disabled={saving || !newName || newName === user.name}
                                            className="px-8 py-3 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Update Name
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email Address</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            disabled
                                            value={user.email}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-zinc-400 cursor-not-allowed"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[10px] text-zinc-500 uppercase font-bold">
                                            <LuCircleCheck className="w-3 h-3 text-green-500" />
                                            Verified
                                        </div>
                                    </div>
                                    <p className="mt-2 text-xs text-zinc-500 italic">Sign-in email cannot be changed for security reasons.</p>
                                </div>
                            </div>
                        </section>

                        {/* Change Password */}
                        <section className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-xl shadow-black/20">
                            <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                                    <LuLock className="w-4 h-4 text-accent" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Security & Password</h3>
                            </div>
                            <form onSubmit={handlePasswordChange} className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Current Password</label>
                                        <div className="relative">
                                            <input
                                                type={showCurrentPassword ? "text" : "password"}
                                                required
                                                value={passwords.currentPassword}
                                                onChange={(e) => setPasswords(p => ({ ...p, currentPassword: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white focus:border-accent/50 focus:ring-0 transition-colors"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1"
                                                title={showCurrentPassword ? "Hide password" : "Show password"}
                                            >
                                                {showCurrentPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">New Password</label>
                                        <div className="relative">
                                            <input
                                                type={showNewPassword ? "text" : "password"}
                                                required
                                                value={passwords.newPassword}
                                                onChange={(e) => setPasswords(p => ({ ...p, newPassword: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white focus:border-accent/50 focus:ring-0 transition-colors"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1"
                                                title={showNewPassword ? "Hide password" : "Show password"}
                                            >
                                                {showNewPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Confirm New Password</label>
                                        <div className="relative">
                                            <input
                                                type={showConfirmPassword ? "text" : "password"}
                                                required
                                                value={passwords.confirmPassword}
                                                onChange={(e) => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white focus:border-accent/50 focus:ring-0 transition-colors"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1"
                                                title={showConfirmPassword ? "Hide password" : "Show password"}
                                            >
                                                {showConfirmPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full md:w-auto px-12 py-4 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {saving ? 'Saving...' : 'Update Password'}
                                </button>
                            </form>
                        </section>

                        {/* Multi-Factor Authentication */}
                        <section className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-xl shadow-black/20">
                            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-blue-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Multi-Factor Auth</h3>
                                </div>
                                <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                    twoFaEnabled ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                                }`}>
                                    {twoFaEnabled ? "Active" : "Inactive"}
                                </div>
                            </div>
                            
                            <div className="p-8">
                                {!show2FASetup ? (
                                    <div className="flex flex-col md:flex-row items-center gap-8">
                                        <div className="w-20 h-20 bg-zinc-900 border border-white/5 rounded-3xl flex items-center justify-center shrink-0">
                                            <Smartphone className={`w-10 h-10 ${twoFaEnabled ? "text-green-500" : "text-zinc-600"}`} />
                                        </div>
                                        <div className="space-y-2 flex-1 text-center md:text-left">
                                            <h4 className="text-white font-bold uppercase tracking-wider text-sm">
                                                {twoFaEnabled ? "Encryption Active" : "Add extra layer of security"}
                                            </h4>
                                            <p className="text-zinc-500 text-xs leading-relaxed max-w-[28rem]">
                                                {twoFaEnabled 
                                                    ? "Your account is protected with TOTP. Every login will require a 6-digit code from your authenticator app."
                                                    : "Enable Google 2FA to protect your account and assets from unauthorized access by requiring a dynamic token on every login."
                                                }
                                            </p>
                                        </div>
                                        <button
                                            onClick={twoFaEnabled ? () => setShowDisable2FA(true) : initiate2FASetup}
                                            disabled={saving}
                                            className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all active:scale-95 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                                                twoFaEnabled ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                                            }`}
                                        >
                                            {saving ? "Please wait..." : twoFaEnabled ? "Disable 2FA" : "Set Up 2FA"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in zoom-in-95 duration-500">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <div className="p-2 bg-white rounded-2xl">
                                                <img src={qrCode} alt="Setup QR" className="w-32 h-32" />
                                            </div>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">
                                                Scan with Google <br /> Authenticator
                                            </p>
                                            {twoFaSecret && (
                                                <div className="w-full max-w-[14rem] bg-black/40 border border-white/10 rounded-xl p-2.5 text-center space-y-1">
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Manual Entry Key</span>
                                                    <span className="font-mono text-[11px] text-accent font-bold select-all tracking-wider break-all block">{twoFaSecret}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-6 flex flex-col justify-center">
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[2px] ml-1">Verification Code</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        maxLength={6}
                                                        value={twoFaCodeInput}
                                                        onChange={(e) => setTwoFaCodeInput(e.target.value.replace(/\D/g, ""))}
                                                        className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-bold tracking-[0.4rem] focus:border-blue-500 outline-none"
                                                        placeholder="000000"
                                                    />
                                                    <button
                                                        onClick={verifyAndEnable2FA}
                                                        disabled={twoFaCodeInput.length !== 6 || saving}
                                                        className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                                                    >
                                                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify"}
                                                    </button>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setShow2FASetup(false)}
                                                className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest hover:text-white transition-colors"
                                            >
                                                Cancel Setup
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {showDisable2FA && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget && !saving) closeDisable2FA(); }}
                >
                    <div className="w-full max-w-md rounded-3xl bg-card border border-white/10 p-6 space-y-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <LuTriangleAlert className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-white font-bold text-lg leading-tight">Disable two-factor auth?</h3>
                                <p className="text-zinc-500 text-xs leading-relaxed">
                                    Your account will be protected by your password alone. Confirm it is you by
                                    entering your password and a current code from your authenticator app.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[2px] ml-1">Account Password</label>
                                <div className="relative">
                                    <input
                                        type={showDisablePassword ? 'text' : 'password'}
                                        value={disablePassword}
                                        onChange={e => setDisablePassword(e.target.value)}
                                        autoComplete="current-password"
                                        placeholder="Enter your password"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-11 py-3 text-white text-sm focus:border-blue-500 outline-none placeholder:text-zinc-700"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowDisablePassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                                        aria-label={showDisablePassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showDisablePassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[2px] ml-1">Authenticator Code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={disableCode}
                                    onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                    onKeyDown={e => { if (e.key === 'Enter') disable2FA(); }}
                                    placeholder="000000"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-bold tracking-[0.4rem] focus:border-blue-500 outline-none placeholder:text-zinc-700"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={closeDisable2FA}
                                disabled={saving}
                                className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/5 text-zinc-300 hover:text-white hover:bg-white/10 font-bold text-[0.8rem] transition-all disabled:opacity-40"
                            >
                                Keep 2FA On
                            </button>
                            <button
                                onClick={disable2FA}
                                disabled={saving || !disablePassword || disableCode.length !== 6}
                                className="flex-1 py-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-[0.8rem] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Verifying...' : 'Disable 2FA'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
        </AuthGuard>
    );
}

function Shield(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
  )
}
function Smartphone(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
  )
}
function Loader2(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`animate-spin ${props.className}`}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  )
}
