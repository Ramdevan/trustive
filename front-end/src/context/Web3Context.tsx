import { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEthersProvider, useEthersSigner } from '@/hooks/useEthers';

// Sepolia chain ID = 11155111
export const TARGET_CHAIN_ID = 11155111;

interface Web3ContextType {
  account: string | null;
  provider: ReturnType<typeof useEthersProvider>;
  signer: ReturnType<typeof useEthersSigner>;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isWalletLoading: boolean;
  status: 'connected' | 'reconnecting' | 'connecting' | 'disconnected';
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
  isConnecting: false,
  isReconnecting: false,
  isWalletLoading: false,
  status: 'disconnected',
  chainId: null,
  isCorrectChain: false,
  connectWallet: () => {},
  disconnectWallet: () => {},
  switchToCorrectChain: () => {},
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const { address, isConnected, isConnecting, isReconnecting, status } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [hasSavedWallet, setHasSavedWallet] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('trustive_wallet_connected') === 'true';
      setHasSavedWallet(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      try {
        localStorage.setItem('trustive_wallet_connected', 'true');
        localStorage.setItem('trustive_connected_address', address);
        setHasSavedWallet(true);
      } catch {}
    }
  }, [isConnected, address]);

  const provider = useEthersProvider();
  const signer = useEthersSigner();

  const isCorrectChain = chainId === TARGET_CHAIN_ID;

  const connectWallet = () => {
    if (openConnectModal) openConnectModal();
  };

  const disconnectWallet = () => {
    try {
      disconnect();
    } catch (e) {
      console.error('Wallet disconnect error:', e);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('trustive_wallet_connected');
        localStorage.removeItem('trustive_connected_address');
        setHasSavedWallet(false);
        Object.keys(localStorage).forEach((key) => {
          if (
            key.startsWith('wagmi.') ||
            key.startsWith('rk-') ||
            key.startsWith('wc@') ||
            key === 'walletconnect' ||
            key === 'wagmi.store' ||
            key === 'wagmi.connected' ||
            key === 'wagmi.recentConnectorId'
          ) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch (e) { }
  };

  const switchToCorrectChain = () => {
    if (switchChain) switchChain({ chainId: TARGET_CHAIN_ID });
  };

  const isWalletLoading = !mounted || isReconnecting || (hasSavedWallet && !isConnected && status !== 'disconnected');

  const value = useMemo(() => ({
    account: address ?? null,
    provider,
    signer,
    isConnected,
    isConnecting,
    isReconnecting,
    isWalletLoading,
    status,
    chainId: chainId ?? null,
    isCorrectChain,
    connectWallet,
    disconnectWallet,
    switchToCorrectChain,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [address, isConnected, isConnecting, isReconnecting, isWalletLoading, status, chainId, isCorrectChain, provider, signer]);

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  return useContext(Web3Context);
}
