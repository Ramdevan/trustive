import Link from "next/link";
import Image from "next/image";
import { Crown, ShieldCheck, ArrowRight, Wallet, CheckCircle2, Lock } from "lucide-react";

export default function RootPortal() {
    return (
        <div className="min-h-screen bg-[#F4F4F6] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-4xl relative z-10 space-y-8 text-center">
                {/* Brand */}
                <div className="space-y-3">
                    <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                        <Image
                            src="/logo.svg"
                            alt="Trustive Logo"
                            width={160}
                            height={42}
                            className="object-contain"
                            priority
                        />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-[#001060] tracking-tight uppercase font-manrope">
                        Governance & Management Portals
                    </h1>
                    <p className="text-zinc-500 text-sm font-medium max-w-xl mx-auto">
                        ICO Smart Contract <span className="font-mono text-xs text-[#36A886] font-bold">0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC</span> on BSC Testnet
                    </p>
                </div>

                {/* 2 Portal Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                    {/* Owner Panel Card */}
                    <div className="bg-white rounded-[32px] border-2 border-amber-300/80 p-8 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative group hover:border-amber-500">
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm group-hover:scale-105 transition-transform">
                                    <Crown className="w-7 h-7 text-amber-600" />
                                </div>
                                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-widest border border-amber-300">
                                    2 of 3 Quorum
                                </span>
                            </div>

                            <div>
                                <h2 className="text-2xl font-black text-[#001060] tracking-tight uppercase font-manrope flex items-center gap-2">
                                    Owner Panel
                                </h2>
                                <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-0.5">
                                    Full Governance & Treasury Control
                                </p>
                            </div>

                            <p className="text-zinc-600 text-xs leading-relaxed">
                                Complete administrative authority. Propose and execute treasury withdrawals, replace contract owners, update master credentials, and oversee platform parameters.
                            </p>

                            <div className="space-y-2 pt-2 border-t border-zinc-100 text-xs">
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Treasury Token & BNB Recovery</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Owner Multi-Sig Proposals (2/3 Quorum)</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Master Credentials & 2FA Setup</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>All Admin Operational Features Included</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8">
                            <Link
                                href="/owner/dashboard"
                                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 group-hover:gap-3 cursor-pointer"
                            >
                                <span>Launch Owner Panel</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <p className="text-center text-[10px] text-zinc-400 font-mono mt-2">
                                http://localhost:3001/owner
                            </p>
                        </div>
                    </div>

                    {/* Admin Panel Card */}
                    <div className="bg-white rounded-[32px] border-2 border-blue-200/80 p-8 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative group hover:border-[#36A886]">
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#36A886] shadow-sm group-hover:scale-105 transition-transform">
                                    <ShieldCheck className="w-7 h-7 text-[#36A886]" />
                                </div>
                                <span className="px-3 py-1 rounded-full bg-blue-100 text-[#36A886] text-[10px] font-bold uppercase tracking-widest border border-blue-200">
                                    3 of 5 Quorum
                                </span>
                            </div>

                            <div>
                                <h2 className="text-2xl font-black text-[#001060] tracking-tight uppercase font-manrope flex items-center gap-2">
                                    Admin Panel
                                </h2>
                                <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-0.5">
                                    Platform Operations & Sales
                                </p>
                            </div>

                            <p className="text-zinc-600 text-xs leading-relaxed">
                                Day-to-day operations and sales management. Propose price changes, emergency pause or resume token sales, monitor vestings, manage base coins, and review user accounts.
                            </p>

                            <div className="space-y-2 pt-2 border-t border-zinc-100 text-xs">
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-[#36A886] shrink-0" />
                                    <span>Emergency Pause & Resume Sales</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-[#36A886] shrink-0" />
                                    <span>Token Price Multi-Sig (3/5 Quorum)</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-700 font-medium">
                                    <CheckCircle2 className="w-4 h-4 text-[#36A886] shrink-0" />
                                    <span>Sales Rounds, Base Coins & Vestings</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400 font-medium line-through">
                                    <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                                    <span>Treasury Fund Withdrawals (Restricted)</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8">
                            <Link
                                href="/admin/dashboard"
                                className="w-full py-4 bg-[#36A886] hover:bg-[#2548D0] text-white rounded-2xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-[#36A886]/20 transition-all flex items-center justify-center gap-2 group-hover:gap-3 cursor-pointer"
                            >
                                <span>Launch Admin Panel</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <p className="text-center text-[10px] text-zinc-400 font-mono mt-2">
                                http://localhost:3001/admin
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-zinc-400 text-xs uppercase tracking-widest font-semibold pt-4">
                    Trustive Multi-Signature Architecture • BSC Testnet (Chain ID 97)
                </p>
            </div>
        </div>
    );
}
