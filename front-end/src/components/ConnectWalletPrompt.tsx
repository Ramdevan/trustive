import React from 'react';
import { LuWallet } from 'react-icons/lu';

const ConnectWalletPrompt: React.FC = () => {
  return (
    <div className="rounded-2xl bg-[#ECE9EA] p-12 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden group min-h-[calc(28rem)]">
      <div className="relative">
        <div className="w-16 h-16 bg-[#36A886] rounded-full flex items-center justify-center shadow-lg shadow-[#36A886]/20 text-white">
          <LuWallet size={32} strokeWidth={2.5} />
        </div>
      </div>

      <div className="space-y-3 relative z-10 max-w-md mx-auto">
        <h2 className="text-[2rem] font-medium text-[#001060]">Connect Your Wallet to View</h2>
        <p className="text-[1rem] font-normal text-zinc-900 leading-relaxed px-4">
          Link your wallet to view your personalized portfolio analytics, history, and start trading TRSIV tokens
        </p>
      </div>

      <button className="mt-4 px-10 py-4 bg-[#36A886] hover:bg-[#36A886] text-white font-bold rounded-2xl transition-all shadow-xl shadow-[#36A886]/20 active:scale-[0.98] text-[1.125rem] cursor-pointer relative z-10">
        Connect Wallet
      </button>
    </div>
  );
};

export default ConnectWalletPrompt;
