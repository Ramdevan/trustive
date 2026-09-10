import React, { useRef, useEffect, useState } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(2.2);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    // Reset to max size, then shrink until it fits
    let size = 2.2;
    text.style.fontSize = `${size}rem`;

    while (text.scrollWidth > container.clientWidth && size > 0.6) {
      size -= 0.05;
      text.style.fontSize = `${size}rem`;
    }

    setFontSize(size);
  }, [value]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 rounded-2xl bg-white p-5 sm:p-6 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] hover:border-[#212E73]/30 transition-all overflow-hidden min-h-[140px] h-full">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="h-5 w-5 bg-[#212E73] rounded-full flex-shrink-0" />}
        <span className="text-[1rem] font-medium text-zinc-600 truncate whitespace-nowrap overflow-hidden">{title}</span>
      </div>
      <div ref={containerRef} className="flex items-center flex-1 overflow-hidden w-full">
        <div
          ref={textRef}
          className="font-bold tracking-tight text-zinc-900 whitespace-nowrap"
          style={{ fontSize: `${fontSize}rem` }}
        >
          {value}
        </div>
      </div>
    </div>
  );
};

export default StatCard;

