import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { LuX, LuExternalLink, LuShieldCheck, LuLoader, LuRefreshCw } from 'react-icons/lu';
import moonpayIcon from '@/assets/images/moonpay-icon.svg';

interface MoonPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  defaultCurrency?: 'bnb_bsc' | 'usdt_bsc';
  initialAmountUSD?: string | number;
  onSuccess?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const MoonPayModal: React.FC<MoonPayModalProps> = ({
  isOpen,
  onClose,
  walletAddress,
  defaultCurrency = 'bnb_bsc',
  initialAmountUSD,
  onSuccess
}) => {
  const [widgetUrl, setWidgetUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !walletAddress) {
      setWidgetUrl('');
      setLoading(true);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchSignedUrl = async () => {
      try {
        const res = await fetch(`${API_URL}/api/user/moonpay/generate-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            currencyCode: defaultCurrency,
            baseCurrencyAmount: initialAmountUSD && Number(initialAmountUSD) > 0 ? initialAmountUSD.toString() : undefined,
            baseCurrencyCode: 'usd',
            redirectURL: typeof window !== 'undefined' ? window.location.href : undefined
          })
        });

        const data = await res.json();
        if (isMounted) {
          if (data.status && data.url) {
            setWidgetUrl(data.url);
          } else {
            // Fallback to client sandbox URL if backend returns error
            const fallbackKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || 'pk_test_123';
            const fallbackUrl = `https://buy-sandbox.moonpay.com/?apiKey=${fallbackKey}&currencyCode=${defaultCurrency}&walletAddress=${walletAddress}&baseCurrencyCode=usd${initialAmountUSD ? `&baseCurrencyAmount=${initialAmountUSD}` : ''}&colorCode=%23315EFB`;
            setWidgetUrl(fallbackUrl);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.warn('MoonPay URL generate error, using fallback:', err);
          const fallbackKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || 'pk_test_123';
          const fallbackUrl = `https://buy-sandbox.moonpay.com/?apiKey=${fallbackKey}&currencyCode=${defaultCurrency}&walletAddress=${walletAddress}&baseCurrencyCode=usd${initialAmountUSD ? `&baseCurrencyAmount=${initialAmountUSD}` : ''}&colorCode=%23315EFB`;
          setWidgetUrl(fallbackUrl);
          setLoading(false);
        }
      }
    };

    fetchSignedUrl();

    return () => {
      isMounted = false;
    };
  }, [isOpen, walletAddress, defaultCurrency, initialAmountUSD]);

  // Listen to MoonPay widget events
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'moonpay_widget_close') {
          onClose();
        } else if (data.type === 'moonpay_transaction_completed') {
          if (onSuccess) onSuccess();
        }
      } catch {
        // Not a JSON message from MoonPay, ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, onClose, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-[480px] h-[92vh] max-h-[720px] bg-[#ECE9EA] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-zinc-200/90"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/90 bg-[#ECE9EA]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 relative rounded-full overflow-hidden shadow-xs flex-shrink-0">
              <Image src={moonpayIcon} alt="MoonPay" fill />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-zinc-900 tracking-tight">MoonPay Checkout</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold text-[#7D00FF] bg-[#7D00FF]/10 rounded">
                  Card / Fiat
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-zinc-900 font-medium">
                <LuShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>256-Bit Encrypted Payment</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {widgetUrl && (
              <a
                href={widgetUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new window"
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/50 rounded-xl transition-colors"
              >
                <LuExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <LuX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area / Iframe */}
        <div className="relative flex-1 w-full bg-zinc-50 flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-50 z-10">
              <div className="w-10 h-10 rounded-full border-3 border-[#7D00FF]/20 border-t-[#7D00FF] animate-spin" />
              <p className="text-xs font-semibold text-zinc-500">Connecting to MoonPay Gateway...</p>
            </div>
          )}

          {widgetUrl ? (
            <iframe
              src={widgetUrl}
              title="MoonPay Checkout Widget"
              allow="accelerometer; autoplay; camera; gyroscope; payment"
              className="w-full h-full border-none"
              onLoad={() => setLoading(false)}
            />
          ) : (
            !loading && (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-red-500 font-medium">Failed to initialize payment gateway.</p>
                <button
                  onClick={() => setLoading(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#36A886] hover:bg-[#2548D0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  <LuRefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-2.5 bg-white border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-900">
          <span className="truncate max-w-[280px]">
            Delivery to: <span className="font-mono text-zinc-800 font-semibold">{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'N/A'}</span>
          </span>
          <span className="text-zinc-400">BSC Network</span>
        </div>
      </div>
    </div>
  );
};

export default MoonPayModal;
