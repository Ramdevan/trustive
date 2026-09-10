import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useWeb3 } from '@/context/Web3Context';
import { LuTriangleAlert } from 'react-icons/lu';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const { account, isConnected, disconnectWallet } = useWeb3();
  const [userProfile, setUserProfile] = React.useState<{ wallet_address: string | null } | null>(null);

  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem('user_token');
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
          disconnectWallet();
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('user_last_activity');
          try {
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith('wagmi.') || key.startsWith('rk-') || key.startsWith('wc@') || key === 'walletconnect') {
                localStorage.removeItem(key);
              }
            });
          } catch (e) { }
          toast.error('Session expired. Please log in again.');
          router.replace('/login');
        } else {
          const data = await res.json();
          if (data.status) {
            setUserProfile(data.user);
            // If user has no wallet linked yet and a wallet is connected, link it
            if (!data.user.wallet_address && isConnected && account) {
              fetch(`${API_URL}/api/user/link-wallet`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ wallet_address: account })
              })
                .then(r => r.json())
                .then(linkRes => {
                  if (linkRes.status) {
                    setUserProfile(prev => prev ? { ...prev, wallet_address: account } : { wallet_address: account });
                  }
                })
                .catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error('Session check failed:', err);
      }
    };

    verifySession();
  }, [router.asPath, isConnected, account]);

  return (
    <div className="min-h-screen bg-black font-sans text-white overflow-x-hidden">
      <Navbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="flex pt-[5rem] relative">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="lg:pl-70 w-full transition-all min-h-[calc(100vh-5rem)] relative">
          {isConnected && account && userProfile?.wallet_address && userProfile.wallet_address.toLowerCase() !== account.toLowerCase() ? (
            <div className="absolute inset-0 z-[40] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 sm:p-8">
              <div className="max-w-md w-full bg-[#0D0D0D] border border-red-500/20 rounded-[2.5rem] p-10 text-center shadow-[0_0_100px_rgba(239,68,68,0.1)]">
                <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-500/20">
                  <LuTriangleAlert className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-4">Wallet Mismatch</h1>
                <p className="text-zinc-500 text-sm font-medium leading-relaxed mb-8">
                  Your account is linked to <span className="text-white font-mono text-xs">{userProfile.wallet_address.slice(0, 10)}...{userProfile.wallet_address.slice(-8)}</span>. 
                  Please connect the correct wallet to use the dashboard.
                </p>
                <div className="space-y-4">
                  <div className="p-4 bg-red-500/5 rounded-2xl border border-red-500/10 text-left">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 text-center">Connected Wallet</p>
                    <p className="text-xs font-mono text-zinc-400 break-all text-center">{account}</p>
                  </div>
                  <button
                    onClick={() => disconnectWallet()}
                    className="w-full py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95"
                  >
                    Disconnect & Switch
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-4 lg:p-6">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Layout;

