import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { sepolia } from 'wagmi/chains';
import ethIcon from '@/assets/images/eth-icon.svg';
import usdtIcon from '@/assets/images/usdt-icon.svg';
import usdcIcon from '@/assets/images/usdc-icon.svg';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';
import { useAccount as useWagmiAccount } from 'wagmi';
import { LuWallet, LuTriangleAlert, LuLoader, LuCoins } from 'react-icons/lu';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { toast } from 'react-hot-toast';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';
import { confirmAction } from '@/utils/confirm';

// Payment type indexes matching the ICO contract
// 0 = ETH, 1 = USDT, 2 = USDC
type PaymentMethod = 'ETH' | 'USDT' | 'USDC';

const PAYMENT_CONFIG: Record<PaymentMethod, { index: number; decimals: number; label: string }> = {
  ETH: { index: 0, decimals: 18, label: 'ETH' },
  USDT: { index: 1, decimals: 8, label: 'USDT' },
  USDC: { index: 2, decimals: 8, label: 'USDC' },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
];

const ICO_ABI = [
  'function buyToken(address recipient, uint256 paymentType, uint256 tokenAmount, uint256 nonce, bytes calldata signature) payable',
  'function getToken(uint256 paymentType, uint256 tokenAmount) view returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

interface Settings {
  ico_contract: string;
  usdt_address: string;
  usdc_address: string;
  token_name: string;
  token_symbol: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ['ETH', 'USDT', 'USDC'];

const getIcon = (method: PaymentMethod) => {
  if (method === 'ETH') return ethIcon;
  if (method === 'USDT') return usdtIcon;
  return usdcIcon;
};

const BuyTokenForm: React.FC = () => {
  const { account: contextAccount, provider, signer, isConnected, isCorrectChain, switchToCorrectChain } = useWeb3();
  const { address } = useWagmiAccount();
  const account = address || contextAccount;
  const [method, setMethod] = useState<PaymentMethod>('ETH');
  const [amount, setAmount] = useState('');
  const [trustiveTokens, setTrustiveTokens] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [balance, setBalance] = useState('0.00');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // Fetch contract addresses from backend
  useEffect(() => {
    fetch(`${API_URL}/api/user/getSettings`)
      .then(r => r.json())
      .then(d => { if (d.status) setSettings(d.data); })
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  // Fetch Balances manually via ethers for better reliability with WalletConnect/Metamask
  // Includes multi-RPC fallback in case one provider is blocked/slow
  const hasFetchedOnce = useRef(false);

  useEffect(() => {
    hasFetchedOnce.current = false;
    setBalance('0.00');
    setBalanceLoading(true);
  }, [method]);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!account || !isConnected) {
        setBalance('0.00');
        setBalanceLoading(false);
        return;
      }

      // Only show loading spinner on the very first fetch
      if (!hasFetchedOnce.current) {
        setBalanceLoading(true);
      }

      // List of providers to try: 1. Wallet Provider, 2. Public RPCs
      const providers = [
        provider,
        new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com'),
        new ethers.JsonRpcProvider('https://sepolia.drpc.org'),
        new ethers.JsonRpcProvider('https://rpc2.sepolia.org'),
      ].filter(Boolean) as (ethers.Provider | ethers.JsonRpcProvider)[];

      let success = false;
      for (const p of providers) {
        try {
          if (method === 'ETH') {
            const b = await p.getBalance(account);
            const newBal = parseFloat(ethers.formatEther(b)).toFixed(2);
            setBalance(prev => prev !== newBal ? newBal : prev);
            success = true;
          } else {
            const tokenAddress = method === 'USDT' ? settings?.usdt_address : settings?.usdc_address;
            if (tokenAddress && tokenAddress.startsWith('0x')) {
              const tokenContract = new ethers.Contract(tokenAddress, [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)'
              ], p);

              const [b, decimals] = await Promise.all([
                tokenContract.balanceOf(account),
                tokenContract.decimals().catch(() => 6)
              ]);

              const newBal = parseFloat(ethers.formatUnits(b, decimals)).toFixed(2);
              setBalance(prev => prev !== newBal ? newBal : prev);
              success = true;
            } else if (settings) {
              setBalance('0.00');
              success = true;
            }
          }
          if (success) break;
        } catch (err) {
          console.warn('RPC failed, trying next...', err);
        }
      }

      if (!success) setBalance('0.00');
      hasFetchedOnce.current = true;
      setBalanceLoading(false);
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [account, method, provider, settings, isConnected]);

  const currentBalance = balanceLoading ? '...' : balance;

  const handleAmountChange = (rawVal: string) => {
    if (rawVal === '') {
      setAmount('');
      return;
    }

    // Keep only numbers and at most one decimal point
    let val = rawVal.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }

    // Restrict to at most 5 decimal places
    if (parts.length >= 2 && parts[1].length > 5) {
      val = parts[0] + '.' + parts[1].slice(0, 5);
    }

    setAmount(val);
  };

  const handlePercentageClick = (percent: number) => {
    if (balanceLoading || balance === '0.00' || !isConnected) return;

    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum <= 0) return;

    let finalAmount = (balanceNum * percent) / 100;

    // For ETH Max, leave a small buffer for gas (e.g., 0.005 ETH)
    if (method === 'ETH' && percent === 100) {
      finalAmount = Math.max(0, balanceNum - 0.005);
    }

    if (finalAmount <= 0) {
      setAmount('');
      return;
    }

    // Limit to at most 5 decimal places
    const rounded = parseFloat(finalAmount.toFixed(5));
    setAmount(rounded > 0 ? rounded.toString() : '');
  };

  // Register or link wallet on backend when connected
  useEffect(() => {
    if (!account) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('user_token') : null;
    if (token) {
      fetch(`${API_URL}/api/user/link-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ wallet_address: account })
      }).catch(() => {});
    } else {
      fetch(`${API_URL}/api/user/RegisterNewUser?wallet_address=${account}`)
        .catch(err => console.error('RegisterNewUser error:', err));
    }
  }, [account]);

  interface SaleData {
    minimum_purchase: number;
    maximum_purchase: number;
    token_quantity?: number | string;
    available_tokens?: number | string;
    computed_status?: string;
    status?: string;
  }

  const [sale, setSale] = useState<SaleData | null>(null);
  const [saleLoaded, setSaleLoaded] = useState(false);

  // Fetch active sale for dynamic limits
  useEffect(() => {
    fetch(`${API_URL}/api/user/getActiveSale`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.sale) setSale(d.sale);
        else setSale(null);
      })
      .catch(err => console.error('BuyTokenForm fetch sale error:', err))
      .finally(() => setSaleLoaded(true));
  }, []);

  const isSaleActive = saleLoaded ? Boolean(sale && (sale.computed_status === 'active' || (sale.status === 'active' && sale.computed_status !== 'scheduled' && sale.computed_status !== 'ended'))) : false;

  // Calculate Trustive tokens when amount or method changes (debounced)
  const calcTokens = useCallback(async (inputAmount: string, paymentMethod: PaymentMethod) => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !settings?.ico_contract) {
      setTrustiveTokens('');
      setIsCalculating(false);
      return;
    }
    if (saleLoaded && !isSaleActive) {
      setTrustiveTokens('0.00');
      setIsCalculating(false);
      return;
    }
    setIsCalculating(true);
    const { index, decimals } = PAYMENT_CONFIG[paymentMethod];
    try {
      const amountWei = ethers.parseUnits(inputAmount, decimals);
      for (const rpc of RPC_URLS) {
        try {
          const readProvider = new ethers.JsonRpcProvider(rpc);
          const icoContract = new ethers.Contract(settings.ico_contract, ICO_ABI, readProvider);
          const tokens: bigint = await icoContract.getToken(index, amountWei);
          const formatted = parseFloat(ethers.formatUnits(tokens, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });
          setTrustiveTokens(formatted);
          setIsCalculating(false);
          return;
        } catch {
          // try next RPC
        }
      }
    } catch (err) {
      console.warn('calcTokens error:', err);
    }
    setTrustiveTokens('');
    setIsCalculating(false);
  }, [settings, saleLoaded, isSaleActive]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setTrustiveTokens('');
      setIsCalculating(false);
      return;
    }
    setIsCalculating(true);
    const timer = setTimeout(() => calcTokens(amount, method), 500);
    return () => clearTimeout(timer);
  }, [amount, method, calcTokens]);

  const inputAmountNum = parseFloat(amount || '0');
  const hasAmount = Boolean(amount && !isNaN(inputAmountNum) && inputAmountNum > 0);
  const trustiveVal = trustiveTokens ? parseFloat(trustiveTokens.replace(/,/g, '')) : 0;
  const minLimit = sale?.minimum_purchase ? Number(sale.minimum_purchase) : 0;
  const maxLimit = sale?.maximum_purchase ? Number(sale.maximum_purchase) : 0;
  const availableAllocation = Math.max(0, parseFloat(String(sale?.available_tokens ?? sale?.token_quantity ?? '0')));
  const effectiveMinLimit = (availableAllocation > 0 && availableAllocation < minLimit) ? availableAllocation : minLimit;
  const balanceNum = parseFloat(balance);
  const isInsufficientBalance = Boolean(
    isConnected && !balanceLoading && !isNaN(balanceNum) && hasAmount && inputAmountNum > balanceNum
  );
  const EPSILON = 0.01;
  const isBelowMin = Boolean(hasAmount && !isCalculating && effectiveMinLimit > 0 && (trustiveVal > 0 ? (trustiveVal + EPSILON) < effectiveMinLimit : true));
  const isAboveMax = Boolean(hasAmount && !isCalculating && maxLimit > 0 && (trustiveVal - EPSILON) > maxLimit);
  const isInvalidTokenAmount = Boolean(hasAmount && !isCalculating && !isBelowMin && !isAboveMax && trustiveVal <= 0);

  const handleBuy = async () => {
    if (!isConnected || !signer || !account || !settings?.ico_contract) return;
    if (!isCorrectChain) { switchToCorrectChain(); return; }
    
    if (saleLoaded && !isSaleActive) {
      toast.error('Sale is not currently active');
      return;
    }

    if (!hasAmount || inputAmountNum <= 0) {
      toast.error('Please enter an amount to buy');
      return;
    }

    if (isCalculating) {
      toast.error('Please wait while token conversion is calculated');
      return;
    }

    if (isInsufficientBalance) {
      toast.error(`Insufficient ${method} balance`);
      return;
    }

    if (effectiveMinLimit > 0 && (trustiveVal + EPSILON) < effectiveMinLimit) {
      setTxStatus(`Minimum purchase is ${effectiveMinLimit.toLocaleString('en-US')} Trustive tokens`);
      setIsError(true);
      toast.error(`Minimum purchase is ${effectiveMinLimit.toLocaleString('en-US')} Trustive tokens`);
      return;
    }

    if (maxLimit > 0 && (trustiveVal - EPSILON) > maxLimit) {
      setTxStatus(`Maximum purchase is ${maxLimit.toLocaleString('en-US')} Trustive tokens`);
      setIsError(true);
      toast.error(`Maximum purchase is ${maxLimit.toLocaleString('en-US')} Trustive tokens`);
      return;
    }

    if (trustiveVal <= 0) {
      toast.error('Invalid token amount');
      return;
    }

    if (!(await confirmAction(`Confirm your purchase of ${amount} ${method} for approximately ${trustiveTokens} Trustive tokens?`))) return;

    // Verify wallet link with currently logged in user
    const userToken = typeof window !== 'undefined' ? localStorage.getItem('user_token') : null;
    if (userToken && account) {
      try {
        const linkRes = await fetch(`${API_URL}/api/user/link-wallet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({ wallet_address: account })
        });
        const linkData = await linkRes.json();
        if (!linkData.status && linkData.msg?.includes('already linked to another account')) {
          toast.error('This connected wallet is linked to a different account. Please connect your own wallet.');
          return;
        }
      } catch (e) { }
    }

    setLoading(true);
    setIsSuccess(false);
    setIsError(false);
    setTxStatus('');

    try {
      const { index, decimals } = PAYMENT_CONFIG[method];
      const paymentAmountWei = ethers.parseUnits(amount, decimals);

      // 1. Get signature from backend
      // For ETH: backend signs over msg.value (ETH amount, 18 decimals)
      // For USDT/USDC: backend signs over payment token amount (6 decimals)
      setTxStatus('Requesting signature...');
      const signRes = await fetch(`${API_URL}/api/user/createSign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, address: account, caller: account, amount }),
      });
      const signData = await signRes.json();
      // Surface the server's reason (purchase-limit rejections, signing failures)
      // instead of a generic message that hides why the request was refused.
      if (!signData.status) {
        throw new Error(signData.message || 'Failed to get signature from server');
      }
      const { signature, nonce } = signData;

      const icoContract = new ethers.Contract(settings.ico_contract, ICO_ABI, signer);
      let tx: ethers.TransactionResponse;

      if (method === 'ETH') {
        // ETH: contract signs over msg.value, tokenAmount param unused (pass 0)
        setTxStatus('Confirm transaction in your wallet...');
        tx = await icoContract.buyToken(account, index, 0, nonce, signature, { value: paymentAmountWei });
      } else {
        // USDT/USDC: approve payment amount first, then call buyToken with payment amount
        const tokenAddress = method === 'USDT' ? settings.usdt_address : settings.usdc_address;
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

        setTxStatus(`Approving ${method} spend...`);
        const allowance: bigint = await tokenContract.allowance(account, settings.ico_contract);
        if (allowance < paymentAmountWei) {
          const approveTx: ethers.TransactionResponse = await tokenContract.approve(settings.ico_contract, paymentAmountWei);
          setTxStatus('Waiting for approval confirmation...');
          await approveTx.wait();
        }

        setTxStatus('Confirm purchase in your wallet...');
        tx = await icoContract.buyToken(account, index, paymentAmountWei, nonce, signature);
      }

      setTxStatus('Transaction submitted, confirming...');
      const txHash = tx.hash;
      await tx.wait();

      // 2. Save purchase to backend
      setTxStatus('Recording purchase...');
      const rawTrustive = trustiveTokens.replace(/,/g, '') || '0';
      await fetch(`${API_URL}/api/user/createPurchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: account,
          CryptoValue: amount,
          payment_type: method,
          trustive_tokens: rawTrustive,
          transHash: txHash,
          USDvalue_of_crypto_purchased: method !== 'ETH' ? amount : '0',
          sale_type: (sale as any)?.type || (sale as any)?.name || '',
          status: 'success',
        }),
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ico_purchased', { detail: { tokens: rawTrustive } }));
      }

      const purchasedTokens = trustiveTokens;
      setIsSuccess(true);
      setAmount('');
      setTrustiveTokens('');
      const successMsg = `Successfully purchased ${purchasedTokens} Trustive tokens!`;
      setTxStatus(successMsg);
      toast.success(successMsg, { duration: 5000 });
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        setTxStatus('');
        toast.error('Purchase cancelled');
        return;
      }
      console.error(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      setIsError(true);
      toast.error(friendlyMsg);
      setTxStatus(''); // Clear technical status on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl bg-white p-6 md:p-8 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-8">
      <h2 className="text-[1.5rem] font-bold text-zinc-900 px-1">Buy Token</h2>

      {/* Payment method selector */}
      <div className="space-y-2">
        <label className="text-[0.875rem] font-semibold text-zinc-700 block">Select payment method</label>
        <div className="grid grid-cols-3 gap-3">
          {PAYMENT_METHODS.map(m => (
            <button
              key={m}
              onClick={() => { setMethod(m); setAmount(''); setTrustiveTokens(''); setTxStatus(''); setIsError(false); setIsSuccess(false); }}
              className={`flex items-center justify-center gap-2 py-4 rounded-xl transition-all cursor-pointer border ${method === m
                ? 'bg-[#212E73] border-[#212E73] text-white font-bold shadow-md shadow-[#212E73]/20'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
            >
              <div className="w-6 h-6 relative">
                <Image src={getIcon(m)} alt={m} fill className={method === m ? '' : 'grayscale opacity-70'} />
              </div>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Wrong chain warning */}
      {isConnected && !isCorrectChain && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[0.875rem]">
          <LuTriangleAlert className="h-4 w-4 flex-shrink-0" />
          Please switch to Ethereum Sepolia to purchase tokens
        </div>
      )}

      {/* Enter Amount */}
      <div className="space-y-3">
        <label className="text-[0.875rem] font-semibold text-zinc-700 block">Enter Amount</label>

        {/* Balance Display - Compact Premium Card */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-out ${isConnected
            ? 'max-h-24 opacity-100 mb-4 scale-100'
            : 'max-h-0 opacity-0 mb-0 scale-95'
            }`}
        >
          <div className="bg-zinc-50 rounded-2xl border border-zinc-200 shadow-sm px-5 py-3.5 transform transition-all duration-500">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#212E73] animate-pulse"></div>
                  <span className="text-zinc-500 text-[0.75rem] font-bold uppercase tracking-widest">
                    Available Balance
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-900 text-[1rem] font-bold tracking-tight">
                    {currentBalance}
                  </span>
                  <span className="text-[#212E73] text-[0.75rem] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 rounded-lg border border-blue-200">
                    {method}
                  </span>
                </div>
              </div>

              {/* Percentage Buttons */}
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-zinc-200 shadow-xs">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePercentageClick(p)}
                    className="px-2.5 py-1 text-[0.7rem] font-bold text-zinc-600 hover:text-[#212E73] hover:bg-zinc-100 rounded-md transition-all cursor-pointer"
                  >
                    {p === 100 ? 'MAX' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => handleAmountChange(e.target.value)}
            disabled={loading}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-5 pl-6 pr-[9.5rem] text-[1.25rem] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#212E73] focus:ring-2 focus:ring-[#212E73]/10 transition-all font-medium disabled:opacity-50"
          />
          <div className="absolute min-w-[8rem] right-4 top-1/2 -translate-y-1/2 flex items-center justify-center gap-2 px-3 py-2 border-l border-zinc-200 pointer-events-none">
            <div className="w-7 h-7 relative">
              <Image src={getIcon(method)} alt={method} fill />
            </div>
            <span className="text-[0.875rem] font-bold text-zinc-900">{method}</span>
          </div>
        </div>
      </div>

      {/* Receive */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[0.875rem] font-semibold text-zinc-700 block">Receive</label>
          {minLimit > 0 && (
            <span className="text-[0.75rem] text-zinc-500 font-medium">
              Min: {minLimit.toLocaleString('en-US')} Trustive{maxLimit > 0 ? ` • Max: ${maxLimit.toLocaleString('en-US')} Trustive` : ''}
            </span>
          )}
        </div>
        <div className="relative group">
          <input
            type="text"
            placeholder="0.00"
            value={isCalculating ? 'Calculating...' : trustiveTokens}
            readOnly
            className={`w-full bg-zinc-50 border rounded-2xl py-5 pl-6 pr-[9.5rem] text-[1.25rem] placeholder:text-zinc-400 focus:outline-none font-bold transition-colors ${
              isBelowMin || isAboveMax
                ? 'border-amber-400 text-amber-600'
                : 'border-zinc-200 text-zinc-900'
            }`}
          />
          <div className="absolute min-w-[8rem] right-4 top-1/2 -translate-y-1/2 flex items-center justify-center gap-2 px-3 py-2 border-l border-zinc-200 pointer-events-none">
            {isCalculating ? (
              <LuLoader className="h-5 w-5 text-[#212E73] animate-spin" />
            ) : (
              <div className="w-16 h-8 relative">
                <Image src="/assets/images/logo.svg" alt="Trustive" fill priority />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Validation Alerts */}
      {hasAmount && !isCalculating && (
        <div className="space-y-2">
          {isInsufficientBalance && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[0.85rem]">
              <LuTriangleAlert className="h-4 w-4 flex-shrink-0" />
              <span>Insufficient {method} balance for this purchase</span>
            </div>
          )}
          {!isInsufficientBalance && isBelowMin && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[0.85rem]">
              <LuTriangleAlert className="h-4 w-4 flex-shrink-0" />
              <span>Minimum purchase requirement is {effectiveMinLimit.toLocaleString('en-US')} Trustive tokens</span>
            </div>
          )}
          {!isInsufficientBalance && isAboveMax && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[0.85rem]">
              <LuTriangleAlert className="h-4 w-4 flex-shrink-0" />
              <span>Maximum purchase limit is {maxLimit.toLocaleString('en-US')} Trustive tokens</span>
            </div>
          )}
        </div>
      )}

      {/* Status message */}
      {txStatus && !isError && (
        <div className={`px-4 py-3 rounded-xl text-[0.875rem] flex items-start gap-2 ${isSuccess ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-accent/10 border border-accent/20 text-accent'}`}>
          {loading && !isError && <LuLoader className="h-4 w-4 mt-0.5 flex-shrink-0 animate-spin" />}
          <span>{txStatus}</span>
        </div>
      )}

      {/* Buy Button via RainbowKit */}
      <ConnectButton.Custom>
        {({ account: rbAccount, chain, openConnectModal, openChainModal, mounted: rbMounted }) => {
          const connected = rbMounted && rbAccount && chain;

          let btnLabel = 'Buy Now';
          let btnClass = 'bg-[#212E73] hover:bg-[#16225B] text-white shadow-lg shadow-[#212E73]/25 cursor-pointer';
          let isDisabled = false;

          if (!connected) {
            btnLabel = 'Connect Wallet';
            btnClass = 'bg-[#212E73] hover:bg-[#16225B] text-white shadow-md shadow-[#212E73]/20 cursor-pointer';
            isDisabled = false;
          } else if (chain.unsupported) {
            btnLabel = 'Switch to Sepolia';
            btnClass = 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer';
            isDisabled = false;
          } else if (saleLoaded && !isSaleActive) {
            btnLabel = sale?.computed_status === 'scheduled' ? 'Sale Coming Soon' : 'ICO Not Active';
            btnClass = 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed';
            isDisabled = true;
          } else if (loading) {
            btnLabel = 'Processing...';
            btnClass = 'bg-[#212E73]/60 text-white opacity-75 cursor-not-allowed';
            isDisabled = true;
          } else if (!hasAmount) {
            btnLabel = 'Enter Amount';
            btnClass = 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed';
            isDisabled = true;
          } else if (isCalculating) {
            btnLabel = 'Calculating Tokens...';
            btnClass = 'bg-zinc-100 text-zinc-500 border border-zinc-200 cursor-not-allowed';
            isDisabled = true;
          } else if (isInsufficientBalance) {
            btnLabel = `Insufficient ${method} Balance`;
            btnClass = 'bg-red-50 text-red-600 border border-red-200 cursor-not-allowed';
            isDisabled = true;
          } else if (isBelowMin) {
            btnLabel = `Minimum Buy is ${minLimit.toLocaleString('en-US')} Trustive`;
            btnClass = 'bg-amber-50 text-amber-700 border border-amber-200 cursor-not-allowed';
            isDisabled = true;
          } else if (isAboveMax) {
            btnLabel = `Maximum Buy is ${maxLimit.toLocaleString('en-US')} Trustive`;
            btnClass = 'bg-amber-50 text-amber-700 border border-amber-200 cursor-not-allowed';
            isDisabled = true;
          } else if (isInvalidTokenAmount) {
            btnLabel = 'Enter Valid Amount';
            btnClass = 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed';
            isDisabled = true;
          }

          return (
            <button
              type="button"
              onClick={() => {
                if (!connected) { openConnectModal(); return; }
                if (chain.unsupported) { openChainModal(); return; }
                if (isDisabled) return;
                handleBuy();
              }}
              disabled={isDisabled && !!connected && !chain.unsupported}
              className={`w-full flex items-center justify-center gap-2 font-bold py-5 rounded-2xl transition-all shadow-xl active:scale-[0.98] text-[1.125rem] ${btnClass}`}
            >
              {!connected && <LuWallet className="h-5 w-5" />}
              {(loading || (isCalculating && hasAmount)) && <LuLoader className="h-5 w-5 animate-spin" />}
              {btnLabel}
            </button>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
};

export default BuyTokenForm;
