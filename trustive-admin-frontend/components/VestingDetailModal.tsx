"use client";

import { X } from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import { CopyButton } from "@/components/CopyButton";
import TxHashLink from "@/components/TxHashLink";

/** 1 contract unit = 2 real minutes */
export const PERIOD_SECONDS = 120;

export interface VestingClaim {
    period_index: number;
    amount: string;
    tx_hash: string;
    created_at?: string;
}

export interface VestingRecord {
    id: number;
    username?: string;
    beneficiary: string;
    total_amount: string;
    cliff_months: number;
    vesting_months: number;
    start_at: string;
    tx_hash: string;
    vesting_index: number;
    display_status: string;
    claims?: VestingClaim[];
    details?: {
        totalAmount: string;
        claimedAmount: string;
        claimableNow: string;
        remainingToClaim: string;
        cliffMonths?: string;
        vestingMonths?: string;
        claimedPeriods?: string | null;
        unlockedPeriods?: string | null;
        claimablePeriods?: string | null;
    };
}

export const formatVestId = (v: VestingRecord) =>
    `VEST${String((v.vesting_index ?? 0) + 1).padStart(3, "0")}`;

export const statusLabel = (status?: string) => {
    switch (status) {
        case "claimed": return "Completed";
        case "claimable": return "Claimable";
        case "successful": return "Claimable";
        case "revoked": return "Revoked";
        case "cliff": return "In-Progress";
        default: return "In-Progress";
    }
};

export const statusClasses = (status?: string) =>
    cn(
        "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
        status === "claimable" || status === "successful"
            ? "bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
            : status === "claimed"
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                : status === "revoked"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : status === "cliff"
                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        : "bg-zinc-800 text-zinc-500 border-zinc-700/30"
    );

const formatDateTime = (date: Date) => {
    try {
        return date.toLocaleString("en-GB", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch { return "—"; }
};

interface Props {
    vesting: VestingRecord;
    onClose: () => void;
}

export default function VestingDetailModal({ vesting, onClose }: Props) {
    const totalAmount = Number(vesting.details?.totalAmount ?? vesting.total_amount) || 0;
    const claimedAmount = Number(vesting.details?.claimedAmount ?? 0) || 0;
    const cliffPeriods = Number(vesting.details?.cliffMonths ?? vesting.cliff_months) || 0;
    const vestPeriods = Number(vesting.details?.vestingMonths ?? vesting.vesting_months) || 0;

    // The contract counts released periods; only derive it if that call failed
    const claimedPeriods = vesting.details?.claimedPeriods != null
        ? Number(vesting.details.claimedPeriods)
        : (totalAmount > 0 && vestPeriods > 0
            ? Math.min(vestPeriods, Math.round(claimedAmount / (totalAmount / vestPeriods)))
            : 0);

    const startMs = new Date(vesting.start_at).getTime();
    const perPeriod = vestPeriods > 0 ? totalAmount / vestPeriods : 0;
    const claimMap = new Map((vesting.claims || []).map(c => [Number(c.period_index), c.tx_hash]));
    const now = Date.now();

    const rows = Array.from({ length: vestPeriods }, (_, i) => {
        const period = i + 1;
        const unlockSeconds = (cliffPeriods + period) * PERIOD_SECONDS;
        const unlockAt = new Date(startMs + unlockSeconds * 1000);
        const state: "claimed" | "unlocked" | "locked" =
            period <= claimedPeriods ? "claimed" : unlockAt.getTime() <= now ? "unlocked" : "locked";
        return { period, amount: perPeriod, unlockSeconds, unlockAt, state, txHash: claimMap.get(period) };
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[32px] bg-white border border-zinc-200 p-8 space-y-8 shadow-2xl">

                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold text-zinc-900 uppercase tracking-tight font-space-grotesk">Vesting Details</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Summary */}
                <div className="rounded-[24px] bg-zinc-50 border border-zinc-200 p-6 grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Vest ID</div>
                        <div className="text-zinc-900 font-bold text-base">{formatVestId(vesting)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Status</div>
                        <span className={statusClasses(vesting.display_status)}>{statusLabel(vesting.display_status)}</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Allocated Token</div>
                        <div className="text-[#212E73] font-bold text-base">
                            {totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} Trustive
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Cliff</div>
                        <div className="text-zinc-900 font-bold text-base">{cliffPeriods}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Vest Period</div>
                        <div className="text-zinc-900 font-bold text-base">{vestPeriods}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Claimed</div>
                        <div className="text-emerald-600 font-bold text-base">
                            {claimedAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} Trustive
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-3 pt-3 border-t border-zinc-200">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Beneficiary</div>
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-900 font-bold text-sm">{vesting.username || "—"}</span>
                            <span className="text-xs text-zinc-500 font-mono">{shortenAddress(vesting.beneficiary)}</span>
                            <CopyButton text={vesting.beneficiary} label="Copy Beneficiary" />
                        </div>
                    </div>
                </div>

                {/* Period breakdown */}
                <div className="rounded-[24px] border border-zinc-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse min-w-[44rem]">
                            <thead>
                                <tr className="bg-[#212E73] text-white">
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em]">S.No</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em]">Claimable Token</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em]">Cliff Period</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em]">Status</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em]">Tx Hash</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-white">
                                {rows.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-16 text-center text-zinc-500 font-medium italic">No vesting periods found</td></tr>
                                ) : rows.map(row => (
                                    <tr key={row.period} className="hover:bg-zinc-50/70 transition-colors">
                                        <td className="px-6 py-4 text-center text-zinc-900 font-bold">{row.period}</td>
                                        <td className="px-6 py-4 text-center text-emerald-600 font-bold">
                                            {row.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} Trustive
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-zinc-900 font-bold text-sm">{row.unlockSeconds}s</span>
                                                <span className="text-[10px] text-zinc-500 mt-0.5">{formatDateTime(row.unlockAt)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                                                row.state === "claimed" ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                                                    : row.state === "unlocked" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        : "bg-zinc-100 text-zinc-500 border-zinc-200"
                                            )}>
                                                {row.state === "claimed" ? "Claimed" : row.state === "unlocked" ? "Unlocked" : "Locked"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <TxHashLink hash={row.txHash} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-[11px] text-zinc-500 font-medium">
                    Periods unlock in order. Beneficiaries claim from the user panel — this view is read-only.
                </p>
            </div>
        </div>
    );
}
