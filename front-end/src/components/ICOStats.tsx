import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
  'https://bsc-testnet-rpc.publicnode.com',
  'https://data-seed-prebsc-1-s1.binance.org:8545',
];

const ICO_ABI = [
  'function tokenAmountPerUSD() view returns (uint256)',
  'function getToken(uint256 paymentType, uint256 tokenAmount) view returns (uint256)',
];

interface StatItemProps {
  label: string;
  value: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value }) => (
  <div className="space-y-1">
    <div className="text-[0.875rem] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
    <div className="text-[1.5rem] font-bold text-zinc-900">{value}</div>
  </div>
);

interface SaleData {
  price?: number | string;
  token_price?: number | string;
  end_at_utc?: string;
  token_quantity?: number;
  total_tokens_sold?: number;
  minimum_purchase?: number;
  maximum_purchase?: number;
}

const ICOStats: React.FC = () => {
  const [sale, setSale] = useState<SaleData | null>(null);
  const [tokenPrice, setTokenPrice] = useState<string>('—');

  const fetchSale = () => {
    fetch(`${API_URL}/api/user/getActiveSale`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.sale) {
          setSale(d.sale);
          const p = d.sale.price ?? d.sale.token_price;
          if (p != null && !isNaN(Number(p))) {
            setTokenPrice(`$${Number(p).toFixed(2)}`);
          }
        }
      })
      .catch(err => console.error('ICOStats fetch error:', err));
  };

  useEffect(() => {
    fetchSale();

    // Listen for custom event triggered when user buys tokens
    const onPurchased = () => {
      fetchSale();
    };
    window.addEventListener('ico_purchased', onPurchased);

    // Periodic refresh every 6 seconds to keep live stats in sync
    const interval = setInterval(fetchSale, 6000);

    return () => {
      window.removeEventListener('ico_purchased', onPurchased);
      clearInterval(interval);
    };
  }, []);

  // Fetch token price from contract fallback if not yet set by active sale
  useEffect(() => {
    const fetchPrice = async () => {
      const settingsRes = await fetch(`${API_URL}/api/user/getSettings`).then(r => r.json()).catch(() => null);
      const icoContract = settingsRes?.data?.ico_contract;
      if (!icoContract) return;

      for (const rpc of RPC_URLS) {
        try {
          const provider = new ethers.JsonRpcProvider(rpc);
          const contract = new ethers.Contract(icoContract, ICO_ABI, provider);

          // 1. Direct tokenAmountPerUSD on-chain view function
          try {
            const rawAmount = await contract.tokenAmountPerUSD();
            const tokensPerUSD = parseFloat(ethers.formatUnits(rawAmount, 18));
            if (tokensPerUSD > 0) {
              const priceUSD = 1 / tokensPerUSD;
              setTokenPrice(`$${priceUSD.toFixed(2)}`);
              return;
            }
          } catch {}

          // 2. Fallback using 1 USDT (index 1, 6 decimals)
          const oneUsdt = ethers.parseUnits('1', 6);
          const tokenWei: bigint = await contract.getToken(1, oneUsdt);
          const tokensPer1USD = parseFloat(ethers.formatUnits(tokenWei, 18));
          if (tokensPer1USD > 0) {
            const priceUSD = 1 / tokensPer1USD;
            setTokenPrice(`$${priceUSD.toFixed(2)}`);
          }
          return;
        } catch {
          // try next RPC
        }
      }
    };
    fetchPrice();
  }, []);

  const formatDate = (utcStr?: string) => {
    if (!utcStr) return '—';
    try {
      return new Date(utcStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    } catch { return '—'; }
  };

  const formatTokens = (n?: number) => {
    if (n === undefined || n === null) return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TRSIV';
  };

  const endsOn = formatDate(sale?.end_at_utc);
  const allocation = formatTokens(sale?.token_quantity);
  const sold = formatTokens(sale?.total_tokens_sold);
  const minPurchase = formatTokens(sale?.minimum_purchase);
  const maxPurchase = formatTokens(sale?.maximum_purchase);

  return (
    <div className="rounded-3xl bg-[#ECE9EA] p-6 md:p-8 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] h-full flex flex-col justify-between">
      <h2 className="text-[1.5rem] font-bold text-[#001060] px-1 mb-2">Sales Details</h2>

      <div className="flex-1 flex flex-col justify-evenly py-2 gap-y-6">
        <div className="grid grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5">
          <div className="text-left"><StatItem label="Token Price" value={tokenPrice} /></div>
          <div className="text-right"><StatItem label="Ends-On" value={endsOn} /></div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5">
          <div className="text-left"><StatItem label="Minimum" value={minPurchase} /></div>
          <div className="text-right"><StatItem label="Maximum" value={maxPurchase} /></div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5">
          <div className="text-left"><StatItem label="Allocation" value={allocation} /></div>
          <div className="text-right"><StatItem label="Sold" value={sold} /></div>
        </div>
      </div>
    </div>
  );
};

export default ICOStats;
