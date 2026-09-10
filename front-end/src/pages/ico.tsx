import React, { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import BuyTokenForm from '@/components/BuyTokenForm';
import ICOStats from '@/components/ICOStats';
import CountdownTimer from '@/components/CountdownTimer';

import { useWeb3 } from '@/context/Web3Context';
import { LuWallet, LuTriangleAlert } from 'react-icons/lu';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type SaleStatus = 'active' | 'scheduled' | 'ended' | 'none' | 'loading';

export default function ICO() {
  const { isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('loading');

  useEffect(() => {
    fetch(`${API_URL}/api/user/getActiveSale`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.sale) {
          const status = d.sale.computed_status as string;
          if (status === 'active') {
            setSaleStatus('active');
          } else if (status === 'scheduled') {
            setSaleStatus('scheduled');
          } else {
            setSaleStatus('ended');
          }
        } else {
          setSaleStatus('none');
        }
      })
      .catch(() => setSaleStatus('none'));
  }, []);

  if (isWalletLoading || isReconnecting) {
    return (
      <AuthGuard>
        <Layout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  if (!isConnected) {
    return (
      <AuthGuard>
        <Layout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
            <LuWallet className="h-16 w-16 text-zinc-600" />
            <div>
              <h2 className="text-[1.5rem] font-medium text-white mb-2">Connect Your Wallet</h2>
              <p className="text-zinc-500 text-[1rem]">Connect your wallet to view and participate in the ICO</p>
            </div>
            <button
              onClick={connectWallet}
              className="bg-accent hover:bg-accent/90 text-black font-bold px-8 py-4 rounded-2xl transition-all cursor-pointer"
            >
              Connect Wallet
            </button>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        {saleStatus === 'loading' ? (
          <div className="min-h-[70vh] flex items-center justify-center" />
        ) : saleStatus === 'active' ? (
          <div className="w-full max-w-[45rem] mx-auto space-y-6 sm:space-y-8">
            <CountdownTimer />
            <div className="w-full max-w-[35rem] mx-auto space-y-4">
              <BuyTokenForm />
              <ICOStats />
            </div>
          </div>
        ) : saleStatus === 'scheduled' ? (
          <div className="w-full max-w-[45rem] mx-auto space-y-6 sm:space-y-8">
            <CountdownTimer />
            <div className="w-full max-w-[35rem] mx-auto space-y-4">
              <div className="rounded-3xl bg-[#121212] border border-white/10 p-8 text-center space-y-3 shadow-2xl animate-in fade-in duration-500">
                <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                  <LuTriangleAlert className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-wider">
                  Upcoming Phase Scheduled
                </h3>
                <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                  The upcoming token sale phase is scheduled. Token purchase will automatically become available once the countdown timer reaches zero.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-[70vh] flex items-center justify-center p-4">
            <div className="w-full max-w-[35rem] rounded-3xl bg-[#121212] border border-white/10 p-8 text-center space-y-3 shadow-2xl animate-in fade-in duration-500">
              <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                <LuTriangleAlert className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white uppercase tracking-wider">
                No Active Sale
              </h3>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                There is currently no active or scheduled token sale. Please check back later for upcoming sale phases.
              </p>
            </div>
          </div>
        )}
      </Layout>
    </AuthGuard>
  );
}
