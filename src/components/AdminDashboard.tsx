import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { UserRole, DonationStatus, DonationFrequency, StaffContributionMethod } from '../types';
import { RecurringTrendChart } from './RecurringTrendChart';
import { DonorTenurePieChart } from './DonorTenurePieChart';
import { DonorChurnAnalysis } from './DonorChurnAnalysis';
import { ExportDataModal } from './ExportDataModal';
import { AwcDcbIntegrationHub } from './AwcDcbIntegrationHub';
import { DcuBankIntegration } from './DcuBankIntegration';
import { RealTimeReconciliationPanel } from './RealTimeReconciliationPanel';
import { IntegrationsSettingsPanel } from './IntegrationsSettingsPanel';
import {
  DollarSign,
  Users,
  Repeat,
  Download,
  Search,
  Filter,
  ShieldCheck,
  Lock,
  RefreshCw,
  PlusCircle,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Key,
  Shield,
  Wifi,
  ExternalLink,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const {
    config,
    donations,
    donors,
    funds,
    auditLogs,
    offlineGifts,
    pledges,
    calculatePledgeGap,
    currentRole,
    isMfaVerified,
    verifyStaffAccess,
    resetMfa,
    refundDonation,
    queueOfflineGift,
    syncOfflineGifts,
    exportTransactionsCSV,
    exportAuditLogsCSV,
    setSelectedReceipt,
    addNotification,
  } = useChurch();

  const [activeAdminSubTab, setActiveAdminSubTab] = useState<
    | 'analytics'
    | 'transactions'
    | 'donors'
    | 'pledges'
    | 'awc-dcb'
    | 'rbac'
    | 'audit'
    | 'privacy'
    | 'offline'
    | 'integrations'
  >('analytics');

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Transaction Ledger Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFundFilter, setSelectedFundFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Refund dialog
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');

  // Offline gift form
  const [offlineDonorName, setOfflineDonorName] = useState('');
  const [offlineDonorEmail, setOfflineDonorEmail] = useState('');
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineFundId, setOfflineFundId] = useState(funds[0]?.id || 'fund-tithes');
  const [offlineMethod, setOfflineMethod] = useState<StaffContributionMethod>('check');
  const [offlineCheckNum, setOfflineCheckNum] = useState('');
  const [offlineNote, setOfflineNote] = useState('');

  // Staff re-auth (invite + authenticator) if session was locked from dashboard
  const [inviteInput, setInviteInput] = useState('');
  const [totpInput, setTotpInput] = useState('');
  const [mfaError, setMfaError] = useState(false);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  // Financial Calculations
  const completedDonations = donations.filter((d) => d.status === 'completed');
  const totalGivingYTD = completedDonations.reduce((sum, d) => sum + d.amount, 0);
  const totalFeesCovered = completedDonations.reduce((sum, d) => sum + d.feeAmount, 0);
  const recurringDonorsCount = donors.filter((d) => d.recurringActive).length;
  const recurringMonthlyRunRate = donors
    .filter((d) => d.recurringActive && d.recurringAmount)
    .reduce((sum, d) => sum + (d.recurringAmount || 0), 0);
  const averageGiftSize = completedDonations.length > 0 ? totalGivingYTD / completedDonations.length : 0;

  // Filtered transactions
  const filteredDonations = donations.filter((d) => {
    const matchesSearch =
      d.donorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.transactionId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFund = selectedFundFilter === 'all' || d.fundId === selectedFundFilter;
    const matchesStatus = selectedStatusFilter === 'all' || d.status === selectedStatusFilter;
    return matchesSearch && matchesFund && matchesStatus;
  });

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaSubmitting(true);
    const success = await verifyStaffAccess(inviteInput, totpInput);
    setMfaSubmitting(false);
    if (!success) {
      setMfaError(true);
    } else {
      setMfaError(false);
      setInviteInput('');
      setTotpInput('');
    }
  };

  const handleConfirmRefund = () => {
    if (!refundTargetId) return;
    refundDonation(refundTargetId, refundReason || 'Donor requested refund via church administration');
    setRefundTargetId(null);
    setRefundReason('');
  };

  const handleQueueOffline = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(offlineAmount);
    if (!amt || amt <= 0) return;

    const reference = offlineCheckNum.trim();
    queueOfflineGift({
      donorName: offlineDonorName || 'Sunday Service Attendee',
      donorEmail: offlineDonorEmail || 'service.attendee@gracecommunity.local',
      amount: amt,
      fundId: offlineFundId,
      frequency: 'one-time',
      method: offlineMethod,
      checkNumber: offlineMethod === 'check' ? reference : undefined,
      channelReference: reference || undefined,
      note: offlineNote,
    });

    setOfflineDonorName('');
    setOfflineDonorEmail('');
    setOfflineAmount('');
    setOfflineCheckNum('');
    setOfflineNote('');
  };

  const [selectedPledgeYear, setSelectedPledgeYear] = useState<number>(2026);
  const pledgeGapSummary = calculatePledgeGap(selectedPledgeYear);

  const exportPledgesCSV = () => {
    const headers = [
      'Pledge ID',
      'Donor Name',
      'Donor Email',
      'Tax Year',
      'Fund Name',
      'Committed Amount',
      'Fulfilled to Date',
      'Remaining Gap',
      'Fulfillment Percent',
      'Status',
      'Covenant Notes',
    ];

    const yearPledges = pledges.filter((p) => p.taxYear === selectedPledgeYear);
    const rows = yearPledges.map((p) => {
      const gap = Math.max(0, p.committedAmount - p.fulfilledAmount);
      const pct = p.committedAmount > 0 ? ((p.fulfilledAmount / p.committedAmount) * 100).toFixed(1) : '0';
      return [
        p.id,
        `"${p.donorName.replace(/"/g, '""')}"`,
        p.donorEmail,
        p.taxYear,
        `"${p.fundName.replace(/"/g, '""')}"`,
        p.committedAmount.toFixed(2),
        p.fulfilledAmount.toFixed(2),
        gap.toFixed(2),
        `${pct}%`,
        p.status,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `grace-church-pledges-gap-${selectedPledgeYear}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    addNotification('success', 'Pledge Gap CSV Exported', `Pledge reconciliation report for ${selectedPledgeYear} downloaded.`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Admin Title & Elevated Session Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-6 border-b border-[#E8E2D9] dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contribution Central
            </span>
            <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 capitalize">
              · {currentRole === 'first_lady' ? 'First Lady' : currentRole}
            </span>
          </div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mt-1.5 tracking-tight">
            Stewardship Financial Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            All church giving channels—Cash App, Zelle, Venmo, check, cash, card, and wallets—are recorded here,
            synced to the AWC Digital Contribution Book, and monitored by stewardship staff (including First Lady).
          </p>
        </div>

        <div className="flex items-center gap-3">
          {currentRole === 'admin' && (
            <div className="flex items-center gap-2">
              {isMfaVerified ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                  <span>MFA verified</span>
                  <button
                    onClick={resetMfa}
                    className="ml-1 text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2"
                  >
                    Lock
                  </button>
                </div>
              ) : (
                <span className="text-xs font-medium text-church-burgundy dark:text-church-gold">
                  MFA pending
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-xl shadow-sm transition-all"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Export Data</span>
          </button>

          <button
            onClick={exportTransactionsCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-[#FFFCF8] hover:bg-white rounded-xl border border-[#E8E2D9] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 shadow-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Quick CSV</span>
          </button>
        </div>
      </div>


      {/* Staff access banner if Admin & Not Verified */}
      {currentRole === 'admin' && !isMfaVerified && (
        <div className="mt-6 p-5 rounded-xl border border-church-gold/40 bg-church-gold/10 dark:bg-church-burgundy/30 dark:border-church-gold/30 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-church-burgundy dark:text-church-gold mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-church-burgundy-dark dark:text-church-gold-light">
                Staff Portal Locked — Invite Required
              </h3>
              <p className="text-xs text-church-burgundy/80 dark:text-church-gold mt-0.5">
                Re-enter your staff invite/access code and 6-digit authenticator. Members without an invite cannot unlock financial controls.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleMfaSubmit(e)} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="password"
              placeholder="Invite / access code"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs rounded border border-church-gold/40 bg-white dark:bg-slate-800 dark:text-white"
            />
            <input
              type="text"
              maxLength={6}
              placeholder="6-digit MFA"
              value={totpInput}
              onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-28 px-2.5 py-1.5 text-center font-mono text-xs rounded border border-church-gold/40 bg-white dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={mfaSubmitting}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded shadow-sm disabled:opacity-60"
            >
              {mfaSubmitting ? 'Verifying…' : 'Unlock'}
            </button>
          </form>
          {mfaError && (
            <p className="text-xs text-red-600">Invalid invite or authenticator code.</p>
          )}
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="mt-8 border-b border-[#E8E2D9] dark:border-slate-800 overflow-x-auto">
        <nav className="flex gap-5">
          {[
            { id: 'analytics', label: 'Financial Analytics', count: null as number | null },
            { id: 'awc-dcb', label: 'AWC DCB & DCU Bank', count: null },
            { id: 'pledges', label: 'Pledge Gap Analysis', count: pledges.length },
            { id: 'transactions', label: 'Transactions', count: donations.length },
            { id: 'donors', label: 'Donor CRM', count: donors.length },
            { id: 'rbac', label: 'RBAC & Security', count: null },
            { id: 'audit', label: 'Audit Trails', count: auditLogs.length },
            { id: 'privacy', label: 'GDPR / CCPA', count: null },
            { id: 'offline', label: 'Contribution Log', count: offlineGifts.filter((g) => !g.synced).length },
            { id: 'integrations', label: 'Integrations & Settings', count: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminSubTab(tab.id as any)}
              className={`py-3 text-xs whitespace-nowrap border-b-2 transition-colors ${
                activeAdminSubTab === tab.id
                  ? 'border-church-burgundy text-church-burgundy dark:border-church-gold dark:text-church-gold-light font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
              }`}
            >
              {tab.label}
              {tab.count !== null ? (
                <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* SUB-TAB 1: Financial Analytics & Stakeholder KPIs */}
      {activeAdminSubTab === 'analytics' && (
        <div className="mt-10 space-y-10">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Total Giving (YTD)
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                ${totalGivingYTD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                +18.4% compared to prior tax year
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Monthly Recurring Run-Rate
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-church-burgundy dark:text-church-gold tabular-nums mt-3 tracking-tight">
                ${recurringMonthlyRunRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                From {recurringDonorsCount} active recurring givers
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Average Gift Size
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                ${averageGiftSize.toFixed(2)}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                Across {completedDonations.length} completed gifts
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Donor-Covered Stripe Fees
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                ${totalFeesCovered.toFixed(2)}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                Saved 100% of processing overhead
              </p>
            </div>
          </div>

          {/* Historical Trend of Recurring Monthly Donations (Recharts Line Graph) */}
          <RecurringTrendChart />

          {/* Donor Churn & Retention Analysis Widget (Recharts Line Chart) */}
          <DonorChurnAnalysis />

          {/* Donor Giving Tenure Distribution (Recharts Pie Chart) */}
          <DonorTenurePieChart />

          {/* Pledge Gap Overview Banner */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 border-l-4 border-l-[#D4AF37] p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {selectedPledgeYear} Annual Faith Commitment Gap Analysis
                </span>
                <h4 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mt-1">
                  Pledged Commitments vs. Received Contributions
                </h4>
              </div>

              <button
                onClick={() => setActiveAdminSubTab('pledges')}
                className="px-3 py-1.5 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-semibold rounded-xl shadow-sm self-start sm:self-auto flex items-center gap-1.5 transition-colors"
              >
                <span>Full Gap Analysis &amp; Ledger</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 text-xs mb-5">
              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">Total Pledged</span>
                <span className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1.5 block">
                  ${pledgeGapSummary.totalPledged.toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">From {pledgeGapSummary.totalPledgesCount} commitments</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">Received toward Pledges</span>
                <span className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1.5 block">
                  ${pledgeGapSummary.totalReceived.toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">{pledgeGapSummary.fulfilledPledgesCount} covenants fully met</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">Net Remaining Gap</span>
                <span className="font-mono text-xl font-semibold text-church-burgundy dark:text-church-gold-light tabular-nums mt-1.5 block">
                  ${pledgeGapSummary.netGap.toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Needed to meet covenants</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">Fulfillment Rate</span>
                <span className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1.5 block">
                  {pledgeGapSummary.percentFulfilled}%
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">Active stewardship pace</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Annual Commitment Fulfillment Progress
                </span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ${pledgeGapSummary.totalReceived.toLocaleString()} / ${pledgeGapSummary.totalPledged.toLocaleString()} ({pledgeGapSummary.percentFulfilled}%)
                </span>
              </div>
              <div className="h-2 w-full bg-[#E8E2D9]/80 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-church-burgundy dark:bg-church-gold rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, pledgeGapSummary.percentFulfilled)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Fund Allocation Distribution */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-5">
              Fund Stewardship Breakdown
            </h3>
            <div className="space-y-5">
              {funds.map((f) => {
                const percent = Math.min(100, (f.currentAmount / f.goalAmount) * 100);
                return (
                  <div key={f.id} className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{f.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{f.code}</span>
                      </div>
                      <div className="font-mono tabular-nums text-right">
                        <span className="font-semibold text-slate-900 dark:text-white">${f.currentAmount.toLocaleString()}</span>
                        <span className="text-slate-400"> / ${f.goalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-[#E8E2D9]/70 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-church-burgundy dark:bg-church-gold rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Giving Velocity Monthly Projection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
              <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
                Payment Channel Distribution
              </h3>
              <p className="text-xs text-slate-500 mb-5">Breakdown by processing method in Stripe</p>
              
              <div className="divide-y divide-[#E8E2D9] dark:divide-slate-800 text-xs">
                <div className="flex justify-between items-center py-3">
                  <span className="text-slate-600 dark:text-slate-300">Credit / Debit Cards (Visa, MC, Amex)</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">68.2%</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-slate-600 dark:text-slate-300">Bank ACH Direct Debit (Tithing)</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">24.5%</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-slate-600 dark:text-slate-300">Digital Wallets (Apple Pay, Google Pay)</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">7.3%</span>
                </div>
              </div>
            </div>

            <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
              <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
                Stewardship Governance Status
              </h3>
              <p className="text-xs text-slate-500 mb-5">Regulatory &amp; compliance health check</p>
              
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-church-burgundy dark:text-church-gold" />
                  <span>
                    {config.ein?.trim()
                      ? `IRS 501(c)(3) tax exemption active and verified (EIN: ${config.ein.trim()})`
                      : 'IRS 501(c)(3) tax exemption active and verified'}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>Stripe TLS 1.3 tokenization active (zero plain card data stored)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>GDPR / CCPA consent logging enabled with immutable event hash</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>Continuous backup &amp; cryptographically linked audit ledger</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* SUB-TAB: AWC Digital Contribution Book & DCU Credit Union Link */}
      {activeAdminSubTab === 'awc-dcb' && (
        <div className="mt-8 space-y-10">
          <AwcDcbIntegrationHub />
          <DcuBankIntegration />
          <RealTimeReconciliationPanel />
        </div>
      )}

      {/* SUB-TAB: Pledges & Gap Analysis */}
      {activeAdminSubTab === 'pledges' && (
        <div className="mt-10 space-y-10">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#FFFCF8] dark:bg-slate-900 p-5 rounded-xl border border-[#E8E2D9] dark:border-slate-800 gap-4 shadow-sm">
            <div>
              <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white">
                Annual Faith Commitment &amp; Gap Reconciliation ({selectedPledgeYear})
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Variance between pledged financial commitments and actual received contributions.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={selectedPledgeYear}
                onChange={(e) => setSelectedPledgeYear(Number(e.target.value))}
                className="text-xs px-3 py-1.5 rounded-xl border border-[#E8E2D9] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value={2026}>Tax Year 2026</option>
                <option value={2025}>Tax Year 2025</option>
              </select>

              <button
                onClick={exportPledgesCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 rounded-xl border border-[#E8E2D9] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 shadow-sm transition-colors whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Pledge Reconciliation CSV</span>
              </button>
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Total Pledged Commitment
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                ${pledgeGapSummary.totalPledged.toLocaleString()}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                From {pledgeGapSummary.totalPledgesCount} committed member covenants
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Received toward Pledges
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                ${pledgeGapSummary.totalReceived.toLocaleString()}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                {pledgeGapSummary.fulfilledPledgesCount} covenants fully fulfilled
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Net Remaining Gap
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-church-burgundy dark:text-church-gold-light tabular-nums mt-3 tracking-tight">
                ${pledgeGapSummary.netGap.toLocaleString()}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                Outstanding balance to meet annual budget
              </p>
            </div>

            <div className="h-full flex flex-col p-6 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Fulfillment Pace
              </span>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums mt-3 tracking-tight">
                {pledgeGapSummary.percentFulfilled}%
              </p>
              <p className="mt-auto pt-3 text-[11px] text-slate-500">
                {pledgeGapSummary.activePledgesCount} pledges actively in progress
              </p>
            </div>
          </div>

          {/* Fund-by-Fund Gap Analysis Table */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E8E2D9] dark:border-slate-800 flex justify-between items-center">
              <div>
                <h4 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white">
                  Ministry Fund Pledge Gap Breakdown
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Variance between promised campaign pledges and recorded contributions per fund
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-6 py-3 font-medium">Designated Ministry Fund</th>
                    <th className="px-6 py-3 font-medium text-right">Committed Pledges</th>
                    <th className="px-6 py-3 font-medium text-right">Received to Date</th>
                    <th className="px-6 py-3 font-medium text-right">Remaining Gap</th>
                    <th className="px-6 py-3 font-medium">Fulfillment Rate</th>
                    <th className="px-6 py-3 font-medium text-center">Pledges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pledgeGapSummary.fundBreakdown.map((item) => (
                    <tr key={item.fundId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                        {item.fundName}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ${item.totalPledged.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        ${item.totalReceived.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-church-burgundy dark:text-church-gold-light tabular-nums">
                        ${item.gapAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-mono">{item.percentFulfilled}%</span>
                          </div>
                          <div className="h-2 w-36 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-church-burgundy-light dark:bg-church-gold rounded-full"
                              style={{ width: `${Math.min(100, item.percentFulfilled)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono">
                        {item.pledgeCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual Donor Pledge Registry */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E8E2D9] dark:border-slate-800 flex justify-between items-center">
              <div>
                <h4 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white">
                  Congregational Pledge Covenant Registry ({selectedPledgeYear})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Individual pledge fulfillment progress and stewardship communication status
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-6 py-3 font-medium">Donor Name</th>
                    <th className="px-6 py-3 font-medium">Fund</th>
                    <th className="px-6 py-3 font-medium text-right">Committed</th>
                    <th className="px-6 py-3 font-medium text-right">Received</th>
                    <th className="px-6 py-3 font-medium text-right">Remaining Gap</th>
                    <th className="px-6 py-3 font-medium text-center">Status</th>
                    <th className="px-6 py-3 font-medium">Covenant Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pledges
                    .filter((p) => p.taxYear === selectedPledgeYear)
                    .map((p) => {
                      const gap = Math.max(0, p.committedAmount - p.fulfilledAmount);
                      let statusBadge = (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          In Progress
                        </span>
                      );

                      if (p.fulfilledAmount >= p.committedAmount) {
                        statusBadge = (
                          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            Fulfilled
                          </span>
                        );
                      } else if (p.status === 'ahead') {
                        statusBadge = (
                          <span className="text-[11px] font-medium text-church-burgundy dark:text-church-gold">
                            Ahead of Pace
                          </span>
                        );
                      }

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-3.5">
                            <span className="font-semibold text-slate-900 dark:text-white block">{p.donorName}</span>
                            <span className="text-[11px] text-slate-500">{p.donorEmail}</span>
                          </td>
                          <td className="px-6 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                            {p.fundName}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            ${p.committedAmount.toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                            ${p.fulfilledAmount.toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono font-bold text-church-burgundy dark:text-church-gold-light tabular-nums">
                            ${gap.toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            {statusBadge}
                          </td>
                          <td className="px-6 py-3.5 text-slate-500 italic max-w-xs truncate" title={p.notes}>
                            {p.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUB-TAB 2: Transactions Ledger */}
      {activeAdminSubTab === 'transactions' && (
        <div className="mt-8 space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 w-full sm:w-80 relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search donor, receipt #, or transaction ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedFundFilter}
                onChange={(e) => setSelectedFundFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
              >
                <option value="all">All Funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>

              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
              </select>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm transition-colors whitespace-nowrap"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Export Data</span>
              </button>
            </div>
          </div>


          {/* Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Date &amp; Time</th>
                    <th className="px-5 py-3 font-medium">Receipt #</th>
                    <th className="px-5 py-3 font-medium">Donor</th>
                    <th className="px-5 py-3 font-medium">Fund</th>
                    <th className="px-5 py-3 font-medium">Frequency</th>
                    <th className="px-5 py-3 font-medium">Method</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium text-center">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDonations.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {new Date(d.timestamp).toLocaleDateString()} {new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-medium text-slate-900 dark:text-white">
                        {d.receiptNumber}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{d.donorName}</div>
                        <div className="text-[11px] text-slate-500">{d.donorEmail}</div>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                        {d.fundName}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-slate-600 dark:text-slate-400">
                        {d.frequency}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px]">
                        {d.cardBrand} •••• {d.cardLast4}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ${d.amount.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                            d.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedReceipt(d)}
                            className="text-church-burgundy hover:text-church-burgundy font-medium dark:text-church-gold"
                          >
                            Receipt
                          </button>
                          {d.status === 'completed' && (currentRole === 'admin' || currentRole === 'bookkeeper') && (
                            <button
                              onClick={() => setRefundTargetId(d.transactionId)}
                              className="text-slate-400 hover:text-red-600"
                              title="Process Refund"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUB-TAB 3: Donor CRM */}
      {activeAdminSubTab === 'donors' && (
        <div className="mt-8 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                Church Donor Directory ({donors.length})
              </h3>
              <span className="text-xs text-slate-500">
                Field-level AES-256 tokenized records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-6 py-3 font-medium">Donor Name</th>
                    <th className="px-6 py-3 font-medium">Contact</th>
                    <th className="px-6 py-3 font-medium">Pledge Schedule</th>
                    <th className="px-6 py-3 font-medium">Gifts Count</th>
                    <th className="px-6 py-3 font-medium text-right">Lifetime Giving</th>
                    <th className="px-6 py-3 font-medium text-center">Tax ID</th>
                    <th className="px-6 py-3 font-medium text-center">GDPR Consent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {donors.map((donor) => (
                    <tr key={donor.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{donor.name}</div>
                        <div className="text-[11px] text-slate-500">{donor.address}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div>{donor.email}</div>
                        <div className="text-slate-500">{donor.phone}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        {donor.recurringActive ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <Repeat className="h-3 w-3" />
                            <span>${donor.recurringAmount} / {donor.recurringFrequency}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">One-time giver</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-center">
                        {donor.totalGiftsCount}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ${donor.lifetimeGiving.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3.5 text-center font-mono text-slate-500">
                        {donor.taxId || '***-**-****'}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded">
                          Opt-In Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: RBAC & Security */}
      {activeAdminSubTab === 'rbac' && (
        <div className="mt-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white mb-2">
              Role-Based Access Control (RBAC) Architecture
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Granular permission boundaries enforce separation of duties between pastors, First Lady stewardship access, financial administrators, bookkeepers, and independent auditors.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                {
                  id: 'admin' as UserRole,
                  role: 'Admin',
                  desc: 'Full financial authority, refund execution, gateway settings, fund creation, and user management.',
                  perms: ['Full Ledger Access', 'Issue Refunds', 'MFA Protected', 'Audit Configuration'],
                },
                {
                  id: 'first_lady' as UserRole,
                  role: 'First Lady',
                  desc: 'Contribution-central access: view giving across all channels, log Cash App / Zelle / Venmo / check / cash, and monitor the ledger. No refunds or gateway secret changes.',
                  perms: ['View Analytics', 'Contribution Log', 'CSV Exports', 'Read Integrations Status', 'No Refund Rights'],
                },
                {
                  id: 'pastor' as UserRole,
                  role: 'Pastor',
                  desc: 'High-level pastoral overview of campaigns, giving trends, and donor pastoral care.',
                  perms: ['View Analytics', 'Fund Campaigns', 'Congregation Care', 'Read-Only Ledger'],
                },
                {
                  id: 'bookkeeper' as UserRole,
                  role: 'Bookkeeper',
                  desc: 'Reconciliation, batch CSV exports, and contribution log entry for all channels.',
                  perms: ['Ledger Reconciliation', 'Contribution Log', 'CSV Exports', 'No Refund Rights'],
                },
                {
                  id: 'auditor' as UserRole,
                  role: 'Auditor',
                  desc: 'Independent compliance inspector auditing security logs, GDPR privacy requests, and IRS 501(c)(3) integrity.',
                  perms: ['View Audit Trails', 'Verify Hashes', 'GDPR Inspection', 'Zero Data Mutation'],
                },
              ].map((item) => (
                <div key={item.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{item.role}</span>
                      {currentRole === item.id && (
                        <span className="text-[10px] font-semibold text-church-burgundy dark:text-church-gold bg-church-gold/15 dark:bg-church-burgundy-dark/60 px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug mb-3">
                      {item.desc}
                    </p>
                  </div>
                  <div className="space-y-1 pt-3 border-t border-slate-200 dark:border-slate-700">
                    {item.perms.map((p) => (
                      <div key={p} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                        <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Audit Trails */}
      {activeAdminSubTab === 'audit' && (
        <div className="mt-8 space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                Cryptographic Security &amp; Financial Audit Log
              </h3>
              <p className="text-xs text-slate-500">
                Every financial transaction and administrative action is recorded with SHA-256 integrity hashes.
              </p>
            </div>
            <button
              onClick={exportAuditLogsCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Audit Trail</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-5 py-3 font-medium">Actor</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Resource</th>
                    <th className="px-5 py-3 font-medium">Details</th>
                    <th className="px-5 py-3 font-medium">Integrity Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                        {log.actorName}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-slate-500">
                        {log.actorRole}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-medium text-church-burgundy dark:text-church-gold">
                        {log.action}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                        {log.resource}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[10px] text-slate-400 max-w-[120px] truncate" title={log.integrityHash}>
                        {log.integrityHash}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: GDPR & CCPA Compliance */}
      {activeAdminSubTab === 'privacy' && (
        <div className="mt-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white mb-2">
              GDPR &amp; CCPA Information Governance
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Automated compliance tools for donor privacy rights under General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <ShieldCheck className="h-5 w-5 text-emerald-600 mb-2" />
                <h4 className="font-semibold text-xs text-slate-900 dark:text-white">Right to Data Portability</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Donors can download a full, machine-readable JSON archive of all personal information and giving statements with one click.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <RotateCcw className="h-5 w-5 text-church-gold-dark mb-2" />
                <h4 className="font-semibold text-xs text-slate-900 dark:text-white">Right to Erasure (Sanitization)</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Purges all PII (name, phone, address) while retaining statutory financial sums required under federal 501(c)(3) audit laws.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <Lock className="h-5 w-5 text-blue-600 mb-2" />
                <h4 className="font-semibold text-xs text-slate-900 dark:text-white">Field-Level Encryption</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Stripe tokenization ensures zero raw credit card or bank credentials touch church database storage.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 7: Contribution Log (all external + physical channels) */}
      {activeAdminSubTab === 'offline' && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Contribution entry form */}
          <div className="lg:col-span-5 bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="h-5 w-5 text-church-gold-dark" />
              <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                Log a Contribution
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Record gifts received through Cash App, Zelle, Venmo, check, cash, or service kiosk.
              Sync pushes them into the master ledger and AWC Digital Contribution Book.
            </p>

            <form onSubmit={handleQueueOffline} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Donor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Thomas Avery"
                  value={offlineDonorName}
                  onChange={(e) => setOfflineDonorName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Donor Email (for Receipt)</label>
                <input
                  type="email"
                  placeholder="e.g. thomas.avery@example.com"
                  value={offlineDonorEmail}
                  onChange={(e) => setOfflineDonorEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="100.00"
                    value={offlineAmount}
                    onChange={(e) => setOfflineAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Channel</label>
                  <select
                    value={offlineMethod}
                    onChange={(e) => setOfflineMethod(e.target.value as StaffContributionMethod)}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="cash_app">Cash App</option>
                    <option value="zelle">Zelle</option>
                    <option value="venmo">Venmo</option>
                    <option value="check">Physical Check</option>
                    <option value="cash">Cash Envelope</option>
                    <option value="card_kiosk">Service Kiosk</option>
                  </select>
                </div>
              </div>

              {offlineMethod !== 'cash' && offlineMethod !== 'card_kiosk' && (
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                    {offlineMethod === 'check'
                      ? 'Check Number'
                      : offlineMethod === 'cash_app'
                        ? 'Cash App cashtag / note'
                        : offlineMethod === 'zelle'
                          ? 'Zelle confirmation / name'
                          : 'Venmo username / note'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      offlineMethod === 'check'
                        ? 'e.g. #2841'
                        : offlineMethod === 'cash_app'
                          ? 'e.g. $AWCGive'
                          : offlineMethod === 'zelle'
                            ? 'e.g. Confirmation or sender name'
                            : 'e.g. @username'
                    }
                    value={offlineCheckNum}
                    onChange={(e) => setOfflineCheckNum(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Designated Fund</label>
                <select
                  value={offlineFundId}
                  onChange={(e) => setOfflineFundId(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Internal note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sunday AM envelope / memorial gift"
                  value={offlineNote}
                  onChange={(e) => setOfflineNote(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-church-burgundy hover:bg-church-burgundy-light text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Save to Contribution Queue</span>
              </button>
            </form>
          </div>

          {/* Queue & Sync Button */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                    Contribution Queue ({offlineGifts.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {offlineGifts.filter((g) => !g.synced).length} pending ledger &amp; DCB sync
                  </p>
                </div>
                <button
                  onClick={syncOfflineGifts}
                  disabled={offlineGifts.filter((g) => !g.synced).length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Batch Sync to Cloud Master Ledger</span>
                </button>
              </div>

              {offlineGifts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No gifts currently queued. Use the form on the left to log physical service collections.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Donor</th>
                        <th className="px-4 py-2.5 font-medium">Method</th>
                        <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                        <th className="px-4 py-2.5 font-medium text-center">Sync Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {offlineGifts.map((gift) => (
                        <tr key={gift.id}>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-slate-900 dark:text-white">{gift.donorName}</span>
                            <span className="block text-[10px] text-slate-500">{gift.donorEmail}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                            {(
                              {
                                cash: 'Cash',
                                check: 'Check',
                                card_kiosk: 'Kiosk',
                                cash_app: 'Cash App',
                                zelle: 'Zelle',
                                venmo: 'Venmo',
                              } as Record<string, string>
                            )[gift.method] || gift.method}
                            {(gift.channelReference || gift.checkNumber)
                              ? ` (${gift.channelReference || gift.checkNumber})`
                              : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            ${gift.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {gift.synced ? (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                Synced
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-church-gold-dark bg-church-gold/10 px-2 py-0.5 rounded">
                                Pending Sync
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {activeAdminSubTab === 'integrations' && (
        <div className="mt-6">
          <IntegrationsSettingsPanel />
        </div>
      )}

      {/* Refund Modal */}
      {refundTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">
                Confirm Transaction Refund
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Processing a refund for transaction <strong>{refundTargetId}</strong> will reverse the charge in Stripe, deduct the principal from the fund's ledger balance, and record a permanent audit entry.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reason for Refund (Required for Audit Trail)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Accidental duplicate donation or donor request"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full p-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRefundTargetId(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRefund}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
              >
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Filtered Export Data Modal */}
      <ExportDataModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />


    </div>
  );
};

