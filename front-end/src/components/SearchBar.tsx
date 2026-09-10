import React from 'react';
import { LuSearch } from 'react-icons/lu';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = "Search by transaction hash...", className = "" }) => {
    return (
        <div className={`relative ${className}`}>
            <LuSearch className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white border border-zinc-200/90 rounded-xl pl-11 pr-4 py-3 text-[0.875rem] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#212E73] focus:ring-2 focus:ring-[#212E73]/10 transition-all shadow-sm hover:border-zinc-300"
            />
        </div>
    );
};

export default SearchBar;
