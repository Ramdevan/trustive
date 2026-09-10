import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
];

const ICO_ABI = [
  'function getToken(uint256 paymentType, uint256 tokenAmount) view returns (uint256)',
];

interface StatItemProps {
  label: string;
  value: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value }) => (
  <div className="space-y-1">
    <div className="text-[1rem] font-normal text-[#FAF7F2] uppercase tracking-wider">{label}</div>
    <div className="text-[1.5rem] font-medium text-[#FAF7F2]">{value}</div>
  </div>
);

interface SaleData {
  token_price?: number;
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
      .then(d => { if (d.status && d.sale) setSale(d.sale); })
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

  // Fetch token price from contract: how many Trustive for 1 USDT (index 1, 6 decimals)
  useEffect(() => {
    const fetchPrice = async () => {
      const settingsRes = await fetch(`${API_URL}/api/user/getSettings`).then(r => r.json()).catch(() => null);
      const icoContract = settingsRes?.data?.ico_contract;
      if (!icoContract) return;

      const oneUsdt = ethers.parseUnits('1', 8); // 1 USDT (contract uses 8 decimals)
      for (const rpc of RPC_URLS) {
        try {
          const provider = new ethers.JsonRpcProvider(rpc);
          const contract = new ethers.Contract(icoContract, ICO_ABI, provider);
          const tokenWei: bigint = await contract.getToken(1, oneUsdt); // paymentType 1 = USDT
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
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Trustive';
  };

  const endsOn = formatDate(sale?.end_at_utc);
  const allocation = formatTokens(sale?.token_quantity);
  const sold = formatTokens(sale?.total_tokens_sold);
  const minPurchase = formatTokens(sale?.minimum_purchase);
  const maxPurchase = formatTokens(sale?.maximum_purchase);

  return (
    <div className="rounded-3xl bg-card p-6 sm:p-10 border border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-y-8 sm:gap-y-12 gap-x-8">
      <div className="text-left"><StatItem label="Token Price" value={tokenPrice} /></div>
      <div className="text-right"><StatItem label="Ends-On" value={endsOn} /></div>

      <div className="text-left"><StatItem label="Minimum" value={minPurchase} /></div>
      <div className="text-right"><StatItem label="Maximum" value={maxPurchase} /></div>

      <div className="text-left"><StatItem label="Allocation" value={allocation} /></div>
      <div className="text-right"><StatItem label="Sold" value={sold} /></div>
    </div>
  );
};

export default ICOStats;
