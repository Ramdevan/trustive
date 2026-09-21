'use client';

import React, { ReactNode } from 'react';
import { getConfig } from '@/lib/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { State, WagmiProvider } from 'wagmi';
import { Web3Provider } from '@/lib/context/Web3Context';
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export default function Providers({
    children,
    initialState,
}: {
    children: ReactNode;
    initialState?: State;
}) {
    const [mounted, setMounted] = React.useState(false);
    const [wagmiConfig, setWagmiConfig] = React.useState<any>(null);

    React.useEffect(() => {
        setWagmiConfig(getConfig());
        setMounted(true);

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = event?.reason;
            const message = typeof reason === 'string' ? reason : (reason?.message || reason?.shortMessage || '');
            if (
                message.includes('Failed to connect to MetaMask') ||
                message.includes('User rejected the request') ||
                message.includes('User denied transaction signature') ||
                message.includes('ConnectorNotFoundError') ||
                message.includes('ResourceUnavailableRpcError')
            ) {
                event.preventDefault();
                console.warn('[Wallet] Handled extension rejection:', message);
            }
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }, []);

    if (!mounted || !wagmiConfig) {
        return (
            <div className="min-h-screen bg-background" />
        );
    }

    return (
        <WagmiProvider config={wagmiConfig} initialState={initialState}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme({ accentColor: '#315EFB', accentColorForeground: '#ffffff' })}>
                    <Web3Provider>
                        {children}
                    </Web3Provider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
