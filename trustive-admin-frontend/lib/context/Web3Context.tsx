'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEthersProvider, useEthersSigner } from '@/lib/hooks/useEthers';

// Sepolia chain ID = 11155111
export const TARGET_CHAIN_ID = 11155111;

interface Web3ContextType {
    account: string | null;
    provider: ReturnType<typeof useEthersProvider>;
    signer: ReturnType<typeof useEthersSigner>;
    isConnected: boolean;
    chainId: number | null;
    isCorrectChain: boolean;
    connectWallet: () => void;
    disconnectWallet: () => void;
    switchToCorrectChain: () => void;
}

const Web3Context = createContext<Web3ContextType>({
    account: null,
    provider: undefined,
    signer: undefined,
    isConnected: false,
    chainId: null,
    isCorrectChain: false,
    connectWallet: () => { },
    disconnectWallet: () => { },
    switchToCorrectChain: () => { },
});

export function Web3Provider({ children }: { children: ReactNode }) {
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { openConnectModal } = useConnectModal();

    const provider = useEthersProvider();
    const signer = useEthersSigner();

    const isCorrectChain = chainId === TARGET_CHAIN_ID;

    const connectWallet = () => {
        if (openConnectModal) openConnectModal();
    };

    const disconnectWallet = () => {
        disconnect();
    };

    const switchToCorrectChain = () => {
        if (switchChain) switchChain({ chainId: TARGET_CHAIN_ID });
    };

    const value = useMemo(() => ({
        account: address ?? null,
        provider,
        signer,
        isConnected,
        chainId: chainId ?? null,
        isCorrectChain,
        connectWallet,
        disconnectWallet,
        switchToCorrectChain,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [address, isConnected, chainId, isCorrectChain, provider, signer]);

    return (
        <Web3Context.Provider value={value}>
            {children}
        </Web3Context.Provider>
    );
}

export function useWeb3() {
    return useContext(Web3Context);
}
