import { cn } from "@/lib/utils";

const shortenHash = (hash: string) => `${hash.slice(0, 8)}...${hash.slice(-6)}`;

const isOnChainHash = (hash?: string | null): hash is string =>
    !!hash && hash.startsWith("0x") && hash.length >= 64;

interface TxHashLinkProps {
    hash?: string | null;
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
            href={`https://testnet.bscscan.com/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            title={hash}
            className={cn("font-mono text-sm text-amber-600 hover:underline", className)}
        >
            {shortenHash(hash)}
        </a>
    );
}
