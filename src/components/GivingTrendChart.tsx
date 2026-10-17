import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import { useChurch } from '../context/ChurchContext';
import { monthlyGiving, recurringMonthlyRunRate, type MonthPoint } from '../lib/givingAnalytics';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as MonthPoint;
  return (
    <div className="bg-slate-900 text-white px-3 py-2.5 rounded-lg shadow-lg text-xs space-y-1 min-w-[180px]">
      <p className="font-medium text-white/90 pb-1 border-b border-white/10">{label}</p>
      <div className="flex justify-between gap-4 text-slate-300">
        <span>All giving</span>
        <span className="font-mono text-white">{money(data.total)}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-300">
        <span>Recurring</span>
        <span className="font-mono text-white">{money(data.recurring)}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-400 text-[11px]">
        <span>Givers</span>
        <span className="font-mono">{data.givers}</span>
      </div>
    </div>
  );
};

export const GivingTrendChart: React.FC = () => {
  const { donations, donors } = useChurch();
  const data = monthlyGiving(donations);
  const runRate = recurringMonthlyRunRate(donors);
  const twelveMonthTotal = data.reduce((s, p) => s + p.total, 0);
  const hasData = twelveMonthTotal > 0;

  return (
    <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-5 border-b border-[#E8E2D9] dark:border-slate-800 gap-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Giving by month
          </span>
          <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mt-1">
            Last 12 months
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Completed gifts from every method. Pending and refunded gifts are not counted.
          </p>
        </div>

        <div className="flex items-end gap-8 self-start sm:self-auto text-xs">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 block font-medium">
              12-month total
            </span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white text-base tabular-nums mt-1 block">
              {money(twelveMonthTotal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 block font-medium">
              Recurring per month
            </span>
            <span className="font-mono font-semibold text-church-burgundy dark:text-church-gold text-base tabular-nums mt-1 block">
              {money(runRate)}
            </span>
          </div>
        </div>
      </div>

      {hasData ? (
        <div className="mt-8 w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E2D9" opacity={0.45} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
                width={48}
              />
              <RechartsTooltip content={<ChartTooltip />} />
              <RechartsLegend
                verticalAlign="top"
                align="right"
                iconType="line"
                wrapperStyle={{ paddingBottom: '16px', fontSize: '11px', color: '#64748b' }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="All giving"
                stroke="#4A0404"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#4A0404', stroke: '#fff', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="recurring"
                name="Recurring"
                stroke="#78716c"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3.5, fill: '#78716c' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-[#E8E2D9] dark:border-slate-700 py-14 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No completed gifts yet</p>
          <p className="mt-1 text-xs text-slate-500">This chart fills in as gifts are confirmed.</p>
        </div>
      )}
    </div>
  );
};
