import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import VestingStatCard from '@/components/VestingStatCard';
import VestingTable from '@/components/VestingTable';
import type { VestingRecord } from '@/utils/vesting';
import { useWeb3 } from '@/context/Web3Context';
import { LuWallet, LuLoader } from 'react-icons/lu';
import { ethers } from 'ethers';
import { toast } from 'react-hot-toast';
import { confirmAction } from '@/utils/confirm';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const VESTING_CONTRACT = process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS
  || process.env.NEXT_PUBLIC_VESTING_CONTRACT
  || '0xbd0a737599462974aD054c958Fce5bbfaaEDeFb8';

export default function Vesting() {
  const { account, signer, isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [vestings, setVestings] = useState<VestingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingAll, setClaimingAll] = useState(false);

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

  // Aggregate stats across all vestings matching the reference architecture
  const totalAllocated = vestings.reduce((sum, v) => {
    const amt = v.details ? Number(v.details.totalAmount) : Number(v.total_amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const totalClaimed = vestings.reduce((sum, v) => {
    const amt = v.details ? Number(v.details.claimedAmount) : 0;
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const totalClaimable = vestings.reduce((sum, v) => {
    const amt = v.details ? Number(v.details.claimableNow) : 0;
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  // Released tokens = Unlocked tokens = claimed + claimable
  const totalReleased = totalClaimed + totalClaimable;

  // Locked tokens = remaining locked tokens
  const totalLocked = Math.max(0, totalAllocated - totalReleased);

  const handleClaimAll = async () => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return;
    }
    if (totalClaimable <= 0) {
      toast.error('No claimable tokens available at this time');
      return;
    }

    const confirmed = await confirmAction(
      `Claim all ${totalClaimable.toLocaleString('en-US', { maximumFractionDigits: 2 })} TRSIV unlocked tokens across all vesting schedules?`
    );
    if (!confirmed) return;

    setClaimingAll(true);
    try {
      const contract = new ethers.Contract(
        VESTING_CONTRACT,
        ['function claimAll() external'],
        signer
      );
      const tx = await contract.claimAll();
      await tx.wait();

      // Record claims in backend database for each schedule with claimable tokens
      for (const v of vestings) {
        const claimable = v.details ? Number(v.details.claimableNow) : 0;
        if (claimable > 0) {
          await fetch(`${API_URL}/api/user/vesting/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              beneficiary: account,
              vesting_index: v.vesting_index ?? 0,
              tx_hash: tx.hash,
              amount: claimable.toString(),
            }),
          }).catch(err => console.error('Claim record error:', err));
        }
      }

      toast.success(
        `Successfully claimed ${totalClaimable.toLocaleString('en-US', { maximumFractionDigits: 2 })} TRSIV!`,
        { duration: 5000 }
      );
      fetchVestings(true);
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        toast.error('Claim cancelled');
        return;
      }
      console.error('Claim all error:', err);
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setClaimingAll(false);
    }
  };

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
              <h2 className="text-[1.5rem] font-medium text-[#001060] mb-2">Connect Your Wallet</h2>
              <p className="text-zinc-900 text-[1rem]">Connect your wallet to view your vesting schedule</p>
            </div>
            <button
              onClick={connectWallet}
              className="bg-[#36A886] hover:bg-[#2d8d70] text-white font-bold px-8 py-4 rounded-2xl transition-all cursor-pointer shadow-lg shadow-[#36A886]/20"
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
          {/* Top 6 Stat Cards in a 3x2 Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <VestingStatCard
              title="TOTAL ALLOCATED"
              value={totalAllocated.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              currency="TRSIV"
            />
            <VestingStatCard
              title="RELEASED TOKENS"
              value={totalReleased.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              currency="TRSIV"
            />
            <VestingStatCard
              title="CLAIMED TOKENS"
              value={totalClaimed.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              currency="TRSIV"
            />
            <VestingStatCard
              title="LOCKED TOKENS"
              value={totalLocked.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              currency="TRSIV"
            />
            <VestingStatCard
              title="CLAIMABLE NOW"
              value={totalClaimable.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              currency="TRSIV"
            />

            {/* Card 6: CLAIM ALL Action Card */}
            <div className="flex flex-col justify-between items-center text-center rounded-2xl bg-[#ECE9EA] p-6 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-[#36A886]/30 transition-all min-h-[160px]">
              <span className="text-[0.875rem] font-bold text-zinc-500 uppercase tracking-widest">
                CLAIM ALL
              </span>
              <p className="text-[0.75rem] text-zinc-500 max-w-[220px] leading-relaxed">
                Withdraw all unlocked tokens from all vesting schedules.
              </p>
              <button
                onClick={handleClaimAll}
                disabled={claimingAll || totalClaimable <= 0}
                className="w-full py-2.5 px-4 rounded-xl bg-[#36A886] hover:bg-[#2d8d70] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[0.875rem] font-bold uppercase tracking-wider shadow-md shadow-[#36A886]/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {claimingAll && <LuLoader className="h-4 w-4 animate-spin" />}
                {claimingAll ? 'Claiming All...' : 'Claim All'}
              </button>
            </div>
          </div>

          {/* Tables with Tabs (Growth Ledger & Claim History) */}
          <VestingTable vestings={vestings} loading={loading} onRefresh={fetchVestings} />
        </div>
      </Layout>
    </AuthGuard>
  );
}
