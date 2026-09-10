import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import TransactionTable from '@/components/TransactionTable';
import { useWeb3 } from '@/context/Web3Context';
import { LuWallet } from 'react-icons/lu';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function Transactions() {
  const { account, isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    fetch(`${API_URL}/api/user/getTransactionDetails?address=${account}`)
      .then(r => r.json())
      .then(d => {
        if (d.status) setTransactions(d.userData || []);
      })
      .catch(err => console.error('Transactions fetch error:', err))
      .finally(() => setLoading(false));
  }, [account]);

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
            <p className="text-zinc-500 text-[1rem]">Connect your wallet to view your transaction history</p>
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
      <div className="mx-auto">
        <TransactionTable transactions={transactions} loading={loading} />
      </div>
    </Layout>
    </AuthGuard>
  );
}
