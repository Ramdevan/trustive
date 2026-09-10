import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface Plan {
  id: number;
  name: string;
  duration_days: number;
  apy: number;
  min_stake: string;
}

interface StakingBannerProps {
  onStakeClick?: () => void;
  hasActiveStake?: boolean;
}

const StakingBanner: React.FC<StakingBannerProps> = ({ onStakeClick, hasActiveStake = false }) => {
  const [flexPlan, setFlexPlan] = useState<Plan | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/user/staking/plans`)
      .then(r => r.json())
      .then(d => {
        if (d.status && Array.isArray(d.plans) && d.plans.length > 0) {
          setFlexPlan(d.plans[0]);
        }
      })
      .catch(err => console.error('StakingBanner fetch error:', err));
  }, []);

  const planName = (flexPlan?.name && flexPlan.name !== 'Flexible' && !flexPlan.name.startsWith('Level ')) 
    ? flexPlan.name 
    : 'GOLD';
  const apyLabel = flexPlan?.apy ? `${Number(flexPlan.apy).toFixed(0)}% APY` : '8% APY';
  const minStake = (flexPlan?.min_stake && flexPlan.min_stake !== '100' && flexPlan.min_stake !== '0') 
    ? `${Number(flexPlan.min_stake).toLocaleString()} Trustive` 
    : '1,000 Trustive';

  return (
    <div className="rounded-3xl bg-card p-6 border border-[#282726] relative overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 relative z-10 sm:text-center md:text-left">
        <div className="text-center space-y-1 pb-4 md:pb-0 md:pr-4">
          <div className="text-[1rem] font-normal text-zinc-500">Plan Name</div>
          <div className="text-[1.5rem] font-medium text-[#FAF7F2]">{planName}</div>
        </div>
        <div className="text-center space-y-1 py-4 md:py-0 md:px-8 border-t md:border-t-0 md:border-l border-[#282726]">
          <div className="text-[1rem] font-normal text-zinc-500">Annual Yield</div>
          <div className="text-[1.5rem] font-medium text-accent">{apyLabel}</div>
        </div>
        <div className="text-center space-y-1 pt-4 md:pt-0 md:pl-8 border-t md:border-t-0 md:border-l border-[#282726]">
          <div className="text-[1rem] font-normal text-zinc-500">Minimum Stake</div>
          <div className="text-[1.5rem] font-medium text-[#FAF7F2]">{minStake}</div>
        </div>
      </div>

      <div className="h-px bg-[#282726] w-full my-6 relative z-10" />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-0 relative z-10">
        <div className="flex gap-3">
          {hasActiveStake && (
            <span className="text-xs text-amber-400/80 font-medium">
              You already have an active stake. Withdraw it before staking again.
            </span>
          )}
        </div>
        <button
          onClick={onStakeClick}
          disabled={hasActiveStake}
          className={`w-full sm:w-auto font-bold px-10 py-3 rounded-xl transition-all shadow-lg active:scale-[0.98] ${
            hasActiveStake
              ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed shadow-none'
              : 'bg-accent hover:bg-accent/90 text-black shadow-accent/10 cursor-pointer'
          }`}
        >
          {hasActiveStake ? 'Already Staked' : 'Stake Now'}
        </button>
      </div>
    </div>
  );
};

export default StakingBanner;
