"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
    text: string;
    label?: string;
    className?: string;
    iconClassName?: string;
    successMessage?: string;
}

export function CopyButton({
    text,
    label,
    className,
    iconClassName,
    successMessage = "Copied to clipboard!"
}: CopyButtonProps) {
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
            className={cn(
                "inline-flex items-center justify-center text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded-md hover:bg-white/5",
                className
            )}
            title={label || "Copy to clipboard"}
        >
            {copied ? (
                <Check className={cn("w-3.5 h-3.5 text-emerald-400", iconClassName)} />
            ) : (
                <Copy className={cn("w-3.5 h-3.5", iconClassName)} />
            )}
        </button>
    );
}

export default CopyButton;
