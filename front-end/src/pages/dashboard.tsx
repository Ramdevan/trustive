import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import AuthGuard from "@/components/AuthGuard";
import StatCard from "@/components/StatCard";
import DashboardChart from "@/components/DashboardChart";
import PromoCard from "@/components/PromoCard";
import { useWeb3 } from "@/context/Web3Context";
import { useBalance } from "wagmi";
import { LuArrowRight, LuWallet } from "react-icons/lu";

import { ethers } from "ethers";

import CopyButton from "@/components/CopyButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TRUSTIVE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TRUSTIVE_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_PPM_TOKEN_ADDRESS || "0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D") as `0x${string}`;

const sanitizeTokenSymbol = (symbol?: string): string => {
  if (!symbol) return 'Trustive';
  const clean = symbol.replace(/\0/g, '').replace(/[^\x20-\x7E]/g, '').trim();
  return clean || 'Trustive';
};

interface UserStats {
  tokensPurchased: string;
  totalTransactions: number;
  tokensAvailable: string;
  tokenPrice: string;
  saleName: string;
  saleEndDate: string;
  totalAllocated: string;
  balanceInSale: string;
}

interface Transaction {
  id?: number;
  trans_hash?: string;
  crypto_value?: string;
  payment_type?: string;
  ptc_tokens?: string;
  usd_value_of_crypto?: string;
  created_at_utc?: string;
  created_at?: string;
  status?: string;
}

const shortenHash = (hash?: string) => {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  } catch { return '—'; }
};

export default function Dashboard() {
  const router = useRouter();

  const { account, isConnected, isWalletLoading, isReconnecting, connectWallet } = useWeb3();
  const [stats, setStats] = useState<UserStats>({
    tokensPurchased: "—",
    totalTransactions: 0,
    tokensAvailable: "—",
    tokenPrice: "—",
    saleName: "—",
    saleEndDate: "—",
    totalAllocated: "—",
    balanceInSale: "—",
  });
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('user_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          return parsed.name || '';
        }
      } catch {}
    }
    return '';
  });

  const { data: balanceData } = useBalance({
    address: account as `0x${string}`,
    token: TRUSTIVE_TOKEN_ADDRESS,
    query: {
      enabled: !!account,
    }
  });

  // Prevent navigating back to login from dashboard
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('user_token')) {
      window.history.pushState(null, '', window.location.href);
      const onPopState = () => {
        window.history.pushState(null, '', window.location.href);
      };
      window.addEventListener('popstate', onPopState);
      return () => {
        window.removeEventListener('popstate', onPopState);
      };
    }
  }, []);

  useEffect(() => {
    if (!account) return;
    setTxLoading(true);

    // Fetch user token balance via RPC fallback
    const fetchBalanceFallback = async () => {
      // rpc.sepolia.org is dead and only added latency to the fallback chain
      const providers = [
        new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
        new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com'),
        new ethers.JsonRpcProvider('https://sepolia.gateway.tenderly.co'),
      ];

      for (const p of providers) {
        try {
          const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'];
          const contract = new ethers.Contract(TRUSTIVE_TOKEN_ADDRESS, abi, p);
          const [val, decimals, sym] = await Promise.all([
            contract.balanceOf(account),
            contract.decimals(),
            contract.symbol().catch(() => 'Trustive')
          ]);
          const num = parseFloat(ethers.formatUnits(val, decimals));
          const formatted = isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const cleanSym = sanitizeTokenSymbol(sym);
          setStats(prev => ({
            ...prev,
            tokensAvailable: `${formatted} ${cleanSym}`,
          }));
          return;
        } catch {
          // try next provider
        }
      }
    };
    fetchBalanceFallback();

    // Fetch user data, sale info, and staking plans
    Promise.all([
      fetch(`${API_URL}/api/user/getUserData?address=${account}`).then(r => r.json()),
      fetch(`${API_URL}/api/user/getActiveSale`).then(r => r.json()),
      fetch(`${API_URL}/api/user/vesting/${account}`).then(r => r.json()).catch(() => ({ status: false })),
    ])
      .then(([userData, saleData, vestingData]) => {
        const transactions: Transaction[] =
          Array.isArray(userData.transactions) ? userData.transactions : [];

        // Extract user name from UserData
        if (Array.isArray(userData.UserData) && userData.UserData.length > 0) {
          const name = userData.UserData[0].name || "";
          if (name) {
            setUserName(name);
            try {
              const cached = localStorage.getItem('user_data');
              const existing = cached ? JSON.parse(cached) : {};
              localStorage.setItem('user_data', JSON.stringify({ ...existing, name }));
            } catch {}
          }
        }

        const tokensPurchased = transactions.reduce((sum: number, tx) => {
          if (tx.status === "success" || tx.status === "paid") {
            return sum + parseFloat(tx.ptc_tokens || "0");
          }
          return sum;
        }, 0);

        const tokenPrice =
          saleData.status && (saleData.sale?.price ?? saleData.sale?.token_price) != null
            ? `$${Number(saleData.sale?.price ?? saleData.sale?.token_price).toFixed(2)}`
            : "—";

        const saleName = saleData.status && saleData.sale?.computed_status === "active" ? saleData.sale.name : "—";
        const saleEndDate = saleData.status && saleData.sale?.computed_status === "active" && saleData.sale?.end_at
          ? new Date(saleData.sale.end_at_utc || saleData.sale.end_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "—";

        const totalAllocatedNum = saleData.status && saleData.sale?.token_quantity != null
          ? Number(saleData.sale.token_quantity)
          : tokensPurchased; // Fallback

        const balanceInSale = saleData.status && saleData.sale?.available_tokens != null
          ? `${Number(saleData.sale.available_tokens).toLocaleString("en-US", { maximumFractionDigits: 2 })} Trustive`
          : "—";

        setStats(prev => ({
          ...prev,
          tokensPurchased: tokensPurchased.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Trustive",
          totalTransactions: transactions.length,
          tokenPrice,
          saleName,
          saleEndDate,
          totalAllocated: totalAllocatedNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Trustive",
          balanceInSale,
        }));
        setRecentTxs(transactions.slice(0, 5));
      })
      .catch(err => console.error("Dashboard fetch error:", err))
      .finally(() => setTxLoading(false));
  }, [account]);

  useEffect(() => {
    if (balanceData) {
      const cleanSymbol = sanitizeTokenSymbol(balanceData.symbol);
      const val = parseFloat(balanceData.formatted);
      const formatted = isNaN(val)
        ? "0.00"
        : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setStats(prev => ({
        ...prev,
        tokensAvailable: `${formatted} ${cleanSymbol}`,
      }));
    }
  }, [balanceData]);

  if (isWalletLoading || isReconnecting) {
    return (
      <AuthGuard>
        <Layout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  if (!isConnected) {
    return (
      <AuthGuard>
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <LuWallet className="h-16 w-16 text-zinc-600" />
          <div>
            <h2 className="text-[1.5rem] font-medium text-white mb-2">Connect Your Wallet</h2>
            <p className="text-zinc-500 text-[1rem]">Connect your wallet to view your dashboard</p>
          </div>
          <button
            onClick={connectWallet}
            className="bg-accent hover:bg-accent/90 text-black font-bold px-8 py-4 rounded-2xl transition-all cursor-pointer"
          >
            Connect Wallet
          </button>
        </div>
      </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
    <Layout>
      <div className="flex flex-col gap-4 mx-auto">
        {/* Top Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Current Token Price" value={stats.tokenPrice} icon={<div />} />
          <StatCard title="Tokens Purchased" value={isConnected ? stats.tokensPurchased : "—"} icon={<div />} />
          <StatCard title="Total Transactions" value={isConnected ? stats.totalTransactions : "—"} icon={<div />} />
          <StatCard title="Tokens Available" value={isConnected ? stats.tokensAvailable : "—"} icon={<div />} />
        </div>

        {/* Second Row Stats - Only shown during Active Sale */}
        {stats.saleName !== "—" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Active Sale" value={stats.saleName} icon={<div />} />
            <StatCard title="Sale End Date" value={stats.saleEndDate} icon={<div />} />
            <StatCard title="Total Allocated" value={isConnected ? stats.totalAllocated : "—"} icon={<div />} />
            <StatCard title="Balance in the sale" value={isConnected ? stats.balanceInSale : "—"} icon={<div />} />
          </div>
        )}

        {/* Hidden: Chart and Promo Section
        <div className="flex flex-col xl:flex-row gap-4">
          <DashboardChart />
          <PromoCard />
        </div>
        */}

        {/* Recent Transactions */}
        <div className="rounded-3xl bg-card border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
            <h2 className="text-[1.125rem] font-medium text-[#FAF7F2]">Recent Transactions</h2>
          </div>

          {!isConnected ? (
            <div className="px-6 py-12 text-center text-zinc-500 text-[0.875rem]">
              Connect your wallet to see recent transactions
            </div>
          ) : txLoading ? (
            <div className="px-6 py-12 text-center text-zinc-500 text-[0.875rem]">Loading...</div>
          ) : recentTxs.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-500 text-[0.875rem]">No transactions yet</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full text-left border-collapse min-w-[36rem]">
                <thead>
                  <tr className="text-[0.7rem] font-medium text-zinc-500 uppercase tracking-wider">
                    <th className="px-4 sm:px-6 py-4 text-left">S No</th>
                    <th className="px-4 sm:px-6 py-4 text-left">Users</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Payment Type</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Amount Paid</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Received Trustive</th>
                    <th className="px-4 sm:px-6 py-4 text-center">USD Value</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Status</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Transaction Hash</th>
                  </tr>
                </thead>
                <tbody className="text-[0.8rem] text-[#94A3B8]">
                  {recentTxs.map((tx, i) => {
                    const isSuccess = tx.status === 'success' || tx.status === 'paid';
                    return (
                      <tr key={tx.id ?? i} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 sm:px-6 py-3 text-[#FAF7F2]">{i + 1}</td>
                        <td className="px-4 sm:px-6 py-3 text-[#FAF7F2]">
                          <div className="flex items-center gap-1.5">
                            <span>{userName || shortenHash(account ?? undefined)}</span>
                            {account && <CopyButton text={account} label="Copy Address" />}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-[#E5A93E] whitespace-nowrap text-center">{tx.payment_type}</td>
                        <td className="px-4 sm:px-6 py-3 text-[#E5A93E] whitespace-nowrap text-center">{tx.crypto_value}</td>
                        <td className="px-4 sm:px-6 py-3 text-[#E5A93E] whitespace-nowrap text-center">{parseFloat(tx.ptc_tokens || '0').toLocaleString()} Trustive</td>
                        <td className="px-4 sm:px-6 py-3 text-white font-bold whitespace-nowrap text-center">${Number(tx.usd_value_of_crypto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 sm:px-6 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[0.65rem] font-bold mx-auto ${isSuccess ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-green-400' : 'bg-yellow-400'}`} />
                            {isSuccess ? 'Success' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-3 font-mono text-center">
                          {tx.trans_hash ? (
                            <a href={`https://sepolia.etherscan.io/tx/${tx.trans_hash}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" title={tx.trans_hash}>
                              {shortenHash(tx.trans_hash)}
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-6 py-4 border-t border-white/5 flex justify-center">
            <Link
              href="/transactions"
              className="inline-flex items-center gap-2 text-[0.875rem] font-medium text-accent hover:text-accent/80 transition-colors"
            >
              Show all transactions
              <LuArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </Layout>
    </AuthGuard>
  );
}
