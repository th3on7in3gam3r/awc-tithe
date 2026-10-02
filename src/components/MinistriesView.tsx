import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { FundGoalProgressBar } from './FundGoalProgressBar';
import { Target, Users, Globe2, HeartHandshake, ArrowRight, Sparkles, Building2, ShieldCheck, Heart } from 'lucide-react';

interface MinistriesViewProps {
  onSelectFundToGive: (fundId: string) => void;
}

export const MinistriesView: React.FC<MinistriesViewProps> = ({ onSelectFundToGive }) => {
  const { funds, donations } = useChurch();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const completedDonations = donations.filter((d) => d.status === 'completed');
  const giftRaisedByFund = completedDonations.reduce<Record<string, number>>((acc, d) => {
    acc[d.fundId] = (acc[d.fundId] || 0) + d.amount;
    return acc;
  }, {});
  // Prefer sum of completed gifts when present; else fund.currentAmount
  const totalGoalAllFunds = funds.reduce((sum, f) => sum + f.goalAmount, 0);
  const totalRaisedAllFunds = funds.reduce((sum, f) => {
    const fromGifts = giftRaisedByFund[f.id];
    return sum + (fromGifts !== undefined && fromGifts > 0 ? fromGifts : f.currentAmount);
  }, 0);
  const totalPercent = totalGoalAllFunds > 0 ? (totalRaisedAllFunds / totalGoalAllFunds) * 100 : 0;
  const totalContributorsCount = new Set(completedDonations.map((d) => d.donorId)).size;

  const categories = [
    { id: 'all', label: 'All Funds & Missions' },
    { id: 'General', label: 'General Tithes', icon: Users },
    { id: 'Capital', label: 'Building & Facilities', icon: Building2 },
    { id: 'Missions', label: 'Global Missions', icon: Globe2 },
    { id: 'Outreach', label: 'Community Benevolence', icon: HeartHandshake },
  ];

  const filteredFunds =
    selectedCategory === 'all'
      ? funds
      : funds.filter((f) => f.category.toLowerCase() === selectedCategory.toLowerCase());

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'General':
        return <Users className="h-4 w-4 text-church-gold-dark" />;
      case 'Capital':
        return <Building2 className="h-4 w-4 text-blue-700" />;
      case 'Missions':
        return <Globe2 className="h-4 w-4 text-emerald-700" />;
      case 'Outreach':
        return <HeartHandshake className="h-4 w-4 text-rose-700" />;
      default:
        return <Users className="h-4 w-4 text-church-gold-dark" />;
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Banner */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-church-burgundy dark:text-church-gold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Kingdom Stewardship Campaigns</span>
            </span>
            <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mt-1">
              Ministries, Missions &amp; Financial Targets
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              Every dollar contributed to Anointed Worship Center is prayerfully stewarded under strict non-profit governance.
              Track how close each specific ministry fund is to meeting its annual financial goal in real time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectFundToGive(funds[0]?.id || 'fund-tithes')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <Heart className="h-4 w-4" />
              <span>Make a Contribution</span>
            </button>
          </div>
        </div>

        {/* Global Progress Summary Card */}
        <div className="mt-8 bg-gradient-to-br from-slate-900 via-slate-800 to-church-burgundy-dark text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-church-gold/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            <div className="md:col-span-2 space-y-3">
              <span className="text-xs uppercase tracking-widest text-church-gold-light font-semibold flex items-center gap-1.5">
                <Target className="h-4 w-4" />
                <span>2026 Combined Church Ministry Budget</span>
              </span>
              <div className="flex items-baseline gap-3">
                <span className="font-serif-display text-3xl sm:text-4xl font-bold tracking-tight">
                  ${totalRaisedAllFunds.toLocaleString()}
                </span>
                <span className="text-sm text-slate-300">
                  received of <strong className="font-semibold text-white">${totalGoalAllFunds.toLocaleString()}</strong> goal
                </span>
              </div>

              {/* Combined Progress Bar */}
              <div className="space-y-1.5 pt-2">
                <div className="h-3 w-full bg-slate-700/60 rounded-full overflow-hidden p-0.5 border border-slate-600/50">
                  <div
                    className="h-full bg-gradient-to-r from-church-burgundy via-church-gold to-emerald-400 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, totalPercent)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-300 font-mono">
                  <span>{totalPercent.toFixed(1)}% of Annual Vision Funded</span>
                  <span>${Math.max(0, totalGoalAllFunds - totalRaisedAllFunds).toLocaleString()} Remaining</span>
                </div>
              </div>
            </div>

            {/* Quick KPI Callouts */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2 border-t md:border-t-0 md:border-l border-slate-700/70 md:pl-8 pt-4 md:pt-0">
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Active Campaigns</span>
                <span className="font-mono text-2xl font-bold text-white mt-1 block">
                  {funds.length} Funds
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">100% 501(c)(3) Eligible</span>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Kingdom Givers</span>
                <span className="font-mono text-2xl font-bold text-church-gold-light mt-1 block">
                  {totalContributorsCount} donor{totalContributorsCount === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {totalContributorsCount === 0 ? 'No completed gifts yet' : 'Completed gifts on record'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              selectedCategory === cat.id
                ? 'bg-church-burgundy text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
            }`}
          >
            {cat.icon && <cat.icon className="h-3.5 w-3.5" />}
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Funds Grid with Visual Goal Progress Bars */}
      {filteredFunds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-12 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">No ministry funds in this category yet.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {filteredFunds.map((fund) => {
          return (
            <div
              key={fund.id}
              className="bg-[#FFFCF8] dark:bg-slate-900 rounded-2xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
            >
              <div>
                {/* Fund Image with Banner */}
                <div className="h-52 relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={fund.image || '/assets/images/church_sanctuary_hero_1790791320226.jpg'}
                    alt={fund.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent" />
                  <span className="absolute top-3 right-3 text-[10px] font-mono tracking-wide text-white/55">
                    {fund.code}
                  </span>
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-white/95 text-slate-900 rounded-lg backdrop-blur-sm shadow-sm">
                      {getCategoryIcon(fund.category)}
                      <span>{fund.category}</span>
                    </span>
                  </div>
                </div>

                {/* Fund Details & Progress */}
                <div className="p-7 sm:p-8">
                  <h3 className="font-serif-display text-xl font-bold text-slate-900 dark:text-white">
                    {fund.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                    {fund.description}
                  </p>

                  {/* Visual Goal Progress Bar pulling reactive data from state */}
                  <div className="mt-7 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <FundGoalProgressBar fund={fund} showMilestones={true} showStats={true} />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="px-7 sm:px-8 pb-7 sm:pb-8 pt-0">
                <button
                  onClick={() => onSelectFundToGive(fund.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl dark:bg-church-burgundy dark:hover:bg-church-burgundy-light transition-colors shadow-sm"
                >
                  <span>Contribute to {fund.name}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Stewardship Governance Guarantee Footer */}
      <div className="p-5 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
        <ShieldCheck className="h-6 w-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
        <p className="leading-relaxed">
          <strong className="font-semibold text-slate-900 dark:text-white">Designated Giving Protection:</strong> In accordance with IRS regulations and church bylaws, contributions designated for a specific fund are restricted solely to the declared purpose. The stewardship board publishes verified quarterly audits.
        </p>
      </div>
    </div>
  );
};
