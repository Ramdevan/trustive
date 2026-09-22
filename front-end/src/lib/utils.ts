import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function shortenAddress(address: string) {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export async function copyToClipboard(text: string) {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error("Failed to copy:", err);
        return false;
    }
}

export function formatDate(date: string | Date) {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function getFriendlyErrorMessage(error: any): string {
    if (!error) return "An unknown error occurred";

    if (
        error.code === 4001 ||
        error.message?.toLowerCase().includes("user rejected") ||
        error.message?.toLowerCase().includes("user denied") ||
        (error.action === "sendTransaction" && error.reason === "rejected")
    ) {
        return "Transaction rejected by user";
    }

    if (error.message?.toLowerCase().includes("insufficient funds")) {
        return "Insufficient funds for transaction";
    }

    if (error.reason) return error.reason;

    if (error.message) {
        if (error.message.includes("action=\"sendTransaction\"")) {
            if (error.message.includes("reason=\"rejected\"")) return "Transaction rejected by user";
            return "Transaction failed during submission";
        }
        return error.message.split(' (action=')[0];
    }

    return typeof error === 'string' ? error : "An error occurred";
}

export function formatDecimal(
    val: number | string | null | undefined,
    maxDecimals = 5,
    minDecimals = 0
): string {
    if (val === null || val === undefined || val === "") return "0";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-US", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    });
}

export function formatInputDecimal(
    val: number | string | null | undefined,
    maxDecimals = 5
): string {
    if (val === null || val === undefined || val === "") return "";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "";
    return parseFloat(num.toFixed(maxDecimals)).toString();
}

export function formatUSD(
    val: number | string | null | undefined,
    maxDecimals = 5,
    minDecimals = 2
): string {
    if (val === null || val === undefined || val === "" || isNaN(Number(val))) return "—";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "—";
    return `$${num.toLocaleString("en-US", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    })}`;
}
