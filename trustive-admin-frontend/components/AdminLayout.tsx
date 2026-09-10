'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWeb3 } from "@/lib/context/Web3Context";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import {
    LayoutDashboard,
    Users,
    CreditCard,
    ShieldCheck,
    History,
    Settings,
    Wallet,
    LogOut,
    TrendingUp,
    Coins,
    TriangleAlert,
    DollarSign,
    Lock,
    Newspaper
} from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import { useMemo } from "react";
import { apiRequest } from "@/lib/api-client";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/admin/login" || pathname === "/login" || !pathname.startsWith("/admin");

    if (isLoginPage) {
        return <>{children}</>;
    }

    return <AdminDashboardLayout>{children}</AdminDashboardLayout>;
}

function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Wallet - Only called when NOT on login page
    const { address, isConnected } = useAccount();
    const { disconnectWallet } = useWeb3();

    // Admin wallet verification
    const ADMIN_WALLET_ADDRESS = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0x1DE6383befD31A8700ba4EC3bAfc1aA4356FB00B").toLowerCase();
    const isAdminWallet = address && ADMIN_WALLET_ADDRESS && address.toLowerCase() === ADMIN_WALLET_ADDRESS;

    const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of inactivity

    useEffect(() => {
        const logoutAdmin = () => {
            localStorage.removeItem("admin_token");
            localStorage.removeItem("admin_last_activity");
            setIsAuthenticated(false);
            router.push("/admin/login");
        };

        const isIdleTimedOut = () => {
            try {
                const lastActivity = Number(localStorage.getItem("admin_last_activity") || 0);
                if (!lastActivity) return false;
                return Date.now() - lastActivity > IDLE_TIMEOUT_MS;
            } catch {
                return false;
            }
        };

        const checkAuth = async () => {
            const token = localStorage.getItem("admin_token");
            if (!token || isIdleTimedOut()) {
                logoutAdmin();
                setIsLoading(false);
                return;
            }

            try {
                const data = await apiRequest("/verify");
                if (data && data.status) {
                    setIsAuthenticated(true);
                    if (!localStorage.getItem("admin_last_activity")) {
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                    }
                } else {
                    logoutAdmin();
                }
            } catch (err) {
                logoutAdmin();
            } finally {
                setIsLoading(false);
            }
        };
        checkAuth();

        const handleUnauthorized = () => {
            logoutAdmin();
        };

        // Record admin movement/activity
        let lastRecorded = 0;
        const recordActivity = () => {
            const now = Date.now();
            if (now - lastRecorded > 2000) {
                lastRecorded = now;
                try {
                    if (localStorage.getItem("admin_token")) {
                        localStorage.setItem("admin_last_activity", now.toString());
                    }
                } catch { }
            }
        };

        if (typeof window !== "undefined" && localStorage.getItem("admin_token") && !localStorage.getItem("admin_last_activity")) {
            localStorage.setItem("admin_last_activity", Date.now().toString());
        }

        const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click", "wheel"];
        activityEvents.forEach((evt) => {
            window.addEventListener(evt, recordActivity, { passive: true });
        });

        // Periodic check for 10 min idle timeout
        const idleInterval = setInterval(() => {
            if (localStorage.getItem("admin_token") && isIdleTimedOut()) {
                logoutAdmin();
            }
        }, 2500);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && localStorage.getItem("admin_token") && isIdleTimedOut()) {
                logoutAdmin();
            }
        };

        window.addEventListener("unauthorized", handleUnauthorized);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(idleInterval);
            activityEvents.forEach((evt) => {
                window.removeEventListener(evt, recordActivity);
            });
            window.removeEventListener("unauthorized", handleUnauthorized);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [router]);

    const navItems = useMemo(() => [
        { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
        { name: "Sales", href: "/admin/sales", icon: TrendingUp },
        { name: "Users", href: "/admin/users", icon: Users },
        { name: "Transactions", href: "/admin/transactions", icon: CreditCard },
        { name: "Admin Wallet", href: "/admin/admin-wallet", icon: Wallet },
        // { name: "Staking Transactions", href: "/admin/staking-transactions", icon: Coins },
        { name: "Vesting", href: "/admin/vesting", icon: ShieldCheck },
        { name: "Security & Profile", href: "/admin/security-profile", icon: Lock },
        { name: "Payment Settings", href: "/admin/payment-settings", icon: Settings },
    ], []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-white">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
                    <p className="mt-4 text-accent font-semibold tracking-widest text-sm uppercase">Verifying Authorization...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                <div className="bg-sidebar w-full max-w-md rounded-3xl border border-white/10 p-8 text-center space-y-6 shadow-2xl">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20">
                        <Lock className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider">Authentication Required</h3>
                        <p className="text-zinc-400 text-xs font-medium leading-relaxed">
                            You must log in with authorized administrator credentials before accessing the Control Center.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push("/admin/login")}
                        className="w-full py-4 bg-accent hover:bg-accent/90 text-black font-paytone text-sm uppercase rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer"
                    >
                        Log In to Continue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex overflow-hidden">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-screen w-70 bg-white z-40 hidden lg:flex flex-col border-r border-zinc-200/90 shadow-sm overflow-hidden">
                <div className="p-8 shrink-0">
                    <Link href="/admin/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
                        <div className="w-10 h-10 bg-[#212E73] rounded-full flex items-center justify-center overflow-hidden shadow-md shadow-[#212E73]/20">
                            <span className="text-white font-bold text-xl font-space-grotesk">T</span>
                        </div>
                        <span className="text-xl font-bold text-zinc-900 tracking-tight uppercase">Trustive Admin</span>
                    </Link>
                </div>

                <nav className="flex-1 px-4 space-y-1.5 py-4 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                className={cn(
                                    "flex items-center gap-4 px-5 py-3 rounded-xl transition-all font-medium text-sm",
                                    isActive
                                        ? "bg-[#212E73] text-white shadow-md shadow-[#212E73]/20"
                                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                                )}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 mt-auto border-t border-zinc-200 space-y-3">
                    <button
                        onClick={() => {
                            localStorage.removeItem("admin_token");
                            localStorage.removeItem("admin_last_activity");
                            disconnectWallet();
                            router.push("/admin/login");
                        }}
                        className="flex items-center justify-center gap-3 w-full py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all text-sm font-bold border border-red-200"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>

                    <div className="flex items-center gap-3 px-2 py-2">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center shrink-0 border border-blue-200">
                            <Users className="w-4 h-4 text-[#212E73]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <p className="text-xs font-bold text-zinc-900 truncate">Administrator</p>
                            <p className="text-[10px] text-zinc-500 uppercase truncate">Super User</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 lg:ml-70 flex flex-col h-screen overflow-hidden">
                <header className="h-[80px] shrink-0 bg-white/90 backdrop-blur-md flex items-center justify-between px-8 border-b border-zinc-200/90 shadow-xs z-30">
                    <div className="flex flex-col min-w-0">
                        <h2 className="text-lg font-bold text-zinc-900 uppercase tracking-tight">
                            {navItems.find((item) => item.href === pathname)?.name || "Control Center"}
                        </h2>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase tracking-widest mt-0.5">
                            <span>Admin Console</span>
                            <span className="text-[#212E73]">/</span>
                            <span className="text-[#212E73] font-bold truncate">
                                {navItems.find((item) => item.href === pathname)?.name || "Overview"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <ConnectButton.Custom>
                            {({
                                account: rbAccount,
                                chain,
                                openAccountModal,
                                openChainModal,
                                openConnectModal,
                                mounted,
                            }) => {
                                const ready = mounted;
                                const connected = ready && rbAccount && chain;

                                return (
                                    <div
                                        {...(!ready && {
                                            'aria-hidden': true,
                                            'style': {
                                                opacity: 0,
                                                pointerEvents: 'none',
                                                userSelect: 'none',
                                            },
                                        })}
                                    >
                                        {(() => {
                                            if (!connected) {
                                                return (
                                                    <button
                                                        onClick={openConnectModal}
                                                        type="button"
                                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#212E73] text-white font-bold text-xs transition-all shadow-md shadow-[#212E73]/20 hover:bg-[#16225B] hover:scale-105 active:scale-95 cursor-pointer"
                                                    >
                                                        <Wallet className="w-4 h-4" />
                                                        Connect Wallet
                                                    </button>
                                                );
                                            }

                                            if (chain.unsupported) {
                                                return (
                                                    <button
                                                        onClick={openChainModal}
                                                        type="button"
                                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs transition-all shadow-md shadow-red-500/20 hover:scale-105 active:scale-95 cursor-pointer"
                                                    >
                                                        <TriangleAlert className="w-4 h-4" />
                                                        Wrong Network
                                                    </button>
                                                );
                                            }

                                            return (
                                                <button
                                                    onClick={openAccountModal}
                                                    type="button"
                                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900 font-bold text-xs transition-all hover:bg-zinc-200 cursor-pointer shadow-xs"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                                                    {rbAccount.displayName}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                );
                            }}
                        </ConnectButton.Custom>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-transparent relative">
                    {!isAdminWallet ? (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-8">
                            <div className="max-w-md w-full bg-white border border-zinc-200 rounded-[2.5rem] p-10 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-blue-200">
                                    {isConnected ? (
                                        <TriangleAlert className="w-10 h-10 text-amber-500" />
                                    ) : (
                                        <Wallet className="w-10 h-10 text-[#212E73]" />
                                    )}
                                </div>
                                <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight mb-4">
                                    {isConnected ? "Unauthorized Wallet" : "Identity Required"}
                                </h1>
                                <p className="text-zinc-600 text-sm font-medium leading-relaxed mb-8">
                                    {isConnected 
                                        ? `The connected wallet (${shortenAddress(address || "")}) is not authorized.`
                                        : "Please connect the authorized master admin wallet to access the control panel."
                                    }
                                </p>
                                <div className="space-y-4">
                                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                                        <p className="text-[10px] font-bold text-[#212E73] uppercase tracking-widest mb-1">Required Authority</p>
                                        <p className="text-xs font-mono text-zinc-600 break-all">{ADMIN_WALLET_ADDRESS || 'Master Admin Address Not Set'}</p>
                                    </div>
                                    
                                    {!isConnected ? (
                                        <ConnectButton.Custom>
                                            {({ openConnectModal }) => (
                                                <button
                                                    onClick={openConnectModal}
                                                    className="w-full py-4 bg-accent text-black rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-accent/20 hover:scale-105 transition-all active:scale-95"
                                                >
                                                    Connect Admin Wallet
                                                </button>
                                            )}
                                        </ConnectButton.Custom>
                                    ) : (
                                        <button
                                            onClick={() => disconnectWallet()}
                                            className="w-full py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95"
                                        >
                                            Switch Account
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>
        </div>
    );
}
