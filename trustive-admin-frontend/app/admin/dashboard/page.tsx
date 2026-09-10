"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
    Users,
    Coins,
    Banknote,
    ArrowUpRight,
    Package,
    Lock,
    Clock,
    CheckCircle2,
    ShieldCheck,
    Sparkles,
    History
} from "lucide-react";
import { cn, formatDecimal, formatUSD, shortenAddress } from "@/lib/utils";
import { CryptoIcon } from "@/components/CryptoIcon";
import { CopyButton } from "@/components/CopyButton";

function AutoScalingText({ children }: { children: React.ReactNode }) {
    const containerRef = typeof window !== "undefined" ? window.document.createElement("div") : null;
    const [scale, setScale] = useState(1);
    const textRef = useRef<HTMLHeadingElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const resize = () => {
            if (wrapRef.current && textRef.current) {
                const parentWidth = wrapRef.current.clientWidth;
                const textWidth = textRef.current.scrollWidth;
                if (textWidth > parentWidth) {
                    setScale(parentWidth / textWidth);
                } else {
                    setScale(1);
                }
            }
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [children]);

    return (
        <div ref={wrapRef} className="w-full overflow-hidden flex items-center h-[34px] mb-3">
            <h3
                ref={textRef}
                className="text-[28px] font-bold text-white tracking-tight whitespace-nowrap origin-left"
                style={{ transform: `scale(${scale})` }}
            >
                {children}
            </h3>
        </div>
    );
}

import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { apiRequest } from "@/lib/api-client";
import TxHashLink from "@/components/TxHashLink";

export default function Dashboard() {
    // Fetch Dashboard Data
    const { data: dashboardData, isLoading: loading } = useQuery({
        queryKey: ["dashboard"],
        queryFn: () => apiRequest("/dashboard"),
        refetchInterval: 15000,
    });

    const stats = dashboardData?.stats || null;
    const activeSale = dashboardData?.activeSale || null;
    const lastTx = dashboardData?.lastTransactions || [];
    const errorMsg = null;

    const tokenAddress = (dashboardData?.settings?.contract_address || "0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D") as `0x${string}`;
    const icoAddress = (dashboardData?.settings?.ico_contract || "0x8Ab0caB366B23Dcb88ceA447312CCb103B138cFa") as `0x${string}`;

    // Read live on-chain token balance of the ICO smart contract
    const { data: onChainICOBalanceWei } = useReadContract({
        address: tokenAddress,
        abi: [
            {
                inputs: [{ internalType: "address", name: "account", type: "address" }],
                name: "balanceOf",
                outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                stateMutability: "view",
                type: "function"
            }
        ] as const,
        functionName: "balanceOf",
        args: [icoAddress],
        query: {
            enabled: Boolean(tokenAddress && icoAddress),
            refetchInterval: 10000,
        }
    });

    const onChainICOBalance = onChainICOBalanceWei !== undefined && onChainICOBalanceWei !== null
        ? parseFloat(formatUnits(onChainICOBalanceWei, 18))
        : null;

    const remainingTokens = (onChainICOBalance !== null && onChainICOBalance > 0)
        ? onChainICOBalance
        : (Number(stats?.total_ico_remaining || 0));

    const statCards = [
        { topLabel: "Tokens Remaining", bottomLabel: "Trustive ICO Balance", value: `${formatDecimal(remainingTokens, 5)} Trustive`, icon: Package, link: "/admin/sales" },
        { topLabel: "Tokens in Vesting", bottomLabel: "Vesting Balance", value: `${formatDecimal(stats?.tokens_in_vesting || 0, 5)} Trustive`, icon: ShieldCheck, link: "/admin/vesting" },
        { topLabel: "Total Tokens Earned", bottomLabel: "Staking Balance", value: `${formatDecimal(stats?.total_rewards_distributed || 0, 5)} Trustive`, icon: Coins, link: "/admin/staking-transactions" },
        { topLabel: "Sale Status", bottomLabel: activeSale?.computed_status === "active" ? "SALE IS LIVE" : activeSale?.computed_status === "scheduled" ? "SCHEDULED" : activeSale?.name ? "PHASE ENDED" : "INACTIVE", value: activeSale?.name || "No Sale", icon: Sparkles, link: "/admin/sales" },
        { topLabel: "No of Sold Token", bottomLabel: "Allotted / Sold Trustive", value: `${formatDecimal(stats?.purchased_tokens || 0, 5)} Trustive`, icon: Sparkles, link: "/admin/sales" },
        { topLabel: "No. of Users", bottomLabel: "Registered Sign-ups", value: formatDecimal(stats?.total_users || 0, 0), icon: Users, link: "/admin/users" },
    ].filter(Boolean);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <p className="text-red-500 font-bold">Error: {errorMsg}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {statCards.map((stat, i) => (
                    <Link key={i} href={stat.link} className="bg-[#0A0908] p-8 rounded-[24px] border border-white/5 hover:border-accent/30 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all group relative flex flex-col justify-between min-h-[160px] shadow-2xl">
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-extrabold text-zinc-500 tracking-[0.2em] uppercase border-b border-zinc-800 pb-1">
                                {stat.topLabel}
                            </span>
                            <div className="w-10 h-10 rounded-[12px] bg-white/[0.02] border border-white/5 flex items-center justify-center text-accent/80 group-hover:text-accent transition-colors">
                                <stat.icon className="w-4 h-4" />
                            </div>
                        </div>

                        <div className="mt-4 overflow-hidden">
                            <AutoScalingText>{stat.value}</AutoScalingText>
                            <div className="flex items-center gap-2">
                                <div className="flex -space-x-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#E5B258]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#E5B258]/40" />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.15em]">
                                    {stat.bottomLabel}
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Table Section */}
            <div className="bg-sidebar rounded-[32px] border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                <div className="px-8 py-6 flex items-center justify-between">
                    <h3 className="text-white font-bold text-lg tracking-tight">Recent Transactions</h3>
                    <a href="/admin/transactions" className="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl text-zinc-400 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2">
                        View All <ArrowUpRight className="w-3 h-3" />
                    </a>
                </div>

                <div className="overflow-x-auto">
                    {lastTx.length === 0 ? (
                        <p className="text-center text-zinc-600 py-12 text-sm">No transactions yet</p>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-accent text-black uppercase font-black text-xs tracking-widest">
                                    <th className="px-12 py-8 text-center first:rounded-tl-2xl">ID</th>
                                    <th className="px-10 py-8 text-center">User</th>
                                    <th className="px-10 py-8 text-center">Transaction Hash</th>
                                    <th className="px-10 py-8 text-center">Payment</th>
                                    <th className="px-10 py-8 text-center">Trustive Purchased</th>
                                    <th className="px-10 py-8 text-center">Value (USD)</th>
                                    <th className="px-12 py-8 text-center last:rounded-tr-2xl">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-[#0A0908]">
                                {lastTx.map((tx: any, i: number) => (
                                    <tr key={tx.id ?? i} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-12 py-8 text-zinc-500 text-sm font-bold text-center">{i + 1}</td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col items-center justify-center">
                                                <span className="text-zinc-300 font-bold text-sm">{tx.username || (tx.address ? shortenAddress(tx.address) : "Anonymous")}</span>
                                                {tx.address && (
                                                    <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500 font-mono">
                                                        <span>{shortenAddress(tx.address)}</span>
                                                        <CopyButton text={tx.address} label="Copy Address" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex justify-center">
                                                <TxHashLink hash={tx.trans_hash} />
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center justify-center gap-3">
                                                <CryptoIcon coin={tx.payment_type} className="w-5 h-5" />
                                                <span className="text-zinc-200 text-sm font-bold uppercase">{tx.payment_type}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-accent font-bold text-base tracking-tight">{formatDecimal(tx.ptc_tokens, 5)}</span>
                                                <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">Trustive Tokens</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-center">
                                            <span className="text-white font-bold text-base">{formatUSD(tx.usd_value_of_crypto)}</span>
                                        </td>
                                        <td className="px-12 py-8 text-center">
                                            <span className="text-zinc-400 text-sm font-bold">
                                                {tx.created_at_utc ? new Date(tx.created_at_utc).toLocaleDateString("en-GB") : "—"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
