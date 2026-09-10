import { useState } from 'react';
import { LuLoader } from 'react-icons/lu';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { toast } from 'react-hot-toast';
import { getFriendlyErrorMessage, isUserRejection } from '@/utils/errors';
import { confirmAction } from '@/utils/confirm';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';


interface WithdrawFormProps {
  claimableAmount: string;
  vestingIndex: number;
  onClaim?: () => void;
}

const VESTING_CONTRACT = '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';
const VESTING_ABI = [
  'function claim(uint256 index) external',
  'function claimAll() external'
];

const WithdrawForm: React.FC<WithdrawFormProps> = ({ claimableAmount, vestingIndex, onClaim }) => {
  const { account, signer } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  const handleClaim = async () => {
    if (Number(claimableAmount) <= 0) {
      setStatus('No tokens available to claim');
      setIsError(true);
      return;
    }
    if (!signer) {
      setStatus('Please connect your wallet');
      setIsError(true);
      return;
    }

    if (!(await confirmAction(`Are you sure you want to claim ${Number(claimableAmount).toLocaleString()} Trustive tokens?`))) return;


    setLoading(true);
    setStatus('');
    setIsError(false);
    try {
      const contract = new ethers.Contract(VESTING_CONTRACT, VESTING_ABI, signer);

      setStatus('Confirming transaction in your wallet...');
      const tx = await contract.claim(vestingIndex);

      setStatus('Vesting claim initiated. Waiting for confirmation...');
      await tx.wait();

      // Record the claim so the vesting detail view can show a tx hash per period
      await fetch(`${API_URL}/api/user/vesting/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiary: account,
          vesting_index: vestingIndex,
          tx_hash: tx.hash,
          amount: claimableAmount,
        }),
      }).catch(err => console.error('Claim record error:', err));

      const successMsg = `Successfully claimed ${Number(claimableAmount).toLocaleString()} Trustive!`;
      setStatus(successMsg);
      toast.success(successMsg, { duration: 5000 });
      if (onClaim) onClaim();
    } catch (err: any) {
      if (isUserRejection(err)) {
        setStatus('');
        toast.error('Claim cancelled');
        return;
      }
      console.error("Claim Error:", err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      setIsError(true);
      toast.error(friendlyMsg);
      setStatus(''); // Clear technical status on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-between items-center text-center rounded-2xl bg-card p-6 border border-white/5 h-full min-h-[160px]">
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-[0.875rem] font-bold text-zinc-500 uppercase tracking-widest">Withdraw / Claim</h3>
        <span className="text-[0.65rem] text-zinc-600 font-mono">INDEX: {vestingIndex}</span>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-[0.75rem] text-zinc-500 uppercase tracking-wider">Claimable Now</span>
        <div className="flex items-baseline justify-center gap-2">
            <span className="text-[2.25rem] font-bold text-accent leading-tight tracking-tighter">
            {Number(claimableAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-[1.125rem] font-black text-[#E5A93E] uppercase tracking-wider">Trustive</span>
        </div>
      </div>

      <div className="w-full">
        {status && !isError && (
            <div className="px-3 py-2 mb-3 rounded-lg text-[0.75rem] bg-green-500/10 border border-green-500/20 text-green-400">
            {status}
            </div>
        )}

        <button
            onClick={handleClaim}
            disabled={loading || Number(claimableAmount) <= 0}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-accent/10 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
            {loading && <LuLoader className="h-4 w-4 animate-spin" />}
            Claim Tokens
        </button>
      </div>
    </div>
  );
};

export default WithdrawForm;
