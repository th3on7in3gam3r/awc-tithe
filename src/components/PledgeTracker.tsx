import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import {
  Target,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  Edit3,
  ShieldCheck,
  Heart,
  Clock,
} from 'lucide-react';

interface PledgeTrackerProps {
  onNavigateToGive?: (fundId?: string, suggestedAmount?: number) => void;
  donorId?: string;
}

export const PledgeTracker: React.FC<PledgeTrackerProps> = ({ onNavigateToGive, donorId }) => {
  const {
    pledges,
    funds,
    donors,
    donations,
    createOrUpdatePledge,
    calculatePledgeGap,
  } = useChurch();

  const activeDonorId = donorId || 'donor-104'; // Default to Jerless Montgomery
  const currentDonor = donors.find((d) => d.id === activeDonorId) || donors[0];

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedFundId, setSelectedFundId] = useState<string>(funds[0]?.id || 'fund-tithes');
  const [isEditingPledge, setIsEditingPledge] = useState<boolean>(false);
  const [pledgeAmount, setPledgeAmount] = useState<string>('4200');
  const [pledgeNotes, setPledgeNotes] = useState<string>('Faithful monthly tithing commitment');

  // Find pledge for this donor, fund, and year
  const donorPledges = pledges.filter(
    (p) => p.donorId === currentDonor?.id && p.taxYear === selectedYear
  );
  const activePledge = donorPledges.find((p) => p.fundId === selectedFundId) || donorPledges[0];

  // Overall pledge gap calculations for the congregation
  const gapSummary = calculatePledgeGap(selectedYear);

  const handleSavePledge = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(pledgeAmount);
    if (!amt || amt <= 0 || !currentDonor) return;

    createOrUpdatePledge({
      donorId: currentDonor.id,
      donorName: currentDonor.name,
      donorEmail: currentDonor.email,
      taxYear: selectedYear,
      fundId: selectedFundId,
      committedAmount: amt,
      notes: pledgeNotes,
    });

    setIsEditingPledge(false);
  };

  const getPaceStatus = (pledge: typeof activePledge) => {
    if (!pledge) return null;
    const now = new Date();
    const currentMonthFraction = (now.getMonth() + 1) / 12;
    const expectedByNow = pledge.committedAmount * currentMonthFraction;

    if (pledge.fulfilledAmount >= pledge.committedAmount) {
      return {
        label: 'Commitment Fulfilled!',
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        message: 'You have completely fulfilled your 2026 faith pledge. Thank you for your faithful stewardship!',
      };
    } else if (pledge.fulfilledAmount >= expectedByNow) {
      return {
        label: 'Ahead of Pace',
        color: 'text-church-burgundy bg-church-gold/10 border-church-gold/30 dark:bg-church-burgundy/40 dark:text-church-gold-light dark:border-church-gold/50',
        message: 'Your contributions are currently ahead of your scheduled annual target pace.',
      };
    } else {
      return {
        label: 'In Progress',
        color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        message: 'You are steadily fulfilling your pledge commitment toward year-end.',
      };
    }
  };

  const paceInfo = activePledge ? getPaceStatus(activePledge) : null;
  const remainingToFulfill = activePledge
    ? Math.max(0, activePledge.committedAmount - activePledge.fulfilledAmount)
    : 0;
  const percentComplete = activePledge
    ? Math.min(100, (activePledge.fulfilledAmount / activePledge.committedAmount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      
      {/* Pledge Tracker Main Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        
        {/* Header with Year Selector & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-church-gold-dark dark:text-church-gold" />
              <span className="text-xs font-semibold uppercase tracking-wider text-church-burgundy dark:text-church-gold">
                Annual Faith Commitment
              </span>
            </div>
            <h2 className="font-serif-display text-xl font-bold text-slate-900 dark:text-white mt-1">
              Annual Pledge Tracker ({selectedYear})
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            >
              <option value={2026}>2026 Annual Pledge</option>
              <option value={2025}>2025 Annual Pledge</option>
            </select>

            <button
              onClick={() => {
                setIsEditingPledge(!isEditingPledge);
                if (activePledge) {
                  setPledgeAmount(activePledge.committedAmount.toString());
                  setSelectedFundId(activePledge.fundId);
                  setPledgeNotes(activePledge.notes || '');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-200 transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{activePledge ? 'Adjust Commitment' : 'Make a Commitment'}</span>
            </button>
          </div>
        </div>

        {/* Edit or Create Commitment Form */}
        {isEditingPledge ? (
          <form onSubmit={handleSavePledge} className="mt-6 p-5 rounded-xl border border-church-gold/30 bg-church-gold/10 dark:bg-church-burgundy/20 dark:border-church-gold/30 space-y-4">
            <h3 className="font-serif-display text-sm font-bold text-church-burgundy-dark dark:text-church-gold-light">
              Set Your {selectedYear} Faith Giving Commitment
            </h3>
            <p className="text-xs text-church-burgundy/80 dark:text-church-gold-light/80">
              An annual pledge is a prayerful estimate of giving to help church leadership budget outreach and mission operations. You can adjust this anytime.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Designated Fund
                </label>
                <select
                  value={selectedFundId}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Annual Committed Amount ($)
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Commitment Covenant Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. $350 per month via direct debit for tithes"
                  value={pledgeNotes}
                  onChange={(e) => setPledgeNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-[11px] text-slate-500 font-medium">Quick Annual Presets:</span>
              {[
                { label: '$1,200 ($100/mo)', val: 1200 },
                { label: '$3,000 ($250/mo)', val: 3000 },
                { label: '$4,200 ($350/mo)', val: 4200 },
                { label: '$6,000 ($500/mo)', val: 6000 },
                { label: '$12,000 ($1,000/mo)', val: 12000 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => setPledgeAmount(preset.val.toString())}
                  className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-50 border border-slate-200 rounded text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingPledge(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm"
              >
                Save Faith Commitment
              </button>
            </div>
          </form>
        ) : activePledge ? (
          <div className="mt-6 space-y-6">
            
            {/* Status Pill & Fund */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500">Pledged Toward:</span>
                <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                  {activePledge.fundName}
                </h3>
                {activePledge.notes && (
                  <p className="text-xs text-slate-500 italic mt-0.5">"{activePledge.notes}"</p>
                )}
              </div>

              {paceInfo && (
                <div className={`px-3 py-1 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 self-start sm:self-auto ${paceInfo.color}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{paceInfo.label}</span>
                </div>
              )}
            </div>

            {/* Visual Gauge Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Fulfillment Progress: <strong className="text-slate-900 dark:text-white font-mono">{percentComplete.toFixed(1)}%</strong>
                </span>
                <span className="font-mono text-slate-500">
                  ${activePledge.fulfilledAmount.toLocaleString()} of ${activePledge.committedAmount.toLocaleString()}
                </span>
              </div>
              <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-church-burgundy to-church-burgundy-light dark:from-church-gold-dark dark:to-church-gold rounded-full transition-all duration-700"
                  style={{ width: `${percentComplete}%` }}
                />
              </div>
            </div>

            {/* Financial Numbers Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Annual Commitment
                </span>
                <span className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-1 block">
                  ${activePledge.committedAmount.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  ~${(activePledge.committedAmount / 12).toFixed(0)}/month pace
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Contributed to Date
                </span>
                <span className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1 block">
                  ${activePledge.fulfilledAmount.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  IRS 501(c)(3) tax verified
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Remaining Gap
                </span>
                <span className="font-mono text-xl font-bold text-church-burgundy dark:text-church-gold-light tabular-nums mt-1 block">
                  ${remainingToFulfill.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {remainingToFulfill === 0 ? 'Pledge 100% complete' : 'Balance to year-end'}
                </span>
              </div>
            </div>

            {/* Quick Action Button to Give Toward Pledge */}
            {remainingToFulfill > 0 && onNavigateToGive && (
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between p-4 bg-church-gold/10 dark:bg-church-burgundy/30 rounded-xl border border-church-gold/30 dark:border-church-gold/30 gap-3">
                <div className="text-xs text-church-burgundy-dark dark:text-church-gold-light">
                  <span className="font-bold block">Keep Your Faith Pledge Moving Forward</span>
                  <span className="text-church-burgundy/80 dark:text-church-gold-light/80 text-[11px]">
                    A single gift of ${(remainingToFulfill / 3).toFixed(0)} brings you closer to fulfilling your annual covenant.
                  </span>
                </div>
                <button
                  onClick={() => onNavigateToGive(activePledge.fundId, Number((remainingToFulfill / 3).toFixed(0)))}
                  className="w-full sm:w-auto px-4 py-2 bg-church-burgundy hover:bg-church-burgundy-light text-white font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <span>Give Toward My Pledge</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

          </div>
        ) : (
          <div className="mt-6 text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <Heart className="h-8 w-8 text-church-gold-dark/60 mx-auto mb-2" />
            <h3 className="font-serif-display font-semibold text-sm text-slate-900 dark:text-white">
              No Faith Pledge Registered for {selectedYear}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Commit your prayerful giving goal for this year to help Grace Community Church plan annual ministry missions.
            </p>
            <button
              onClick={() => setIsEditingPledge(true)}
              className="px-4 py-2 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Set My {selectedYear} Commitment
            </button>
          </div>
        )}

      </div>

      {/* Congregational Stewardship Progress (Collective Impact) */}
      <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-church-gold-dark dark:text-church-gold" />
            <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
              Congregational {selectedYear} Pledge Stewardship
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {gapSummary.totalPledgesCount} Families Committed
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">
              Collective Fulfillment Rate: <strong className="text-slate-900 dark:text-white">{gapSummary.percentFulfilled}%</strong>
            </span>
            <span className="font-mono text-slate-500">
              ${gapSummary.totalReceived.toLocaleString()} of ${gapSummary.totalPledged.toLocaleString()} committed
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-church-burgundy-light dark:bg-church-gold rounded-full transition-all duration-700"
              style={{ width: `${gapSummary.percentFulfilled}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Together, our church family has fulfilled ${gapSummary.totalReceived.toLocaleString()} toward our collective ministry covenant.
          </p>
        </div>
      </div>

    </div>
  );
};
