import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LuLayoutDashboard, LuTarget, LuCoins, LuArrowRightLeft, LuRocket, LuUser } from 'react-icons/lu';
import { useBalance } from 'wagmi';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';

const menuItems = [
  { name: 'Dashboard', icon: LuLayoutDashboard, path: '/dashboard' },
  { name: 'ICO', icon: LuTarget, path: '/ico' },
  { name: 'Stake', icon: LuCoins, path: '/staking' },
  { name: 'Transactions', icon: LuArrowRightLeft, path: '/transactions' },
  { name: 'Vesting Claim', icon: LuRocket, path: '/vesting' },
];

const TRUSTIVE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TRUSTIVE_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_PPM_TOKEN_ADDRESS || '0xFf602986Fc0F3711F7E1251CfbD38a33Cc594d4D') as `0x${string}`;

const sanitizeTokenSymbol = (symbol?: string): string => {
  if (!symbol) return 'Trustive';
  const clean = symbol.replace(/\0/g, '').replace(/[^\x20-\x7E]/g, '').trim();
  return clean || 'Trustive';
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const { account } = useWeb3();
  const [balance, setBalance] = useState<string>('— Trustive');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!account) {
        setBalance('— Trustive');
        return;
      }
      setLoading(true);

      const providers = [
        new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
        new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com'),
        new ethers.JsonRpcProvider('https://sepolia.gateway.tenderly.co'),
      ];

      for (const p of providers) {
        try {
          const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'];
          const contract = new ethers.Contract(TRUSTIVE_TOKEN_ADDRESS, abi, p);
          const [val, decimals, symbol] = await Promise.all([
            contract.balanceOf(account),
            contract.decimals(),
            contract.symbol().catch(() => 'Trustive')
          ]);
          
          const formatted = parseFloat(ethers.formatUnits(val, decimals)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setBalance(`${formatted} ${sanitizeTokenSymbol(symbol)}`);
          setLoading(false);
          return;
        } catch (err) {
          console.warn('Sidebar balance RPC failed, trying next...');
        }
      }
      setLoading(false);
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 20000); // 20s refresh
    return () => clearInterval(interval);
  }, [account]);

  const balanceDisplay = loading && balance === '— Trustive' ? 'Loading...' : balance;

  return (
    <aside className={`fixed left-0 top-[5rem] z-40 h-[calc(100vh-5rem)] w-70 bg-sidebar p-4 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="space-y-2">
        {menuItems.map((item) => {
          const isActive = router.pathname === item.path;
          return (
            <Link
              key={item.name}
              href={item.path}
              onClick={onClose}
              className={`cursor-pointer flex items-center gap-3 rounded-xl px-4 py-3 text-[1.25rem] font-medium transition-all ${isActive
                ? 'bg-accent text-black shadow-lg shadow-accent/10'
                : 'text-[#FAF7F2] hover:bg-white/5 hover:text-white'}`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl bg-black/40 p-4">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Trustive Balance</div>
        <div className="text-lg font-bold text-white">{balanceDisplay}</div>
      </div>
    </aside>
  );
};

export default Sidebar;
