'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http, createStorage } from 'wagmi';

// Use localStorage with a unique key prefix so admin wallet state
// is isolated from the user panel (which uses cookieStorage).
// Cookies are shared across localhost regardless of port, so using
// localStorage with a distinct key prevents cross-panel interference.
const adminStorage = typeof window !== 'undefined'
    ? createStorage({
        key: 'trustive-admin',
        storage: localStorage,
    })
    : undefined;

export const getConfig = () => getDefaultConfig({
    appName: 'Trustive Admin Panel',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
    chains: [sepolia],
    transports: {
        [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
    },
    ...(adminStorage ? { storage: adminStorage } : {}),
    ssr: true,
});
