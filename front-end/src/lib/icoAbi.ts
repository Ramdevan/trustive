export const ICO_CONTRACT_ADDRESS = "0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC";

export const ICO_ABI = [
    // Views & Constants
    { "inputs": [], "name": "ADMIN_COUNT", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "ADMIN_THRESHOLD", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "OWNER_COUNT", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "OWNER_THRESHOLD", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "PROPOSAL_TTL", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getOwners", "outputs": [{ "internalType": "address[3]", "name": "", "type": "address[3]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getAdmins", "outputs": [{ "internalType": "address[5]", "name": "", "type": "address[5]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "isOwner", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "isAdmin", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "paused", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "signer", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "tokenAddress", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "tokenAmountPerUSD", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "priceStaleThreshold", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "paymentDetails", "outputs": [{ "internalType": "string", "name": "paymentName", "type": "string" }, { "internalType": "address", "name": "priceFetchContract", "type": "address" }, { "internalType": "address", "name": "paymentTokenAddress", "type": "address" }, { "internalType": "uint256", "name": "decimal", "type": "uint256" }, { "internalType": "bool", "name": "status", "type": "bool" }, { "internalType": "uint256", "name": "minPrice", "type": "uint256" }, { "internalType": "uint256", "name": "maxPrice", "type": "uint256" }, { "internalType": "uint256", "name": "staleThreshold", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    
    // Proposal Queries
    { "inputs": [], "name": "proposalCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "proposalRole", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "isExecutable", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }, { "internalType": "address", "name": "member", "type": "address" }], "name": "hasConfirmed", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "getProposalMeta", "outputs": [{ "components": [{ "internalType": "uint8", "name": "role", "type": "uint8" }, { "internalType": "uint8", "name": "confirmations", "type": "uint8" }, { "internalType": "bool", "name": "executed", "type": "bool" }, { "internalType": "bool", "name": "cancelled", "type": "bool" }, { "internalType": "uint64", "name": "expiresAt", "type": "uint64" }, { "internalType": "uint32", "name": "epoch", "type": "uint32" }, { "internalType": "address", "name": "proposer", "type": "address" }], "internalType": "struct TrisivICO.ProposalMeta", "name": "", "type": "tuple" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "getOwnerProposal", "outputs": [{ "components": [{ "internalType": "uint8", "name": "opType", "type": "uint8" }, { "internalType": "address", "name": "account", "type": "address" }, { "internalType": "address", "name": "oldMember", "type": "address" }, { "internalType": "address", "name": "token", "type": "address" }], "internalType": "struct TrisivICO.OwnerProposal", "name": "payload", "type": "tuple" }, { "components": [{ "internalType": "uint8", "name": "role", "type": "uint8" }, { "internalType": "uint8", "name": "confirmations", "type": "uint8" }, { "internalType": "bool", "name": "executed", "type": "bool" }, { "internalType": "bool", "name": "cancelled", "type": "bool" }, { "internalType": "uint64", "name": "expiresAt", "type": "uint64" }, { "internalType": "uint32", "name": "epoch", "type": "uint32" }, { "internalType": "address", "name": "proposer", "type": "address" }], "internalType": "struct TrisivICO.ProposalMeta", "name": "meta", "type": "tuple" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "getAdminProposal", "outputs": [{ "components": [{ "internalType": "uint8", "name": "opType", "type": "uint8" }, { "internalType": "address", "name": "account", "type": "address" }, { "internalType": "address", "name": "oldMember", "type": "address" }, { "internalType": "uint256", "name": "paymentType", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "amount2", "type": "uint256" }, { "internalType": "bool", "name": "boolValue", "type": "bool" }, { "components": [{ "internalType": "string", "name": "paymentName", "type": "string" }, { "internalType": "address", "name": "priceFetchContract", "type": "address" }, { "internalType": "address", "name": "paymentTokenAddress", "type": "address" }, { "internalType": "uint256", "name": "decimal", "type": "uint256" }, { "internalType": "bool", "name": "status", "type": "bool" }, { "internalType": "uint256", "name": "minPrice", "type": "uint256" }, { "internalType": "uint256", "name": "maxPrice", "type": "uint256" }, { "internalType": "uint256", "name": "staleThreshold", "type": "uint256" }], "internalType": "struct TrisivICO.tokenDetail", "name": "detail", "type": "tuple" }], "internalType": "struct TrisivICO.AdminProposal", "name": "payload", "type": "tuple" }, { "components": [{ "internalType": "uint8", "name": "role", "type": "uint8" }, { "internalType": "uint8", "name": "confirmations", "type": "uint8" }, { "internalType": "bool", "name": "executed", "type": "bool" }, { "internalType": "bool", "name": "cancelled", "type": "bool" }, { "internalType": "uint64", "name": "expiresAt", "type": "uint64" }, { "internalType": "uint32", "name": "epoch", "type": "uint32" }, { "internalType": "address", "name": "proposer", "type": "address" }], "internalType": "struct TrisivICO.ProposalMeta", "name": "meta", "type": "tuple" }], "stateMutability": "view", "type": "function" },

    // Owner Proposal Creators (2/3 Multisig)
    { "inputs": [{ "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "proposeRecoverBNB", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "tokenAddr", "type": "address" }, { "internalType": "address", "name": "walletAddress", "type": "address" }], "name": "proposeRecoverToken", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "oldOwner", "type": "address" }, { "internalType": "address", "name": "newOwner", "type": "address" }], "name": "proposeReplaceOwner", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },

    // Admin Proposal Creators (3/5 Multisig)
    { "inputs": [{ "internalType": "bool", "name": "target", "type": "bool" }], "name": "proposeSetPaused", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "newAmount", "type": "uint256" }], "name": "proposeSetTokenPricePerUSD", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "paymentType", "type": "uint256" }, { "components": [{ "internalType": "string", "name": "paymentName", "type": "string" }, { "internalType": "address", "name": "priceFetchContract", "type": "address" }, { "internalType": "address", "name": "paymentTokenAddress", "type": "address" }, { "internalType": "uint256", "name": "decimal", "type": "uint256" }, { "internalType": "bool", "name": "status", "type": "bool" }, { "internalType": "uint256", "name": "minPrice", "type": "uint256" }, { "internalType": "uint256", "name": "maxPrice", "type": "uint256" }, { "internalType": "uint256", "name": "staleThreshold", "type": "uint256" }], "internalType": "struct TrisivICO.tokenDetail", "name": "_tokenDetails", "type": "tuple" }], "name": "proposeSetPaymentTokenDetails", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "paymentType", "type": "uint256" }, { "internalType": "uint256", "name": "minPrice", "type": "uint256" }, { "internalType": "uint256", "name": "maxPrice", "type": "uint256" }], "name": "proposeSetPriceBounds", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "newThreshold", "type": "uint256" }], "name": "proposeSetPriceStaleThreshold", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "signerAddress", "type": "address" }], "name": "proposeSetSignerAddress", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "_tokenAddress", "type": "address" }], "name": "proposeSetTokenAddress", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "oldAdmin", "type": "address" }, { "internalType": "address", "name": "newAdmin", "type": "address" }], "name": "proposeReplaceAdmin", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },

    // Multisig Voting & Execution
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "confirm", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "revokeConfirmation", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "cancelProposal", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }], "name": "execute", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
] as const;

export enum OwnerOpType {
    RecoverBNB = 0,
    RecoverToken = 1,
    ReplaceOwner = 2,
}

export enum AdminOpType {
    SetPaused = 0,
    SetTokenPricePerUSD = 1,
    SetPaymentTokenDetails = 2,
    SetPriceBounds = 3,
    SetPriceStaleThreshold = 4,
    SetSignerAddress = 5,
    SetTokenAddress = 6,
    ReplaceAdmin = 7,
}

export const OWNER_OP_LABELS: Record<number, string> = {
    0: "Recover Native BNB Treasury",
    1: "Recover BEP-20 Token Treasury",
    2: "Replace Contract Owner",
};

export const ADMIN_OP_LABELS: Record<number, string> = {
    0: "Emergency Pause / Unpause",
    1: "Update Token Price (USD)",
    2: "Configure Payment Token Details",
    3: "Configure Oracle Price Bounds",
    4: "Configure Price Stale Threshold",
    5: "Update Cryptographic Signer",
    6: "Update ICO Token Address",
    7: "Replace Contract Admin",
};

export interface ProposalItem {
    id: number;
    role: 'owner' | 'admin';
    confirmations: number;
    executed: boolean;
    cancelled: boolean;
    expiresAt: number;
    proposer: string;
    isExecutable: boolean;
    hasUserConfirmed?: boolean;
    payload?: any;
}

export function getProposalStatus(item: ProposalItem): {
    label: string;
    color: string;
    isExpired: boolean;
    isExecutable: boolean;
} {
    const now = Math.floor(Date.now() / 1000);
    const isExpired = item.expiresAt > 0 && now > item.expiresAt;

    if (item.executed) {
        return { label: "Executed", color: "bg-emerald-100 text-emerald-800 border-emerald-300", isExpired: false, isExecutable: false };
    }
    if (item.cancelled) {
        return { label: "Cancelled", color: "bg-zinc-100 text-zinc-600 border-zinc-300", isExpired: false, isExecutable: false };
    }
    if (isExpired) {
        return { label: "Expired", color: "bg-red-100 text-red-700 border-red-300", isExpired: true, isExecutable: false };
    }
    if (item.isExecutable) {
        return { label: "Ready to Execute", color: "bg-emerald-500 text-white border-emerald-600 animate-pulse", isExpired: false, isExecutable: true };
    }
    return { label: "Pending Approvals", color: "bg-amber-100 text-amber-800 border-amber-300", isExpired: false, isExecutable: false };
}
