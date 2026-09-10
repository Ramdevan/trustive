import React, { useState, useRef, useEffect } from 'react';
import { LuShieldCheck, LuWallet, LuMenu, LuSettings, LuLogOut, LuTriangleAlert, LuUser } from 'react-icons/lu';
import Image from 'next/image';
import Link from 'next/link';
import userProfile from '@/assets/images/user.png';
import { useWeb3 } from '@/context/Web3Context';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useConnect } from 'wagmi';

interface NavbarProps {
  onToggleSidebar: () => void;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { account, isConnected, isCorrectChain, connectWallet, disconnectWallet, switchToCorrectChain } = useWeb3();
  const { connector } = useAccount();
  const { connectors } = useConnect();
  const [profilePic, setProfilePic] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('user_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          return parsed.profile_pic || null;
        }
      } catch {}
    }
    return null;
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

  // Find the icon from the connectors list which is more reliable in Wagmi 2
  const activeConnector = connectors.find(c => c.id === connector?.id);
  const walletLogo = activeConnector?.icon || connector?.icon;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const fetchProfile = async () => {
      const token = localStorage.getItem('user_token');
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.status && data.user) {
          if (data.user.profile_pic) {
            setProfilePic(data.user.profile_pic);
          }
          try {
            const cached = localStorage.getItem('user_data');
            const existing = cached ? JSON.parse(cached) : {};
            localStorage.setItem('user_data', JSON.stringify({ ...existing, ...data.user }));
          } catch {}
        }
      } catch (err) {
        console.error('Navbar profile fetch error:', err);
      }
    };

    fetchProfile();
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleWalletClick = async () => {
    if (!isConnected) {
      await connectWallet();
    }
  };

  return (
    <nav className="fixed top-0 z-50 flex h-[5rem] w-full items-center justify-between bg-white/90 border-b border-zinc-200/80 px-3 md:px-6 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-2 md:gap-4">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          <LuMenu className="h-6 w-6" />
        </button>
        <Link href="/dashboard" className="flex h-10 w-20 md:w-32 items-center justify-start rounded cursor-pointer hover:opacity-90 transition-opacity">
          <Image src="/assets/images/logo.svg" alt="Trustive Logo" width={144} height={40} className="invert-0 object-contain w-36" priority />
        </Link>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <button className="hidden sm:flex items-center gap-2 rounded-xl bg-zinc-100 border border-zinc-200 px-3 md:px-5 py-2.5 md:py-3 text-[0.875rem] md:text-[1rem] font-medium text-zinc-800 transition-colors hover:bg-zinc-200 cursor-pointer">
          <LuShieldCheck className="h-5 w-5 text-[#212E73]" />
          <span className="hidden md:inline">KYC</span>
        </button>

        {/* Wrong chain warning */}
        {isConnected && !isCorrectChain && (
          <button
            onClick={switchToCorrectChain}
            className="hidden lg:flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-3 text-[0.875rem] font-medium text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            <LuTriangleAlert className="h-4 w-4" />
            Switch to Sepolia
          </button>
        )}

        {/* Wallet Button & Profile Dropdown - Consolidated for State Sync */}
        <ConnectButton.Custom>
          {({
            account: rbAccount,
            chain,
            openAccountModal,
            openChainModal,
            openConnectModal,
            mounted,
          }) => {
            const ready = mounted;
            const connected = ready && rbAccount && chain;
            const walletIcon = (rbAccount as any)?.connector?.iconUrl || (rbAccount as any)?.connector?.icon || (rbAccount as any)?.iconUrl || connector?.icon;

            return (
              <div className="flex items-center gap-4" {...(!ready && { 'aria-hidden': true, 'style': { opacity: 0, pointerEvents: 'none', userSelect: 'none' } })}>
                {/* Desktop Wallet Button */}
                {(() => {
                  if (!connected) {
                    return (
                      <button
                        onClick={openConnectModal}
                        type="button"
                        className="hidden lg:flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[1rem] font-medium text-[#0A0908] transition-colors hover:bg-accent/90 cursor-pointer"
                      >
                        <LuWallet className="h-4 w-4" />
                        Connect Wallet
                      </button>
                    );
                  }

                  if (chain.unsupported) {
                    return (
                      <button
                        onClick={openChainModal}
                        type="button"
                        className="hidden lg:flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-3 text-[0.875rem] font-medium text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                      >
                        <LuTriangleAlert className="h-4 w-4" />
                        Wrong Network
                      </button>
                    );
                  }

                  return (
                    <button
                      onClick={openAccountModal}
                      type="button"
                      className="hidden lg:flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[1rem] font-medium text-[#0A0908] transition-colors hover:bg-accent/90 cursor-pointer"
                    >
                      <LuWallet className="h-4 w-4" />
                      {rbAccount.displayName}
                    </button>
                  );
                })()}

                {/* Profile Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <div
                      className="h-12 w-12 overflow-hidden rounded-lg border border-white/10 cursor-pointer hover:border-accent/40 transition-all active:scale-95 bg-black/20 flex items-center justify-center p-1"
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                    >
                      {profilePic ? (
                        <img src={profilePic} alt="User Profile" className="w-full h-full object-cover rounded-md" />
                      ) : connected ? (
                        walletIcon ? (
                          <img src={walletIcon} alt="Wallet Logo" className="object-contain w-full h-full" />
                        ) : (
                          <div className="w-full h-full rounded-md bg-gradient-to-br from-accent via-yellow-500 to-amber-700 opacity-80" />
                        )
                      ) : (
                        <Image src={userProfile} alt="Default User" className="object-contain w-full h-full" priority />
                      )}
                    </div>

                  {isProfileOpen && (
                    <div className="absolute right-0 mt-3 w-64 rounded-2xl bg-white border border-zinc-200/90 py-4 shadow-xl">
                      {/* Mobile wallet section */}
                      <div className="lg:hidden px-4 py-3 border-b border-zinc-100 mb-3">
                        <div className="text-[0.75rem] text-zinc-400 uppercase font-bold tracking-wider mb-2 px-1">
                          Connect
                        </div>
                        {!connected ? (
                          <button onClick={openConnectModal} className="w-full flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-2 text-[0.875rem] font-medium text-amber-700 border border-amber-300 hover:bg-accent/20 transition-colors cursor-pointer">
                            <LuWallet className="h-4 w-4" />
                            Connect Wallet
                          </button>
                        ) : chain.unsupported ? (
                          <button onClick={openChainModal} className="w-full flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-[0.875rem] font-medium text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer">
                            <LuTriangleAlert className="h-4 w-4" />
                            Wrong Network
                          </button>
                        ) : (
                          <button onClick={openAccountModal} className="w-full flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-2 text-[0.875rem] font-medium text-amber-700 border border-amber-300 hover:bg-accent/20 transition-colors cursor-pointer">
                            <LuWallet className="h-4 w-4" />
                            {rbAccount.displayName}
                          </button>
                        )}
                      </div>

                      <div className="px-2 space-y-1">
                        <Link
                          href="/profile"
                          onClick={() => setIsProfileOpen(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[1rem] text-zinc-800 hover:bg-zinc-100 transition-colors text-left group cursor-pointer"
                        >
                          <LuUser className="h-5 w-5 text-zinc-500 group-hover:text-[#212E73] transition-colors" />
                          Profile
                        </Link>

                        {connected && (
                          <button
                            onClick={() => { disconnectWallet(); setIsProfileOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[1rem] text-red-600 hover:bg-red-50 transition-colors text-left group cursor-pointer"
                          >
                            <LuLogOut className="h-5 w-5 text-red-600" />
                            Disconnect Wallet
                          </button>
                        )}

                        <div className="my-2 border-t border-zinc-100" />

                        <button
                          onClick={() => {
                            disconnectWallet();
                            localStorage.removeItem("user_token");
                            localStorage.removeItem("user_data");
                            localStorage.removeItem("user_last_activity");
                            try {
                              Object.keys(localStorage).forEach((key) => {
                                if (key.startsWith('wagmi.') || key.startsWith('rk-') || key.startsWith('wc@') || key === 'walletconnect') {
                                  localStorage.removeItem(key);
                                }
                              });
                            } catch (e) { }
                            window.location.replace("/login");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[1rem] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left group cursor-pointer"
                        >
                          <LuLogOut className="h-5 w-5 text-zinc-400 group-hover:text-red-500" />
                          Logout Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </nav>
  );
};

export default Navbar;
