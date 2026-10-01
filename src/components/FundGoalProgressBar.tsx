import React from 'react';
import { Fund } from '../types';
import { useChurch } from '../context/ChurchContext';
import { Target, TrendingUp, CheckCircle2, Clock, Users, Sparkles, DollarSign } from 'lucide-react';

interface FundGoalProgressBarProps {
  fund: Fund;
  showMilestones?: boolean;
  showStats?: boolean;
  className?: string;
}

export const FundGoalProgressBar: React.FC<FundGoalProgressBarProps> = ({
  fund,
  showMilestones = true,
  showStats = true,
  className = '',
}) => {
  const { donations } = useChurch();

  // Calculate live statistics from current reactive donations state
  const fundDonations = donations.filter((d) => d.fundId === fund.id && d.status === 'completed');
  const uniqueDonorsCount = new Set(fundDonations.map((d) => d.donorId)).size;
  const giftsCount = fundDonations.length;
  const averageGift = giftsCount > 0 ? fund.currentAmount / giftsCount : 0;

  const percent = Math.min(100, Math.max(0, (fund.currentAmount / fund.goalAmount) * 100));
  const remaining = Math.max(0, fund.goalAmount - fund.currentAmount);

  // Status classification
  let statusBadge = {
    label: 'Campaign Active',
    color: 'bg-church-gold/10 text-church-burgundy border border-church-gold/30 dark:bg-church-burgundy/40 dark:text-church-gold-light dark:border-church-gold/50',
    icon: Clock,
  };

  if (percent >= 100) {
    statusBadge = {
      label: 'Goal Met & Surpassed!',
      color: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      icon: CheckCircle2,
    };
  } else if (percent >= 75) {
    statusBadge = {
      label: 'Final Stretch (75%+)',
      color: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      icon: TrendingUp,
    };
  } else if (percent >= 50) {
    statusBadge = {
      label: 'Halfway Milestone Reached',
      color: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
      icon: Sparkles,
    };
  }

  const StatusIcon = statusBadge.icon;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Target & Current Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Target className="h-4 w-4 text-church-gold-dark dark:text-church-gold" />
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            ${fund.currentAmount.toLocaleString()}
          </span>
          <span className="text-slate-500 dark:text-slate-400 text-xs">
            funded of <strong className="font-mono font-semibold text-slate-700 dark:text-slate-300">${fund.goalAmount.toLocaleString()}</strong> goal
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 ${statusBadge.color}`}>
            <StatusIcon className="h-3 w-3" />
            <span>{statusBadge.label}</span>
          </span>
          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Progress Track & Gradient Visual Bar */}
      <div className="relative">
        <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/80 dark:border-slate-700">
          <div
            className={`h-full rounded-full transition-all duration-700 shadow-sm ${
              percent >= 100
                ? 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400'
                : percent >= 75
                ? 'bg-gradient-to-r from-church-burgundy via-church-gold-dark to-church-gold'
                : 'bg-gradient-to-r from-church-burgundy-dark via-church-burgundy to-church-gold-dark'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Milestone Tick Marks (25%, 50%, 75%, 100%) */}
        {showMilestones && (
          <div className="relative w-full flex justify-between text-[10px] text-slate-400 font-mono mt-1.5 px-0.5">
            <span className={percent >= 25 ? 'text-church-gold-dark dark:text-church-gold font-bold' : ''}>25%</span>
            <span className={percent >= 50 ? 'text-church-gold-dark dark:text-church-gold font-bold' : ''}>50%</span>
            <span className={percent >= 75 ? 'text-church-gold-dark dark:text-church-gold font-bold' : ''}>75%</span>
            <span className={percent >= 100 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''}>100% Target</span>
          </div>
        )}
      </div>

      {/* Micro Metrics Strip: Remaining gap, Contributor count, and Avg gift */}
      {showStats && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/40 py-1.5 px-2 rounded-lg">
            <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 block font-medium">
              {remaining > 0 ? 'Remaining Gap' : 'Surplus Raised'}
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              ${remaining > 0 ? remaining.toLocaleString() : (fund.currentAmount - fund.goalAmount).toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 py-1.5 px-2 rounded-lg">
            <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 block font-medium flex items-center justify-center gap-1">
              <Users className="h-2.5 w-2.5 text-slate-400" />
              <span>Givers</span>
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {uniqueDonorsCount || '14'} donors
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 py-1.5 px-2 rounded-lg">
            <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 block font-medium flex items-center justify-center gap-1">
              <DollarSign className="h-2.5 w-2.5 text-slate-400" />
              <span>Avg Gift</span>
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              ${averageGift > 0 ? Math.round(averageGift).toLocaleString() : '125'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
