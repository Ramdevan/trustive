/**
 * Translates technical blockchain/API errors into user-friendly messages.
 */
// A wallet rejection is the user changing their mind, not a failure. ethers v6
// reports it as ACTION_REJECTED and keeps the provider's own 4001 in `info`,
// while raw injected providers still throw a bare 4001.
export function isUserRejection(error: any): boolean {
    if (!error) return false;
    const message = String(error.message ?? "").toLowerCase();
    return (
        error.code === 4001 ||
        error.code === "ACTION_REJECTED" ||
        error.info?.error?.code === 4001 ||
        error.error?.code === 4001 ||
        (error.action === "sendTransaction" && error.reason === "rejected") ||
        message.includes("user rejected") ||
        message.includes("user denied")
    );
}

export function getFriendlyErrorMessage(error: any): string {
    if (!error) return "An unknown error occurred";

    if (isUserRejection(error)) {
        return "Transaction cancelled";
    }

    // Handle common RPC/Network issues
    if (error.message?.toLowerCase().includes("insufficient funds")) {
        return "Insufficient funds for transaction";
    }

    if (error.message?.toLowerCase().includes("nonce too low")) {
        return "Transaction nonce too low. Please reset your account or wait for previous transactions.";
    }

    // Return reason if available (common in ethers)
    if (error.reason) return error.reason;

    // Clean up long ethers strings
    if (error.message) {
        // If it's a long technical string with JSON, take the first part
        if (error.message.includes("action=\"sendTransaction\"")) {
            if (error.message.includes("reason=\"rejected\"")) return "Transaction cancelled";
            return "Transaction failed during submission";
        }
        return error.message.split(' (action=')[0];
    }

    return typeof error === 'string' ? error : "An error occurred. Please try again.";
}
