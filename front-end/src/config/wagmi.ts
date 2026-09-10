import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { sepolia } from 'wagmi/chains';
import { http, createStorage, cookieStorage } from 'wagmi';

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
    chains: [sepolia],
    transports: {
        [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
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
