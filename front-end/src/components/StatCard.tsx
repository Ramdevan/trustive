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
    <div className="flex flex-col gap-3 sm:gap-4 rounded-2xl bg-card p-5 sm:p-6 border border-white/5 hover:border-accent/20 transition-all overflow-hidden min-h-[140px] h-full">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="h-5 w-5 bg-accent rounded-full flex-shrink-0" />}
        <span className="text-[1rem] font-medium text-[#FAF7F2] truncate whitespace-nowrap overflow-hidden">{title}</span>
      </div>
      <div ref={containerRef} className="flex items-center flex-1 overflow-hidden w-full">
        <div
          ref={textRef}
          className="font-semibold tracking-tight text-[#FAF7F2] whitespace-nowrap"
          style={{ fontSize: `${fontSize}rem` }}
        >
          {value}
        </div>
      </div>
    </div>
  );
};

export default StatCard;

