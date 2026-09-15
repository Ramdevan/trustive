'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bscTestnet } from 'wagmi/chains';
import { http, fallback, createStorage } from 'wagmi';

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
    chains: [bscTestnet],
    transports: {
        [bscTestnet.id]: fallback([
            http(process.env.NEXT_PUBLIC_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com'),
            http('https://bsc-testnet-rpc.publicnode.com'),
            http('https://data-seed-prebsc-1-s1.binance.org:8545'),
            http('https://data-seed-prebsc-2-s1.binance.org:8545'),
            http('https://bsc-testnet.drpc.org'),
        ]),
    },
    ...(adminStorage ? { storage: adminStorage } : {}),
    ssr: true,
});
