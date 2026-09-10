import React, { useState, useEffect } from 'react';
import Countdown, { CountdownRenderProps } from 'react-countdown';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type SaleStatus = 'active' | 'scheduled' | 'ended' | 'none' | 'loading';

const CountdownTimer: React.FC = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('loading');
  const [label, setLabel] = useState('Sale Ends In');

  const fetchSaleData = () => {
    fetch(`${API_URL}/api/user/getActiveSale`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.sale) {
          const sale = d.sale;
          const status = sale.computed_status as string;

          if (status === 'active') {
            setTargetDate(new Date(sale.end_at_utc));
            setSaleStatus('active');
            setLabel('Sale Ends In');
          } else if (status === 'scheduled') {
            setTargetDate(new Date(sale.start_at_utc));
            setSaleStatus('scheduled');
            setLabel('Sale Starts On');
          } else {
            setSaleStatus('ended');
            setTargetDate(null);
            setLabel('');
          }
        } else {
          setSaleStatus('none');
          setTargetDate(null);
          setLabel('');
        }
      })
      .catch(() => {
        setSaleStatus('none');
        setTargetDate(null);
        setLabel('');
      });
  };

  useEffect(() => {
    setIsMounted(true);
    fetchSaleData();
  }, []);

  const TimeBlock = ({ value, label: blockLabel }: { value: string; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="text-[3.5rem] sm:text-[5.5rem] md:text-[6.5rem] font-medium leading-none font-sans tracking-tighter bg-gradient-to-b from-accent via-accent to-accent/70 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-[1rem] sm:text-[1.25rem] md:text-[1.5rem] font-normal text-zinc-500 mt-2">
        {blockLabel}
      </div>
    </div>
  );

  const Divider = () => (
    <div className="text-[2rem] sm:text-[4rem] md:text-[5rem] font-medium leading-none text-accent/40 pt-4">
      :
    </div>
  );

  const ZeroState = () => (
    <div className="flex items-start justify-center gap-2 sm:gap-4 md:gap-6 py-8">
      <TimeBlock value="00" label="Days" />
      <Divider />
      <TimeBlock value="00" label="Hours" />
      <Divider />
      <TimeBlock value="00" label="Minutes" />
      <Divider />
      <TimeBlock value="00" label="Seconds" />
    </div>
  );

  const renderer = ({ days, hours, minutes, seconds, completed }: CountdownRenderProps) => {
    const fmt = (n: number) => n.toString().padStart(2, '0');

    if (completed) {
      if (saleStatus === 'scheduled') {
        // Transition from scheduled to active
        setTimeout(fetchSaleData, 1000);
        return <div className="animate-pulse py-8 text-center text-accent/50 font-bold uppercase tracking-widest text-2xl">Sale Opening...</div>;
      }
      return <ZeroState />;
    }

    return (
      <div className="flex items-start justify-center gap-2 sm:gap-4 md:gap-6 py-8">
        <TimeBlock value={fmt(days)} label="Days" />
        <Divider />
        <TimeBlock value={fmt(hours)} label="Hours" />
        <Divider />
        <TimeBlock value={fmt(minutes)} label="Minutes" />
        <Divider />
        <TimeBlock value={fmt(seconds)} label="Seconds" />
      </div>
    );
  };

  if (!isMounted || saleStatus === 'loading' || (saleStatus !== 'active' && saleStatus !== 'scheduled') || !targetDate) {
    return null;
  }

  return (
    <div className="w-full select-none text-center">
      {label && (
        <p className="text-zinc-600 font-bold uppercase tracking-[0.3em] text-[0.7rem] sm:text-[0.85rem] mb-2">{label}</p>
      )}
      <Countdown date={targetDate} renderer={renderer} />
    </div>
  );
};

export default CountdownTimer;
