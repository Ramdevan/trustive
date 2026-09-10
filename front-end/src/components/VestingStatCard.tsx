import React from 'react';

interface VestingStatCardProps {
  title: string;
  value: string;
  currency: string;
}

const VestingStatCard: React.FC<VestingStatCardProps> = ({ title, value, currency }) => {
  return (
    <div className="flex flex-col justify-between items-center text-center rounded-2xl bg-card p-6 border border-white/5 hover:border-accent/20 transition-all min-h-[160px]">
      <span className="text-[1rem] font-medium text-zinc-500 uppercase tracking-widest">{title}</span>
      <div className="flex flex-col items-center">
        <span className="text-[2.25rem] font-bold text-[#FAF7F2] leading-tight tracking-tighter">{value}</span>
        <span className="text-[1.125rem] font-black text-[#E5A93E] uppercase tracking-wider">{currency}</span>
      </div>
    </div>
  );
};

export default VestingStatCard;
