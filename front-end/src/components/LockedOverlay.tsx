import React from 'react';
import { LuLock } from 'react-icons/lu';

interface LockedOverlayProps {
  children: React.ReactNode;
  className?: string;
}

const LockedOverlay: React.FC<LockedOverlayProps> = ({ children, className = "" }) => {
  return (
    <div className={`relative group overflow-hidden ${className}`}>
      {/* Original Content (Blurred) */}
      <div className="filter blur-[4px] grayscale opacity-40 pointer-events-none select-none">
        {children}
      </div>

      {/* Lock Overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#141312E5]">
        <div className="p-3 rounded-full bg-black/40 border border-white/10 shadow-2xl transition-transform group-hover:scale-110">
          <LuLock className="h-5 w-5 text-zinc-400" />
        </div>
      </div>
    </div>
  );
};

export default LockedOverlay;
