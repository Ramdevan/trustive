import React from 'react';
import { LuWallet } from 'react-icons/lu';

const ConnectWalletPrompt: React.FC = () => {
  return (
    <div className="rounded-2xl bg-card p-12 border border-white/5 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden group min-h-[calc(28rem)]">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/5 blur-[100px] pointer-events-none" />

      <div className="relative">

        <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center shadow-lg shadow-accent/20 text-black">
          <LuWallet size={32} strokeWidth={2.5} />
        </div>

      </div>

      <div className="space-y-3 relative z-10 max-w-md mx-auto">
        <h2 className="text-[2rem] font-medium text-[#FAF7F2]">Connect Your Wallet to View</h2>
        <p className="text-[1rem] font-normal text-zinc-500 leading-relaxed px-4">
          Link your wallet to view your personalized portfolio analytics, history, and start trading Trustive tokens
        </p>
      </div>

      <button className="mt-4 px-10 py-4 bg-accent hover:bg-accent/90 text-black font-bold rounded-2xl transition-all shadow-xl shadow-accent/10 active:scale-[0.98] text-[1.125rem] cursor-pointer relative z-10">
        Connect Wallet
      </button>
    </div>
  );
};

export default ConnectWalletPrompt;
