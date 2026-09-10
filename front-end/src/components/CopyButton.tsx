import React, { useState } from 'react';
import { LuCopy, LuCheck } from 'react-icons/lu';
import { toast } from 'react-hot-toast';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  iconClassName?: string;
  successMessage?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  className = '',
  iconClassName = 'h-3.5 w-3.5',
  successMessage = 'Copied to clipboard!'
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(successMessage);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded hover:bg-white/5 ${className}`}
      title={label || 'Copy to clipboard'}
    >
      {copied ? (
        <LuCheck className={`text-emerald-400 ${iconClassName}`} />
      ) : (
        <LuCopy className={iconClassName} />
      )}
    </button>
  );
};

export default CopyButton;
