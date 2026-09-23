import React from 'react';

interface VestingStatCardProps {
  title: string;
  value: string;
  currency: string;
}

const VestingStatCard: React.FC<VestingStatCardProps> = ({ title, value, currency }) => {
  return (
    <div className="flex flex-col justify-between items-center text-center rounded-2xl bg-[#ECE9EA] p-6 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-[#36A886]/30 transition-all min-h-[160px]">
      <span className="text-[0.875rem] font-bold text-zinc-500 uppercase tracking-widest">{title}</span>
      <div className="flex flex-col items-center">
        <span className="text-[2.25rem] font-bold text-zinc-900 leading-tight tracking-tighter">{value}</span>
        <span className="text-[1rem] font-black text-[#1E1E1E] uppercase tracking-wider">{currency}</span>
      </div>
    </div>
  );
};

export default VestingStatCard;
