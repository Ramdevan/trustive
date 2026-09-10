"use client";

import { cn } from "@/lib/utils";

/**
 * Single rendering for every transaction hash in the admin panel, matching the
 * user panel: truncated monospace hash in the accent colour, linking to
 * Etherscan, full hash in the tooltip.
 */
const shortenHash = (hash: string) => `${hash.slice(0, 8)}...${hash.slice(-6)}`;

const isOnChainHash = (hash?: string | null): hash is string =>
    !!hash && hash.startsWith("0x") && hash.length >= 64;

interface TxHashLinkProps {
    hash?: string | null;
    /** Shown when there is no usable hash. */
    fallback?: string;
    className?: string;
}

export default function TxHashLink({ hash, fallback = "—", className }: TxHashLinkProps) {
    if (!isOnChainHash(hash)) {
        return (
            <span
                className="font-mono text-xs text-zinc-600"
                title={hash || "No transaction hash"}
            >
                {hash ? "Synced" : fallback}
            </span>
        );
    }

    return (
        <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            title={hash}
            className={cn("font-mono text-sm text-accent hover:underline", className)}
        >
            {shortenHash(hash)}
        </a>
    );
}
