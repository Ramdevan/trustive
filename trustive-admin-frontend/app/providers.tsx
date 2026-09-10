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
    }, []);

    if (!mounted || !wagmiConfig) {
        return (
            <div className="min-h-screen bg-background" />
        );
    }

    return (
        <WagmiProvider config={wagmiConfig} initialState={initialState}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme()}>
                    <Web3Provider>
                        {children}
                    </Web3Provider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
