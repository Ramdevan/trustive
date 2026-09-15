import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { bscTestnet } from 'wagmi/chains';
import { http, fallback, createStorage, cookieStorage } from 'wagmi';

export const config = getDefaultConfig({
    appName: 'Trustive ICO',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    // MetaMask only. Without this the connect modal also offers RainbowKit's
    // default list (Rainbow, Base Account, WalletConnect).
    wallets: [
        {
            groupName: 'Recommended',
            wallets: [metaMaskWallet],
        },
    ],
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
    // EIP-6963 discovery makes wagmi build a connector for every injected
    // extension, which the modal then lists under "Installed" (Phantom, etc.).
    // The MetaMask connector targets MetaMask directly and does not rely on it.
    multiInjectedProviderDiscovery: false,
    storage: createStorage({
        key: 'trustive-user',
        storage: cookieStorage,
    }),
    ssr: true,
});
