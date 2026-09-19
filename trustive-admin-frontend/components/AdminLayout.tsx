'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
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
    TriangleAlert,
    DollarSign,
    Lock,
    Newspaper,
    Menu,
    X,
} from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
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

    // UI state for dropdowns & mobile menu
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setIsMobileMenuOpen(false);
        setIsProfileOpen(false);
    }, [pathname]);

    // Admin wallet verification
    const ADMIN_WALLET_ADDRESS = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "0x861b38d9E97ebE86883A55eB4b2b70cca795785E").toLowerCase();
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
        { name: "Vesting", href: "/admin/vesting", icon: ShieldCheck },
        { name: "Security & Profile", href: "/admin/security-profile", icon: Lock },
        { name: "Payment Settings", href: "/admin/payment-settings", icon: Settings },
    ], []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-zinc-900">
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
                        className="w-full py-4 bg-[#315EFB] hover:bg-[#2548D0] text-white font-paytone text-sm uppercase rounded-2xl transition-all shadow-md shadow-[#315EFB]/20 active:scale-95 cursor-pointer"
                    >
                        Log In to Continue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden">
            {/* Full-width Top Navbar (matching user panel) */}
            <header className="fixed top-0 left-0 right-0 z-50 flex h-[5rem] w-full items-center justify-between bg-white/95 border-b border-zinc-200/80 px-4 md:px-8 backdrop-blur-md shadow-xs">
                <div className="flex items-center gap-3">
                    {/* Mobile Menu Toggle */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="lg:hidden p-2 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer rounded-lg hover:bg-zinc-100"
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>

                    {/* Logo */}
                    <Link href="/admin/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
                        <Image
                            src="/logo.svg"
                            alt="Trustive Logo"
                            width={140}
                            height={38}
                            className="object-contain w-32 sm:w-36"
                            priority
                        />
                        <span className="px-2.5 py-1 rounded-lg bg-[#315EFB]/10 text-[#315EFB] font-bold text-[11px] uppercase tracking-wider border border-[#315EFB]/20">
                            Admin
                        </span>
                    </Link>
                </div>

                {/* Right Area: Wallet & Profile */}
                <div className="flex items-center gap-3 sm:gap-4">
                    <ConnectButton.Custom>
                        {({
                            account,
                            chain,
                            openAccountModal,
                            openChainModal,
                            openConnectModal,
                            authenticationStatus,
                            mounted,
                        }) => {
                            const ready = mounted && authenticationStatus !== 'loading';
                            const connected =
                                ready &&
                                account &&
                                chain &&
                                (!authenticationStatus ||
                                    authenticationStatus === 'authenticated');

                            return (
                                <div
                                    {...(!ready && {
                                        'aria-hidden': true,
                                        style: {
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
                                                    className="hidden sm:flex items-center gap-2 rounded-xl bg-[#315EFB] px-5 py-3 text-[1rem] font-bold text-white transition-colors hover:bg-[#2548D0] shadow-md shadow-[#315EFB]/20 cursor-pointer hover:scale-105 active:scale-95"
                                                >
                                                    <Wallet className="h-4 w-4" />
                                                    Connect Wallet
                                                </button>
                                            );
                                        }

                                        if (chain.unsupported) {
                                            return (
                                                <button
                                                    onClick={openChainModal}
                                                    type="button"
                                                    className="hidden sm:flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3 text-[0.875rem] font-medium text-red-600 hover:bg-red-500/25 transition-colors cursor-pointer"
                                                >
                                                    <TriangleAlert className="h-4 w-4" />
                                                    Wrong Network
                                                </button>
                                            );
                                        }

                                        return (
                                            <button
                                                onClick={openAccountModal}
                                                type="button"
                                                className="hidden sm:flex items-center gap-2.5 rounded-xl bg-[#315EFB] px-5 py-3 text-[1rem] font-bold text-white transition-colors hover:bg-[#2548D0] shadow-md shadow-[#315EFB]/20 cursor-pointer hover:scale-105 active:scale-95"
                                            >
                                                <Wallet className="h-4 w-4" />
                                                {account.displayName}
                                            </button>
                                        );
                                    })()}
                                </div>
                            );
                        }}
                    </ConnectButton.Custom>

                    {/* Profile Dropdown */}
                    <div className="relative" ref={profileDropdownRef}>
                        <div
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="h-12 w-12 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition-all active:scale-95 flex items-center justify-center p-1 shadow-xs"
                            title="Administrator Profile"
                        >
                            <div className="w-full h-full rounded-lg bg-[#315EFB] text-white flex items-center justify-center font-bold text-base font-space-grotesk shadow-inner">
                                A
                            </div>
                        </div>

                        {isProfileOpen && (
                            <div className="absolute right-0 mt-3 w-64 rounded-2xl bg-white border border-zinc-200/90 py-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-4 py-3 border-b border-zinc-100 mb-2">
                                    <p className="text-sm font-bold text-zinc-900 truncate">Administrator</p>
                                    <p className="text-xs text-zinc-400 uppercase font-semibold tracking-wider">Super User</p>
                                    {address && (
                                        <p className="text-[11px] font-mono text-zinc-600 truncate mt-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-200/80">
                                            {shortenAddress(address)}
                                        </p>
                                    )}
                                </div>

                                <div className="px-2 space-y-1">
                                    <button
                                        onClick={() => {
                                            setIsProfileOpen(false);
                                            localStorage.removeItem("admin_token");
                                            localStorage.removeItem("admin_last_activity");
                                            disconnectWallet();
                                            router.push("/admin/login");
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[0.9375rem] text-red-600 hover:bg-red-50 transition-colors group cursor-pointer font-medium"
                                    >
                                        <LogOut className="h-4 w-4 text-red-500" />
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Layout Body */}
            <div className="flex pt-[5rem] relative">
                {/* Mobile Overlay */}
                {isMobileMenuOpen && (
                    <div
                        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                )}

                {/* Sidebar (starts at top-[5rem], matching user frontend) */}
                <aside className={cn(
                    "fixed left-0 top-[5rem] z-40 h-[calc(100vh-5rem)] w-70 bg-white/95 border-r border-zinc-200/80 p-4 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 backdrop-blur-md shadow-xs",
                    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
                )}>
                    <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    prefetch={false}
                                    className={cn(
                                        "cursor-pointer flex items-center gap-3 rounded-xl px-4 py-3 text-[1.125rem] font-medium transition-all",
                                        isActive
                                            ? "bg-[#315EFB] text-white shadow-md shadow-[#315EFB]/20"
                                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    <span className="truncate">{item.name}</span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Bottom Status Card */}
                    <div className="rounded-xl bg-zinc-50/90 border border-zinc-200/80 p-4 mt-4 space-y-1 shrink-0">
                        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Admin Status</div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900">
                                {isAdminWallet ? "Master Admin" : "Restricted"}
                            </span>
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                isAdminWallet
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                    : "bg-amber-100 text-amber-700 border-amber-200"
                            )}>
                                {isAdminWallet ? "Authorized" : "Unauthorized"}
                            </span>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="lg:pl-70 w-full transition-all min-h-[calc(100vh-5rem)] relative">
                    <div className="p-4 sm:p-6 lg:p-8">
                        {/* Breadcrumbs & Page Title */}
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-zinc-200/70">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-black text-[#001060] uppercase tracking-tight font-manrope">
                                    {navItems.find((item) => item.href === pathname)?.name || "Control Center"}
                                </h2>
                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium mt-1">
                                    <span>Admin</span>
                                    <span className="text-[#315EFB]">/</span>
                                    <span className="text-[#315EFB] font-bold">
                                        {navItems.find((item) => item.href === pathname)?.name || "Control Center"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {!isAdminWallet ? (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-8">
                                <div className="max-w-md w-full bg-white border border-zinc-200 rounded-[2.5rem] p-10 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                                    <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-blue-200">
                                        {isConnected ? (
                                            <TriangleAlert className="w-10 h-10 text-amber-500" />
                                        ) : (
                                            <Wallet className="w-10 h-10 text-[#315EFB]" />
                                        )}
                                    </div>
                                    <h1 className="text-2xl font-black text-[#001060] uppercase tracking-tight mb-4">
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
                                            <p className="text-[10px] font-bold text-[#315EFB] uppercase tracking-widest mb-1">Required Authority</p>
                                            <p className="text-xs font-mono text-zinc-600 break-all">{ADMIN_WALLET_ADDRESS || 'Master Admin Address Not Set'}</p>
                                        </div>

                                        {!isConnected ? (
                                            <ConnectButton.Custom>
                                                {({ openConnectModal }) => (
                                                    <button
                                                        onClick={openConnectModal}
                                                        className="w-full py-4 bg-[#315EFB] hover:bg-[#2548D0] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-[#315EFB]/20 hover:scale-105 transition-all active:scale-95 cursor-pointer"
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
                    </div>
                </main>
            </div>
        </div>
    );
}
