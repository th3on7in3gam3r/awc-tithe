import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { useChurch } from '../context/ChurchContext';
import { donorCohorts, type Cohort } from '../lib/givingAnalytics';

const COLORS: Record<Cohort['key'], string> = {
  recurring: '#4A0404',
  repeat: '#78716c',
  'first-time': '#c4bdb6',
};

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as Cohort;
  return (
    <div className="bg-slate-900 text-white px-3 py-2.5 rounded-lg shadow-lg text-xs space-y-1 min-w-[180px]">
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
        <span className="font-medium">{data.name}</span>
        <span className="font-mono text-white/80">{data.percent}%</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-300">
        <span>Donors</span>
        <span className="font-mono text-white">{data.count}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-300">
        <span>Giving</span>
        <span className="font-mono text-white">{money(data.totalAmount)}</span>
      </div>
    </div>
  );
};

/** Real donors grouped by how they give. Empty until the first gift. */
export const DonorTenurePieChart: React.FC = () => {
  const { donors } = useChurch();
  const cohorts = React.useMemo(() => donorCohorts(donors), [donors]);
  const totalDonors = cohorts.reduce((s, c) => s + c.count, 0);
  const totalGiving = cohorts.reduce((s, c) => s + c.totalAmount, 0);
  const chartData = cohorts.filter((c) => c.count > 0);

  return (
    <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-5 border-b border-[#E8E2D9] dark:border-slate-800 gap-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Givers
          </span>
          <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mt-1">
            How people give
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {totalDonors === 1 ? '1 giver' : `${totalDonors} givers`} in the ledger.
          </p>
        </div>
        <div className="self-start sm:self-auto text-xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 block font-medium">Lifetime giving</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-white text-base tabular-nums mt-1 block">
            {money(totalGiving)}
          </span>
        </div>
      </div>

      {totalDonors === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-[#E8E2D9] dark:border-slate-700 py-14 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No givers yet</p>
          <p className="mt-1 text-xs text-slate-500">Givers appear here after their first confirmed gift.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <div className="w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={94}
                    paddingAngle={chartData.length > 1 ? 3 : 0}
                    stroke="#FFFCF8"
                    strokeWidth={2}
                  >
                    {chartData.map((c) => (
                      <Cell key={c.key} fill={COLORS[c.key]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase text-slate-400 font-medium tracking-wider">Givers</span>
                <span className="font-serif-display text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
                  {totalDonors}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 divide-y divide-[#E8E2D9] dark:divide-slate-800">
            {cohorts.map((c) => (
              <div key={c.key} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 text-xs">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[c.key] }} />
                    <h4 className="font-medium text-slate-900 dark:text-white">{c.name}</h4>
                    <span className="font-mono tabular-nums text-slate-400">{c.percent}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">{c.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-semibold text-slate-900 dark:text-white block tabular-nums">
                    {c.count} {c.count === 1 ? 'giver' : 'givers'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 block tabular-nums">{money(c.totalAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
