import toast from 'react-hot-toast';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Stable component to prevent re-creation on every render
const ModalContent = ({ t, resolve, message }: { t: any; resolve: (val: boolean) => void; message: string }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toast.dismiss(t.id);
        resolve(false);
      } else if (e.key === 'Enter') {
        toast.dismiss(t.id);
        resolve(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [t.id, resolve]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999] pointer-events-none">
      {/* Backdrop - Explicitly layered at z-0 */}
      <div 
        className={`fixed inset-0 bg-black/80 backdrop-blur-md transition-all duration-500 pointer-events-auto z-0 ${
          t.visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          toast.dismiss(t.id);
          resolve(false);
        }}
      />
      
      {/* Modal Card - Explicitly layered at z-10 and prevents click bubbling */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${
          t.visible ? 'animate-in fade-in zoom-in duration-300 scale-100' : 'animate-out fade-out zoom-out duration-200 scale-95'
        } max-w-sm w-full bg-[#0D0D0D] border border-white/10 rounded-[28px] overflow-hidden pointer-events-auto flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.8),0_0_30px_rgba(229,178,88,0.05)] relative z-10 transition-all`}
      >
        {/* Visual Accent Bar */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-accent rounded-b-full opacity-50" />

        <div className="p-8 pb-6">
          <div className="flex flex-col items-center text-center space-y-5">
            {/* Icon Container */}
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 rotate-3 shadow-[0_0_20px_rgba(229,178,88,0.1)]">
              <svg className="h-8 w-8 text-accent -rotate-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
                Verify Action
              </h3>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed px-2">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-6 pt-2 flex gap-3">
          <button
            onClick={() => {
              toast.dismiss(t.id);
              resolve(false);
            }}
            className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 bg-white/5 hover:bg-white/10 hover:text-white transition-all cursor-pointer border border-white/5"
          >
            Abort
          </button>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              resolve(true);
            }}
            className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-black bg-accent hover:opacity-90 transition-all cursor-pointer shadow-[0_10px_20px_rgba(229,178,88,0.2)]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export const confirmAction = (options: string | { message: string; title?: string; confirmText?: string; cancelText?: string }): Promise<boolean> => {
  const message = typeof options === 'string' ? options : options.message;
  return new Promise((resolve) => {
    toast.custom(
      (t) => {
        if (typeof document !== 'undefined') {
          return createPortal(<ModalContent t={t} resolve={resolve} message={message} />, document.body);
        }
        return null;
      },
      {
        duration: Infinity,
        position: 'top-center',
      }
    );
  });
};
