import { useEffect, useState, useRef } from 'react';
import { LuChevronDown } from 'react-icons/lu';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useWeb3 } from '@/context/Web3Context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthData { month: string; value: number; }

function buildYearlyData(transactions: { ptc_tokens?: string; created_at_utc?: string; created_at?: string }[], year: string): MonthData[] {
  const monthly = Array(12).fill(0) as number[];
  transactions.forEach(tx => {
    const date = new Date(tx.created_at_utc || tx.created_at || '');
    if (isNaN(date.getTime())) return;
    if (date.getFullYear().toString() !== year) return;
    monthly[date.getMonth()] += parseFloat(tx.ptc_tokens || '0');
  });
  return MONTHS.map((m, i) => ({ month: m, value: Math.round(monthly[i]) }));
}

const DashboardChart: React.FC = () => {
  const { account } = useWeb3();
  const [allYears, setAllYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [chartData, setChartData] = useState<MonthData[]>(MONTHS.map(m => ({ month: m, value: 0 })));
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
  const [rawTxs, setRawTxs] = useState<{ ptc_tokens?: string; created_at_utc?: string; created_at?: string }[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsYearMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!account) return;
    fetch(`${API_URL}/api/user/getUserData?address=${account}`)
      .then(r => r.json())
      .then(d => {
        const txs: typeof rawTxs = Array.isArray(d.transactions) ? d.transactions : [];
        setRawTxs(txs);

        // Collect unique years from transactions
        const yearSet = new Set<string>();
        yearSet.add(new Date().getFullYear().toString());
        txs.forEach(tx => {
          const date = new Date(tx.created_at_utc || tx.created_at || '');
          if (!isNaN(date.getTime())) yearSet.add(date.getFullYear().toString());
        });
        const years = Array.from(yearSet).sort().reverse();
        setAllYears(years);
        setSelectedYear(years[0]);
        setChartData(buildYearlyData(txs, years[0]));
      })
      .catch(err => console.error('DashboardChart fetch error:', err));
  }, [account]);

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setChartData(buildYearlyData(rawTxs, year));
    setIsYearMenuOpen(false);
  };

  const maxVal = Math.max(...chartData.map(d => d.value), 100);
  const tickMax = Math.ceil(maxVal / 250) * 250;
  const ticks = [0, tickMax / 4, tickMax / 2, (3 * tickMax) / 4, tickMax].map(Math.round);

  return (
    <div className="rounded-3xl bg-white p-8 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col gap-10 flex-[1.5] min-h-[500px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[2.25rem] md:text-[2.5rem] font-bold text-zinc-900 tracking-tight">Tokens Purchased</h3>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsYearMenuOpen(!isYearMenuOpen)}
            className="flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-[0.875rem] text-zinc-700 border border-zinc-200 hover:bg-zinc-200 transition-all cursor-pointer min-w-[120px] justify-between"
          >
            Year: {selectedYear}
            <LuChevronDown className={`h-4 w-4 transition-transform ${isYearMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isYearMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-full bg-white border border-zinc-200 rounded-xl overflow-hidden z-50 shadow-xl">
              {allYears.map(year => (
                <button
                  key={year}
                  onClick={() => handleYearChange(year)}
                  className={`w-full text-left px-4 py-2.5 text-[0.875rem] transition-colors hover:bg-zinc-100 ${selectedYear === year ? 'text-[#212E73] font-bold bg-blue-50/50' : 'text-zinc-700'}`}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full h-full min-h-[320px] pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
            barSize={40}
          >
            <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="0" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 13, fontWeight: 500 }} dy={15} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748B', fontSize: 13, fontWeight: 500 }}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
              domain={[0, tickMax]}
              ticks={ticks}
            />
            <Tooltip
              cursor={{ fill: 'rgba(33,46,115,0.04)' }}
              contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '12px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}
              itemStyle={{ color: '#212E73', fontWeight: 'bold' }}
              labelStyle={{ color: '#64748B', marginBottom: '4px' }}
              formatter={(v) => [
                `${Number(v ?? 0).toLocaleString()} Trustive`,
                "Purchased",
              ]}
            />
            <Bar dataKey="value" radius={[20, 20, 20, 20]}>
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={chartData[index].value > 0 && index === chartData.reduce((best, d, i) => d.value > chartData[best].value ? i : best, 0) ? '#212E73' : chartData[index].value > 0 ? '#4353A4' : '#E2E4E9'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DashboardChart;
