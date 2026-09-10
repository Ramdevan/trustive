import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import VestingStatCard from '@/components/VestingStatCard';
import VestingTable from '@/components/VestingTable';
import type { VestingRecord } from '@/utils/vesting';
import { useWeb3 } from '@/context/Web3Context';
import { LuWallet } from 'react-icons/lu';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function Vesting() {
  const { account, isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [vestings, setVestings] = useState<VestingRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVestings = (silent = false) => {
    if (!account) return;
    if (!silent) setLoading(true);
    fetch(`${API_URL}/api/user/vesting/${account}`)
      .then(r => r.json())
      .then(d => { if (d.status) setVestings(d.vestings || []); })
      .catch(err => console.error('Vesting fetch error:', err))
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    fetchVestings(); // Initial full-loading fetch

    // Real-time optimization: Poll for new claimable amounts every 30 seconds
    const interval = setInterval(() => {
      fetchVestings(true); // Silent background fetch
    }, 30000);

    return () => clearInterval(interval);
  }, [account]);

  // Aggregate stats across all vestings
  const totalAllocated = vestings.reduce((sum, v) => {
    const amt = v.details ? Number(v.details.totalAmount) : Number(v.total_amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const totalClaimable = vestings.reduce((sum, v) => {
    const amt = v.details ? Number(v.details.claimableNow) : 0;
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const totalLocked = vestings.reduce((sum, v) => {
    const remaining = v.details ? Number(v.details.remainingToClaim) : Number(v.total_amount);
    const claimable = v.details ? Number(v.details.claimableNow) : 0;
    const locked = (isNaN(remaining) ? 0 : remaining) - (isNaN(claimable) ? 0 : claimable);
    return sum + Math.max(0, locked);
  }, 0);

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
            <p className="text-zinc-500 text-[1rem]">Connect your wallet to view your vesting schedule</p>
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
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <VestingStatCard
            title="Allocated Tokens"
            value={totalAllocated.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            currency="$Trustive"
          />
          <VestingStatCard
            title="Locked Tokens"
            value={totalLocked.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            currency="$Trustive"
          />
          <VestingStatCard
            title="Claimable Tokens"
            value={totalClaimable.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            currency="$Trustive"
          />
        </div>
        <VestingTable vestings={vestings} loading={loading} onRefresh={fetchVestings} />
      </div>
    </Layout>
    </AuthGuard>
  );
}
