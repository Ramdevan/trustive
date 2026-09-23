'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWeb3 } from "@/lib/context/Web3Context";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import {
    LayoutDashboard,
    Users,
    CreditCard,
    ShieldCheck,
    Settings,
    Wallet,
    LogOut,
    TrendingUp,
    TriangleAlert,
    Lock,
    Menu,
    X,
    Gift,
    ArrowDownToLine,
    Coins,
    Crown,
    ChevronDown,
    Vote,
} from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import { apiRequest } from "@/lib/api-client";
import {
    CONTRACT_OWNERS,
    CONTRACT_ADMINS,
    isOwnerAddress,
    isAdminAddress,
    isAuthorizedWallet,
    getAddressRole,
    AdminRole,
} from "@/lib/roles";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of inactivity

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isOwnerPanel = pathname.startsWith("/owner");
    const isAdminPanel = pathname.startsWith("/admin");
    const isLoginPage = pathname === "/admin/login" || pathname === "/owner/login" || pathname === "/login" || pathname === "/" || (!isOwnerPanel && !isAdminPanel);

    if (isLoginPage) {
        return <>{children}</>;
    }

    return <AdminDashboardLayout>{children}</AdminDashboardLayout>;
}

function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isOwnerPanel = pathname.startsWith("/owner");
    const panelPrefix = isOwnerPanel ? "/owner" : "/admin";
    const loginUrl = `${panelPrefix}/login`;

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<AdminRole>(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("admin_role") as AdminRole) || (isOwnerPanel ? "owner" : "admin");
        }
        return isOwnerPanel ? "owner" : "admin";
    });

    // Wallet
    const { address, isConnected } = useAccount();
    const { disconnectWallet } = useWeb3();

    // UI state for dropdowns & mobile menu
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showRoleAddresses, setShowRoleAddresses] = useState(false);
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    // Connected wallet role resolution
    const connectedWalletRole = getAddressRole(address);
    // Effective role: strictly reflects panel prefix
    const effectiveRole: AdminRole = isOwnerPanel ? "owner" : "admin";

    // Update session role when wallet changes
    useEffect(() => {
        if (address) {
            const role = getAddressRole(address);
            if (role) {
                setUserRole(role);
                localStorage.setItem("admin_role", role);
            }
        }
    }, [address]);

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

    const isOwnerWallet = isOwnerAddress(address);
    const isAdminWallet = isAdminAddress(address);
    const isAuthorized = isAuthorizedWallet(address);

    useEffect(() => {
        const logoutAdmin = () => {
            localStorage.removeItem("admin_token");
            localStorage.removeItem("admin_role");
            localStorage.removeItem("admin_last_activity");
            setIsAuthenticated(false);
            router.push(loginUrl);
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
                    if (data.role) {
                        setUserRole(data.role);
                        localStorage.setItem("admin_role", data.role);
                    }
                    if (!localStorage.getItem("admin_last_activity")) {
                        localStorage.setItem("admin_last_activity", Date.now().toString());
                    }
                } else {
                    logoutAdmin();
                }
            } catch {
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
    }, [router, loginUrl]);

    // Role-filtered navigation items
    const navItems = useMemo(() => {
        if (isOwnerPanel) {
            return [
                { name: "Dashboard", href: "/owner/dashboard", icon: LayoutDashboard, ownerOnly: false },
                { name: "Withdraw", href: "/owner/withdraw", icon: ArrowDownToLine, ownerOnly: true },
                { name: "Governance", href: "/owner/governance", icon: Vote, ownerOnly: false },
                { name: "BaseCoins", href: "/owner/base-coins", icon: Coins, ownerOnly: false },
                { name: "Sales", href: "/owner/sales", icon: TrendingUp, ownerOnly: false },
                { name: "Users", href: "/owner/users", icon: Users, ownerOnly: false },
                { name: "Transactions", href: "/owner/transactions", icon: CreditCard, ownerOnly: false },
                { name: "Referrals", href: "/owner/referral", icon: Gift, ownerOnly: false },
                { name: "Vesting", href: "/owner/vesting", icon: ShieldCheck, ownerOnly: false },
                { name: "Security & Profile", href: "/owner/security-profile", icon: Lock, ownerOnly: true },
                { name: "Payment Settings", href: "/owner/payment-settings", icon: Settings, ownerOnly: false },
            ];
        }

        return [
            { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, ownerOnly: false },
            { name: "Governance", href: "/admin/governance", icon: Vote, ownerOnly: false },
            { name: "BaseCoins", href: "/admin/base-coins", icon: Coins, ownerOnly: false },
            { name: "Sales", href: "/admin/sales", icon: TrendingUp, ownerOnly: false },
            { name: "Users", href: "/admin/users", icon: Users, ownerOnly: false },
            { name: "Transactions", href: "/admin/transactions", icon: CreditCard, ownerOnly: false },
            { name: "Referrals", href: "/admin/referral", icon: Gift, ownerOnly: false },
            { name: "Vesting", href: "/admin/vesting", icon: ShieldCheck, ownerOnly: false },
            { name: "Payment Settings", href: "/admin/payment-settings", icon: Settings, ownerOnly: false },
        ];
    }, [isOwnerPanel]);

    // Check if current route is owner-only under /admin
    const isCurrentRouteOwnerOnly = pathname === "/admin/withdraw" || pathname === "/admin/security-profile";

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-zinc-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#36A886] mx-auto"></div>
                    <p className="mt-4 text-[#36A886] font-semibold tracking-widest text-sm uppercase">Verifying Authorization...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                <div className="bg-white w-full max-w-md rounded-3xl border border-zinc-200 p-8 text-center space-y-6 shadow-2xl">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
                        <Lock className="w-8 h-8 text-[#36A886]" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-zinc-900 uppercase tracking-wider">Authentication Required</h3>
                        <p className="text-zinc-600 text-xs font-medium leading-relaxed">
                            You must log in with authorized credentials or an authorized Web3 wallet before accessing the {isOwnerPanel ? "Owner" : "Admin"} Control Center.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push(loginUrl)}
                        className={cn(
                            "w-full py-4 text-white font-paytone text-sm uppercase rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer",
                            isOwnerPanel
                                ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                                : "bg-[#36A886] hover:bg-[#2548D0] shadow-[#36A886]/20"
                        )}
                    >
                        Log In to {isOwnerPanel ? "Owner" : "Admin"} Panel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden">
            {/* Full-width Top Navbar */}
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

                    {/* Logo & Panel Badge */}
                    <Link href={`${panelPrefix}/dashboard`} className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
                        <Image
                            src="/logo.svg"
                            alt="Trustive Logo"
                            width={140}
                            height={38}
                            className="object-contain w-32 sm:w-36"
                            priority
                        />
                        {effectiveRole === "owner" ? (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 font-bold text-[11px] uppercase tracking-wider border border-amber-500/30 flex items-center gap-1.5 shadow-xs">
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                                Owner Panel
                            </span>
                        ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-[#36A886]/10 text-[#36A886] font-bold text-[11px] uppercase tracking-wider border border-[#36A886]/20 flex items-center gap-1.5 shadow-xs">
                                <ShieldCheck className="w-3.5 h-3.5 text-[#36A886]" />
                                Admin Panel
                            </span>
                        )}
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
                                                    className="hidden sm:flex items-center gap-2 rounded-xl bg-[#36A886] px-5 py-3 text-[1rem] font-bold text-white transition-colors hover:bg-[#2548D0] shadow-md shadow-[#36A886]/20 cursor-pointer hover:scale-105 active:scale-95"
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
                                                className={cn(
                                                    "hidden sm:flex items-center gap-2.5 rounded-xl px-5 py-3 text-[1rem] font-bold text-white transition-colors shadow-md cursor-pointer hover:scale-105 active:scale-95",
                                                    isOwnerAddress(address)
                                                        ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                                                        : isAdminAddress(address)
                                                            ? "bg-[#36A886] hover:bg-[#2548D0] shadow-[#36A886]/20"
                                                            : "bg-zinc-600 hover:bg-zinc-700 shadow-zinc-600/20"
                                                )}
                                            >
                                                {isOwnerAddress(address) ? (
                                                    <Crown className="h-4 w-4" />
                                                ) : (
                                                    <Wallet className="h-4 w-4" />
                                                )}
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
                            className={cn(
                                "h-12 w-12 overflow-hidden rounded-xl border cursor-pointer transition-all active:scale-95 flex items-center justify-center p-1 shadow-xs",
                                effectiveRole === "owner"
                                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                            )}
                            title={effectiveRole === "owner" ? "Owner Profile" : "Admin Profile"}
                        >
                            <div
                                className={cn(
                                    "w-full h-full rounded-lg text-white flex items-center justify-center font-bold text-base font-space-grotesk shadow-inner",
                                    effectiveRole === "owner" ? "bg-amber-600" : "bg-[#36A886]"
                                )}
                            >
                                {effectiveRole === "owner" ? "O" : "A"}
                            </div>
                        </div>

                        {isProfileOpen && (
                            <div className="absolute right-0 mt-3 w-72 rounded-2xl bg-white border border-zinc-200/90 py-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-4 py-3 border-b border-zinc-100 mb-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-zinc-900 truncate">
                                            {effectiveRole === "owner" ? "Contract Owner" : "Contract Admin"}
                                        </p>
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                                                effectiveRole === "owner"
                                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                                    : "bg-blue-100 text-[#36A886] border-blue-200"
                                            )}
                                        >
                                            {effectiveRole === "owner" ? "Full Access" : "Admin Only"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 font-semibold tracking-wider mt-1">
                                        {effectiveRole === "owner" ? "Quorum: 2 of 3 Owners" : "Quorum: 3 of 5 Admins"}
                                    </p>
                                    {address && (
                                        <p className="text-[11px] font-mono text-zinc-600 truncate mt-2 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-200/80">
                                            {shortenAddress(address)}
                                        </p>
                                    )}
                                </div>

                                <div className="px-2 space-y-1">
                                    {isOwnerPanel ? (
                                        <Link
                                            href="/admin/dashboard"
                                            onClick={() => setIsProfileOpen(false)}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs text-[#36A886] hover:bg-blue-50 transition-colors font-bold uppercase tracking-wider"
                                        >
                                            <ShieldCheck className="h-4 w-4 text-[#36A886]" />
                                            Switch to Admin Panel
                                        </Link>
                                    ) : (
                                        <Link
                                            href="/owner/dashboard"
                                            onClick={() => setIsProfileOpen(false)}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs text-amber-700 hover:bg-amber-50 transition-colors font-bold uppercase tracking-wider"
                                        >
                                            <Crown className="h-4 w-4 text-amber-600" />
                                            Switch to Owner Panel
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => {
                                            setIsProfileOpen(false);
                                            localStorage.removeItem("admin_token");
                                            localStorage.removeItem("admin_role");
                                            localStorage.removeItem("admin_last_activity");
                                            disconnectWallet();
                                            router.push(loginUrl);
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

                {/* Sidebar */}
                <aside
                    className={cn(
                        "fixed left-0 top-[5rem] z-40 h-[calc(100vh-5rem)] w-70 bg-white/95 border-r border-zinc-200/80 p-4 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 backdrop-blur-md shadow-xs",
                        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                >
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
                                            ? effectiveRole === "owner"
                                                ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                                                : "bg-[#36A886] text-white shadow-md shadow-[#36A886]/20"
                                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    <span className="truncate">{item.name}</span>
                                    {item.ownerOnly && (
                                        <Crown className="w-3.5 h-3.5 text-amber-400 ml-auto shrink-0" />
                                    )}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Bottom Status Card */}
                    <div className="rounded-xl bg-zinc-50/90 border border-zinc-200/80 p-4 mt-4 space-y-2 shrink-0">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            <span>Panel Mode</span>
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                    effectiveRole === "owner"
                                        ? "bg-amber-100 text-amber-800 border-amber-200"
                                        : "bg-blue-100 text-[#36A886] border-blue-200"
                                )}
                            >
                                {effectiveRole === "owner" ? "👑 Owner Panel" : "🛡️ Admin Panel"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                            <span className="text-xs font-medium text-zinc-600">
                                {effectiveRole === "owner" ? "Quorum: 2/3 Multisig" : "Quorum: 3/5 Multisig"}
                            </span>
                            <span
                                className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                                    isConnected && isAuthorized
                                        ? "bg-emerald-100 text-emerald-700"
                                        : isConnected && !isAuthorized
                                            ? "bg-red-100 text-red-700"
                                            : "bg-zinc-200 text-zinc-600"
                                )}
                            >
                                {isConnected ? (isAuthorized ? "Authorized" : "Unauthorized") : "Wallet Pending"}
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
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl sm:text-2xl font-black text-[#001060] uppercase tracking-tight font-manrope">
                                        {navItems.find((item) => item.href === pathname)?.name || "Control Center"}
                                    </h2>
                                    <span
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                            effectiveRole === "owner"
                                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                                : "bg-blue-100 text-[#36A886] border-blue-300"
                                        )}
                                    >
                                        {effectiveRole === "owner" ? "Owner Privilege" : "Admin Operation"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium mt-1">
                                    <Link href={`${panelPrefix}/dashboard`} className="hover:text-zinc-800 transition-colors">
                                        {isOwnerPanel ? "Owner Panel" : "Admin Panel"}
                                    </Link>
                                    <span className="text-[#36A886]">/</span>
                                    <span className="text-[#36A886] font-bold">
                                        {navItems.find((item) => item.href === pathname)?.name || "Control Center"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Guard 1: Connected Wallet Authorization */}
                        {isOwnerPanel && isConnected && !isOwnerWallet ? (
                            /* Guard 1A: Non-owner wallet on /owner */
                            <div className="max-w-xl mx-auto my-12 bg-white border border-amber-200 rounded-[2.5rem] p-8 text-center shadow-xl space-y-6">
                                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                                    <Crown className="w-8 h-8 text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 uppercase tracking-wide">
                                        Owner Privilege Required
                                    </h2>
                                    <p className="text-zinc-600 text-sm mt-2 leading-relaxed">
                                        The connected address <span className="font-mono font-semibold text-zinc-800">{shortenAddress(address || "")}</span> is not registered as a Contract Owner on ICO contract <span className="font-mono text-xs text-[#36A886]">0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC</span>.
                                    </p>
                                    {isAdminWallet && (
                                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-medium">
                                            This wallet is an authorized Contract Admin (3/5 Quorum). You can access all admin features at the Admin Panel.
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowRoleAddresses(!showRoleAddresses)}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 uppercase tracking-wider hover:underline"
                                    >
                                        {showRoleAddresses ? "Hide Authorized Owners" : "View Authorized Owners (2/3 Quorum)"}
                                        <ChevronDown className={cn("w-4 h-4 transition-transform", showRoleAddresses && "rotate-180")} />
                                    </button>

                                    {showRoleAddresses && (
                                        <div className="text-left bg-zinc-50 rounded-2xl p-4 border border-zinc-200 text-xs space-y-2">
                                            <p className="font-bold text-amber-700 uppercase tracking-wider text-[11px] mb-1">
                                                👑 3 Authorized Contract Owners:
                                            </p>
                                            {CONTRACT_OWNERS.map((addr) => (
                                                <p key={addr} className="font-mono text-[11px] text-zinc-600 truncate">
                                                    • {addr}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                                    {isAdminWallet && (
                                        <Link
                                            href="/admin/dashboard"
                                            className="flex-1 py-4 bg-[#36A886] hover:bg-[#2548D0] text-white rounded-2xl font-bold uppercase tracking-wider text-xs shadow-md transition-all active:scale-95 text-center"
                                        >
                                            Open Admin Panel (/admin)
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => disconnectWallet()}
                                        className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold uppercase tracking-wider text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                                    >
                                        Disconnect Wallet
                                    </button>
                                </div>
                            </div>
                        ) : !isOwnerPanel && isConnected && !isAuthorized ? (
                            /* Guard 1B: Unauthorized wallet on /admin */
                            <div className="max-w-xl mx-auto my-12 bg-white border border-red-200 rounded-[2.5rem] p-8 text-center shadow-xl space-y-6">
                                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
                                    <TriangleAlert className="w-8 h-8 text-red-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 uppercase tracking-wide">
                                        Unauthorized Wallet Connected
                                    </h2>
                                    <p className="text-zinc-600 text-sm mt-2 leading-relaxed">
                                        The connected address <span className="font-mono font-semibold text-zinc-800">{shortenAddress(address || "")}</span> is not registered as a Contract Admin or Owner on ICO contract <span className="font-mono text-xs text-[#36A886]">0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC</span>.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowRoleAddresses(!showRoleAddresses)}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#36A886] uppercase tracking-wider hover:underline"
                                    >
                                        {showRoleAddresses ? "Hide Authorized Addresses" : "View Authorized Addresses"}
                                        <ChevronDown className={cn("w-4 h-4 transition-transform", showRoleAddresses && "rotate-180")} />
                                    </button>

                                    {showRoleAddresses && (
                                        <div className="text-left bg-zinc-50 rounded-2xl p-4 border border-zinc-200 text-xs space-y-3">
                                            <div>
                                                <p className="font-bold text-[#36A886] uppercase tracking-wider text-[11px] mb-1">
                                                    🛡️ 5 Contract Admins (3/5 Quorum):
                                                </p>
                                                {CONTRACT_ADMINS.map((addr) => (
                                                    <p key={addr} className="font-mono text-[11px] text-zinc-600 truncate">
                                                        • {addr}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={() => disconnectWallet()}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold uppercase tracking-wider text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                                    >
                                        Disconnect & Switch Wallet
                                    </button>
                                </div>
                            </div>
                        ) : !isConnected ? (
                            /* Guard 2: If no wallet connected, require connecting an authorized wallet */
                            <div className="max-w-xl mx-auto my-12 bg-white border border-zinc-200 rounded-[2.5rem] p-10 text-center shadow-xl space-y-6">
                                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border", isOwnerPanel ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200")}>
                                    {isOwnerPanel ? <Crown className="w-8 h-8 text-amber-600" /> : <Wallet className="w-8 h-8 text-[#36A886]" />}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-[#001060] uppercase tracking-tight">
                                        Wallet Connection Required
                                    </h2>
                                    <p className="text-zinc-600 text-sm mt-2 leading-relaxed">
                                        Please connect an authorized {isOwnerPanel ? "Contract Owner (2/3 Quorum)" : "Contract Admin (3/5 Quorum)"} Web3 wallet to verify your on-chain permissions and access this panel.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <ConnectButton.Custom>
                                        {({ openConnectModal }) => (
                                            <button
                                                onClick={openConnectModal}
                                                className={cn(
                                                    "w-full py-4 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg transition-all active:scale-95 cursor-pointer",
                                                    isOwnerPanel
                                                        ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                                                        : "bg-[#36A886] hover:bg-[#2548D0] shadow-[#36A886]/20"
                                                )}
                                            >
                                                Connect Authorized {isOwnerPanel ? "Owner" : "Admin"} Wallet
                                            </button>
                                        )}
                                    </ConnectButton.Custom>

                                    <button
                                        onClick={() => setShowRoleAddresses(!showRoleAddresses)}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-800"
                                    >
                                        {showRoleAddresses ? "Hide Authorized Addresses" : "View Authorized Addresses"}
                                        <ChevronDown className={cn("w-4 h-4 transition-transform", showRoleAddresses && "rotate-180")} />
                                    </button>

                                    {showRoleAddresses && (
                                        <div className="text-left bg-zinc-50 rounded-2xl p-4 border border-zinc-200 text-xs space-y-3">
                                            {isOwnerPanel ? (
                                                <div>
                                                    <p className="font-bold text-amber-700 uppercase tracking-wider text-[11px] mb-1">
                                                        👑 3 Contract Owners (2/3 Quorum):
                                                    </p>
                                                    {CONTRACT_OWNERS.map((addr) => (
                                                        <p key={addr} className="font-mono text-[11px] text-zinc-600 truncate">
                                                            • {addr}
                                                        </p>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="font-bold text-[#36A886] uppercase tracking-wider text-[11px] mb-1">
                                                        🛡️ 5 Contract Admins (3/5 Quorum):
                                                    </p>
                                                    {CONTRACT_ADMINS.map((addr) => (
                                                        <p key={addr} className="font-mono text-[11px] text-zinc-600 truncate">
                                                            • {addr}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : isCurrentRouteOwnerOnly && !isOwnerPanel ? (
                            /* Guard 3: Attempting to visit Owner-only route under /admin */
                            <div className="max-w-xl mx-auto my-12 bg-white border border-amber-200 rounded-[2.5rem] p-8 text-center shadow-xl space-y-6">
                                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                                    <Crown className="w-8 h-8 text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 uppercase tracking-wide">
                                        Restricted to Owner Panel
                                    </h2>
                                    <p className="text-zinc-600 text-sm mt-2 leading-relaxed">
                                        Treasury withdrawals and master credentials are strictly restricted to the <strong>Owner Panel</strong> (requires 2 of 3 Owner signatures on ICO contract <span className="font-mono text-xs text-[#36A886]">0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC</span>).
                                    </p>
                                    <p className="text-zinc-500 text-xs mt-2">
                                        Admins have operational rights over token pricing, sales, vesting, pause states, and base coins, but cannot recover funds or modify master security credentials.
                                    </p>
                                </div>

                                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                                    <Link
                                        href="/owner/withdraw"
                                        className="flex-1 py-3 px-4 rounded-2xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider shadow-md hover:bg-amber-700 transition-all text-center"
                                    >
                                        Go to Owner Panel (/owner)
                                    </Link>
                                    <Link
                                        href="/admin/dashboard"
                                        className="flex-1 py-3 px-4 rounded-2xl bg-[#36A886] text-white text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#2548D0] transition-all text-center"
                                    >
                                        Return to Admin Dashboard
                                    </Link>
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
