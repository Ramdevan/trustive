export type AdminRole = 'owner' | 'admin';

// Contract 0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC Roles on BSC Testnet
export const CONTRACT_OWNERS: string[] = [
    "0x861b38d9E97ebE86883A55eB4b2b70cca795785E",
    "0xb01507c1661C22404D2371Ae9043Dc715663EB22",
    "0x0bAaaD913DE9567dEb71368296d56a84a22C949d",
].map((a) => a.toLowerCase());

export const CONTRACT_ADMINS: string[] = [
    "0x3300f29508D7D04c75C55BeF8F56bC822E30A2D3",
    "0x88A4f903D778Eee639fE1987fBD89c2892594471",
    "0x61c3810A04AdeabeE2ABdCa465Af5BB389C979Df",
    "0x55451A3f10D392BEa6A19DD9Fb366c17d462A5d2",
    "0x724318431F8ce8a22e464c7057dECB474d603EeD",
].map((a) => a.toLowerCase());

export const OWNER_QUORUM = { required: 2, total: 3 };
export const ADMIN_QUORUM = { required: 3, total: 5 };

export function isOwnerAddress(address?: string | null): boolean {
    if (!address) return false;
    return CONTRACT_OWNERS.includes(address.toLowerCase());
}

export function isAdminAddress(address?: string | null): boolean {
    if (!address) return false;
    return CONTRACT_ADMINS.includes(address.toLowerCase());
}

export function isAuthorizedWallet(address?: string | null): boolean {
    return isOwnerAddress(address) || isAdminAddress(address);
}

export function getAddressRole(address?: string | null): AdminRole | null {
    if (!address) return null;
    const lower = address.toLowerCase();
    if (CONTRACT_OWNERS.includes(lower)) return 'owner';
    if (CONTRACT_ADMINS.includes(lower)) return 'admin';
    return null;
}
