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

/**
 * Translates technical blockchain/API errors into user-friendly messages.
 */
export function getFriendlyErrorMessage(error: any): string {
    if (!error) return "An unknown error occurred";

    // Handle user rejection (Metamask/WalletConnect code 4001)
    if (
        error.code === 4001 ||
        error.message?.toLowerCase().includes("user rejected") ||
        error.message?.toLowerCase().includes("user denied") ||
        (error.action === "sendTransaction" && error.reason === "rejected")
    ) {
        return "Transaction rejected by user";
    }

    // Handle common RPC/Network issues
    if (error.message?.toLowerCase().includes("insufficient funds")) {
        return "Insufficient funds for transaction";
    }

    // Return reason if available (common in ethers)
    if (error.reason) return error.reason;

    // Clean up long ethers strings
    if (error.message) {
        if (error.message.includes("action=\"sendTransaction\"")) {
            if (error.message.includes("reason=\"rejected\"")) return "Transaction rejected by user";
            return "Transaction failed during submission";
        }
        return error.message.split(' (action=')[0];
    }

    return typeof error === 'string' ? error : "An error occurred";
}

/**
 * Formats numeric values with thousand separators and up to 5 decimal places by default.
 */
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

/**
 * Formats a value for input fields (no thousand commas, trimmed trailing zeros up to 5 decimals).
 */
export function formatInputDecimal(
    val: number | string | null | undefined,
    maxDecimals = 5
): string {
    if (val === null || val === undefined || val === "") return "";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "";
    return parseFloat(num.toFixed(maxDecimals)).toString();
}

/**
 * Formats a currency value in USD with up to 5 decimals (minimum 2 decimals).
 */
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

