import { useRouter } from "next/router";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWeb3 } from "@/context/Web3Context";
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
    const router = useRouter();
    const pathname = router.pathname || router.asPath.split("?")[0];
    const isOwnerPanel = pathname.startsWith("/owner");
    const isAdminPanel = pathname.startsWith("/admin");
    const isLoginPage =
        pathname === "/admin/login" ||
        pathname === "/owner/login" ||
        (!isOwnerPanel && !isAdminPanel);

    if (isLoginPage) {
        return <>{children}</>;
    }

    return <AdminDashboardLayout>{children}</AdminDashboardLayout>;
}

function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = router.pathname || router.asPath.split("?")[0];
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
    const [adminName, setAdminName] = useState<string>("");
    const [adminEmail, setAdminEmail] = useState<string>("");
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    // Effective role: strictly reflects panel prefix
    const effectiveRole: AdminRole = isOwnerPanel ? "owner" : "admin";

    useEffect(() => {
        if (typeof window !== "undefined") {
            setAdminName(localStorage.getItem("admin_name") || "");
            setAdminEmail(localStorage.getItem("admin_email") || "");
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
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
                    if (data.name) {
                        setAdminName(data.name);
                        localStorage.setItem("admin_name", data.name);
                    }
                    if (data.email) {
                        setAdminEmail(data.email);
                        localStorage.setItem("admin_email", data.email);
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
                            "w-full py-4 text-white font-bold text-sm uppercase rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer",
                            isOwnerPanel
                                ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                                : "bg-[#36A886] hover:bg-[#36A886] shadow-[#36A886]/20"
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
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="lg:hidden p-2 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer rounded-lg hover:bg-zinc-100"
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>

                    <Link href={`${panelPrefix}/dashboard`} className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
                        <Image
                            src="/logo.svg"
                            alt="Trustive Logo"
                            width={140}
                            height={38}
                            className="object-contain w-32 sm:w-36"
                            priority
                        />
                        <span
                            className={cn(
                                "hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-xs",
                                effectiveRole === "owner"
                                    ? "bg-amber-50 text-amber-700 border-amber-300/80"
                                    : "bg-blue-50 text-[#36A886] border-blue-200/80"
                            )}
                        >
                            {effectiveRole === "owner" ? (
                                <>
                                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                                    Owner Panel (2/3 Quorum)
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-3.5 h-3.5 text-[#36A886]" />
                                    Admin Panel (3/5 Quorum)
                                </>
                            )}
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Public Presale link */}
                    <Link
                        href="/dashboard"
                        className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                    >
                        <span>User Presale App</span>
                    </Link>

                    {/* Web3 Wallet Connect Button */}
                    <div className="wallet-connect-wrapper">
                        <ConnectButton.Custom>
                            {({
                                account,
                                chain,
                                openAccountModal,
                                openChainModal,
                                openConnectModal,
                                mounted: rainbowMounted,
                            }) => {
                                const ready = rainbowMounted;
                                const connected = ready && account && chain;

                                return (
                                    <div
                                        {...(!ready && {
                                            "aria-hidden": true,
                                            style: {
                                                opacity: 0,
                                                pointerEvents: "none",
                                                userSelect: "none",
                                            },
                                        })}
                                    >
                                        {(() => {
                                            if (!connected) {
                                                return (
                                                    <button
                                                        onClick={openConnectModal}
                                                        type="button"
                                                        className={cn(
                                                            "cursor-pointer flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all active:scale-95",
                                                            effectiveRole === "owner"
                                                                ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                                                                : "bg-[#36A886] hover:bg-[#36A886] shadow-[#36A886]/20"
                                                        )}
                                                    >
                                                        <Wallet className="h-4 w-4" />
                                                        <span className="hidden sm:inline">Connect Signer</span>
                                                        <span className="sm:hidden">Connect</span>
                                                    </button>
                                                );
                                            }

                                            if (chain.unsupported) {
                                                return (
                                                    <button
                                                        onClick={openChainModal}
                                                        type="button"
                                                        className="cursor-pointer flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 shadow-md transition-all active:scale-95"
                                                    >
                                                        <TriangleAlert className="h-4 w-4" />
                                                        <span>Wrong Network</span>
                                                    </button>
                                                );
                                            }

                                            return (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={openAccountModal}
                                                        type="button"
                                                        className="cursor-pointer flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold tracking-wider text-zinc-900 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 transition-all active:scale-95"
                                                    >
                                                        <span
                                                            className={cn(
                                                                "h-2 w-2 rounded-full shrink-0",
                                                                isAuthorized ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                                                            )}
                                                        />
                                                        <span className="font-mono text-xs">{account.displayName}</span>
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            }}
                        </ConnectButton.Custom>
                    </div>

                    {/* User Profile Dropdown */}
                    <div className="relative" ref={profileDropdownRef}>
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className={cn(
                                "cursor-pointer flex items-center gap-2 rounded-2xl p-1.5 sm:px-3 sm:py-2 text-sm font-semibold transition-all border",
                                isProfileOpen
                                    ? "bg-zinc-100 border-zinc-300"
                                    : "border-zinc-200/80 hover:bg-zinc-50"
                            )}
                        >
                            <div
                                className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-xl font-black text-xs uppercase shadow-xs",
                                    effectiveRole === "owner"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-blue-100 text-[#36A886]"
                                )}
                            >
                                {effectiveRole === "owner" ? <Crown className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                            </div>
                            <span className="hidden sm:inline-block capitalize text-zinc-800 text-xs font-bold uppercase tracking-wider">
                                {effectiveRole}
                            </span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-400 transition-transform", isProfileOpen && "rotate-180")} />
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-zinc-200/80 p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-4 py-3 border-b border-zinc-100 mb-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider truncate pr-2">
                                            {adminName || (effectiveRole === "owner" ? "Owner Account" : "Admin Account")}
                                        </p>
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0",
                                                effectiveRole === "owner"
                                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                                    : "bg-blue-100 text-[#36A886] border-blue-200"
                                            )}
                                        >
                                            {effectiveRole === "owner" ? "2/3 Owner" : "3/5 Admin"}
                                        </span>
                                    </div>
                                    {adminEmail && (
                                        <p className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
                                            {adminEmail}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-zinc-400 font-semibold tracking-wider mt-1">
                                        {effectiveRole === "owner" ? "Quorum: 2 of 3 Owners" : "Quorum: 3 of 5 Admins"}
                                    </p>
                                    {address && (
                                        <p className="text-[11px] font-mono text-zinc-600 truncate mt-2 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-200/80">
                                            Signer: {shortenAddress(address)}
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
                                    <Link
                                        href="/portal"
                                        onClick={() => setIsProfileOpen(false)}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs text-zinc-600 hover:bg-zinc-50 transition-colors font-semibold"
                                    >
                                        <LayoutDashboard className="h-4 w-4 text-zinc-500" />
                                        Portal Gateway
                                    </Link>
                                    <button
                                        onClick={() => {
                                            setIsProfileOpen(false);
                                            localStorage.removeItem("admin_token");
                                            localStorage.removeItem("admin_role");
                                            localStorage.removeItem("admin_last_activity");
                                            disconnectWallet();
                                            router.push(loginUrl);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs text-red-600 hover:bg-red-50 transition-colors group cursor-pointer font-bold uppercase tracking-wider"
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
                                    className={cn(
                                        "cursor-pointer flex items-center gap-3 rounded-xl px-4 py-3 text-[1rem] font-medium transition-all",
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
                        {isCurrentRouteOwnerOnly && !isOwnerPanel ? (
                            /* Guard: Attempting to visit Owner-only route under /admin */
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
                                        className="flex-1 py-3 px-4 rounded-2xl bg-[#36A886] text-white text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#36A886] transition-all text-center"
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
