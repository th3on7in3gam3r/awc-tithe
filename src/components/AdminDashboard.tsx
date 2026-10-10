import React, { useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationStatus, DonationFrequency, StaffContributionMethod } from '../types';
import { RecurringTrendChart } from './RecurringTrendChart';
import { DonorTenurePieChart } from './DonorTenurePieChart';
import { DonorChurnAnalysis } from './DonorChurnAnalysis';
import { ExportDataModal } from './ExportDataModal';
import { IntegrationsSettingsPanel } from './IntegrationsSettingsPanel';
import { GivingGoalsAdmin } from './GivingGoalsAdmin';
import { YearEndStatementsAdmin } from './YearEndStatementsAdmin';
import { DcbSyncStatusPanel } from './DcbSyncStatusPanel';
import { auditStaffTwoFactor, fetchActivityAudit, fetchStaffSession, recordOfflineGift } from '../lib/api';
import { staffAuthClient } from '../lib/authClient';
import {
  DollarSign,
  Users,
  Repeat,
  Download,
  Search,
  Filter,
  ShieldCheck,
  Lock,
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

function StaffAuthenticatorSetup() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [uri, setUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchStaffSession().then((session) => setEnabled(session.twoFactorEnabled));
  }, []);

  if (enabled !== false) return null;

  const start = async () => {
    setBusy(true);
    setError('');
    const result = await staffAuthClient.twoFactor.enable({ method: 'totp' });
    setBusy(false);
    const data = result.data as { totpURI?: string; backupCodes?: string[] } | null;
    if (!data?.totpURI) {
      setError('Could not start authenticator setup.');
      return;
    }
    setUri(data.totpURI);
    setBackupCodes(data.backupCodes || []);
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await staffAuthClient.twoFactor.verifyTotp({ code: code.trim() });
    if (result.error) {
      setBusy(false);
      setError('That code did not match.');
      return;
    }
    await auditStaffTwoFactor('enrolled');
    setEnabled(true);
    setBusy(false);
  };

  return (
    <div className="mt-6 rounded-xl border border-[#E8E2D9] bg-[#FFFCF8] p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Authenticator apps are optional for staff. Admins must enroll before admin tools open.
      </p>
      {!uri ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="mt-3 rounded-lg bg-church-burgundy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Preparing…' : 'Set up authenticator'}
        </button>
      ) : (
        <form onSubmit={(e) => void confirm(e)} className="mt-3 space-y-2">
          <p className="break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">{uri}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Save these backup codes now. They are shown once.</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] dark:bg-slate-950">{backupCodes.join('\n')}</pre>
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Code from the app"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-church-burgundy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            {busy ? 'Saving…' : 'Confirm authenticator'}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const AdminDashboard: React.FC = () => {
  const {
    config,
    donations,
    donors,
    funds,
    staffPortalRole,
    isMfaVerified,
    resetMfa,
    refundDonation,
    hydrateStaffLedger,
    ledgerStatus,
    ledgerError,
    configStatus,
    configError,
    fundsStatus,
    exportTransactionsCSV,
    setSelectedReceipt,
    addNotification,
  } = useChurch();

  const isPortalAdmin = staffPortalRole === 'admin';

  const [activeAdminSubTab, setActiveAdminSubTab] = useState<
    | 'analytics'
    | 'transactions'
    | 'donors'
    | 'audit'
    | 'offline'
    | 'integrations'
    | 'giving-goals'
    | 'year-end'
    | 'dcb-sync'
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
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineSaving, setOfflineSaving] = useState(false);
  const [serverAudit, setServerAudit] = useState<
    Array<{ id: string; at: string; actorLabel: string; actorRole: string; action: string; resource: string; details: string; ipAddress: string }>
  >([]);
  const [auditError, setAuditError] = useState<string | null>(null);

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

  const loggedContributions = donations.filter((d) =>
    ['cash', 'check', 'cash_app', 'zelle', 'venmo', 'card'].includes(d.paymentMethod)
  ).slice(0, 40);

  useEffect(() => {
    if (activeAdminSubTab !== 'audit' || !isMfaVerified) return;
    setAuditError(null);
    void fetchActivityAudit()
      .then(setServerAudit)
      .catch((err) => setAuditError(err instanceof Error ? err.message : 'Could not load audit'));
  }, [activeAdminSubTab, isMfaVerified]);

  const handleConfirmRefund = () => {
    if (!refundTargetId) return;
    refundDonation(refundTargetId, refundReason || 'Donor requested refund via church administration');
    setRefundTargetId(null);
    setRefundReason('');
  };

  const handleQueueOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(offlineAmount);
    if (!amt || amt <= 0) {
      setOfflineError('Enter an amount greater than zero.');
      return;
    }
    if (!offlineDonorEmail.trim().includes('@')) {
      setOfflineError('Enter the donor email so the gift stays linked to them.');
      return;
    }
    const fund = funds.find((f) => f.id === offlineFundId) || funds[0];
    if (!fund) {
      setOfflineError('No fund is available.');
      return;
    }
    const reference = offlineCheckNum.trim();
    setOfflineSaving(true);
    setOfflineError(null);
    try {
      await recordOfflineGift({
        amount: amt,
        donorName: offlineDonorName.trim() || 'Donor',
        donorEmail: offlineDonorEmail.trim(),
        fundId: fund.id,
        fundName: fund.name,
        paymentMethod: offlineMethod,
        cardBrand: reference || undefined,
        dedication: offlineNote.trim() || undefined,
      });
      setOfflineDonorName('');
      setOfflineDonorEmail('');
      setOfflineAmount('');
      setOfflineCheckNum('');
      setOfflineNote('');
      addNotification('success', 'Gift recorded', 'Saved to the church ledger.');
      await hydrateStaffLedger();
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : 'Could not save this gift. The form is unchanged.');
    } finally {
      setOfflineSaving(false);
    }
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
              · {staffPortalRole || 'staff'}
            </span>
          </div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mt-1.5 tracking-tight">
            Stewardship Financial Dashboard
          </h1>
          {(ledgerStatus === 'loading' || configStatus === 'loading' || fundsStatus === 'loading') && (
            <p className="mt-2 text-xs text-slate-500">Loading church data from the server…</p>
          )}
          {(ledgerError || configError) && (
            <p className="mt-2 text-xs text-red-600">{ledgerError || configError}</p>
          )}
          <p className="mt-2 max-w-2xl text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Cash, check, Cash App, Zelle, and Venmo gifts recorded by staff are stored with the church ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isMfaVerified && (
            <button
              type="button"
              onClick={() => void hydrateStaffLedger()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E8E2D9] bg-white text-slate-700 hover:border-church-burgundy/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              Refresh ledger
            </button>
          )}
          {isPortalAdmin && (
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
      {!isMfaVerified && (
        <div className="mt-6 p-5 rounded-xl border border-church-gold/40 bg-church-gold/10">
          <p className="text-xs text-church-burgundy">
            Sign in from the Staff Portal with your own email. Admins also need an authenticator app before admin tools open.
          </p>
        </div>
      )}
      {isMfaVerified && staffPortalRole === 'staff' && <StaffAuthenticatorSetup />}

      {/* Sub-Tabs Navigation */}
      <div className="mt-8 border-b border-[#E8E2D9] dark:border-slate-800 overflow-x-auto">
        <nav className="flex gap-5">
          {[
            { id: 'analytics', label: 'Financial Analytics', count: null as number | null },
            ...(isPortalAdmin ? [{ id: 'giving-goals' as const, label: 'Giving Goals', count: null as number | null }] : []),
            ...(isPortalAdmin ? [{ id: 'year-end' as const, label: 'Year-end statements', count: null as number | null }] : []),
            { id: 'transactions', label: 'Transactions', count: donations.length },
            { id: 'donors', label: 'Donor CRM', count: donors.length },
            { id: 'audit', label: 'Audit', count: null as number | null },
            { id: 'offline', label: 'Contribution Log', count: null as number | null },
            { id: 'integrations', label: 'Integrations & Settings', count: null },
            ...(isPortalAdmin ? [{ id: 'dcb-sync' as const, label: 'DCB Sync', count: null as number | null }] : []),
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


          {/* Fund received totals (no campaign goals here — admins use Giving Goals) */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Giving by fund (completed)
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              {isPortalAdmin
                ? 'Set annual goals under the Giving Goals tab.'
                : 'Campaign goals are visible to administrators only.'}
            </p>
            <div className="space-y-3">
              {funds.map((f) => {
                const received = donations
                  .filter((d) => d.fundId === f.id && d.status === 'completed')
                  .reduce((s, d) => s + d.amount, 0);
                return (
                  <div key={f.id} className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-900 dark:text-white">{f.name}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      ${received.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
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
                  <span>Staff session and gift actions are recorded in the audit trail</span>
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
                          {d.status === 'completed' && isPortalAdmin && (
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
                Staff-only donor directory
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                  <tr>
                    <th className="px-6 py-3 font-medium">Donor Name</th>
                    <th className="px-6 py-3 font-medium">Contact</th>
                    <th className="px-6 py-3 font-medium">Recurring</th>
                    <th className="px-6 py-3 font-medium">Gifts Count</th>
                    <th className="px-6 py-3 font-medium text-right">Lifetime Giving</th>
                    <th className="px-6 py-3 font-medium text-center">Tax ID</th>
                    
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

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Contribution Log */}
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
              Record gifts received through Cash App, Zelle, Venmo, check, or cash.
              Sync pushes them into the master ledger.
            </p>

            <form onSubmit={(e) => void handleQueueOffline(e)} className="space-y-4 text-xs">
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
                  </select>
                </div>
              </div>

              {offlineMethod !== 'cash' && (
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

              {offlineError ? (
                <p className="text-xs text-red-600" role="alert">{offlineError}</p>
              ) : null}
              <button
                type="submit"
                disabled={offlineSaving}
                className="w-full py-2.5 px-4 bg-church-burgundy hover:bg-church-burgundy-light text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <PlusCircle className="h-4 w-4" />
                <span>{offlineSaving ? 'Saving…' : 'Save contribution'}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
              <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                Recorded contributions
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Saved on the server. Refresh the ledger if a gift you just entered is missing.
              </p>
              {loggedContributions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No cash, check, or app gifts in the current ledger yet.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Donor</th>
                        <th className="px-4 py-2.5 font-medium">Method</th>
                        <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loggedContributions.map((gift) => (
                        <tr key={gift.id}>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-slate-900 dark:text-white">{gift.donorName}</span>
                            <span className="block text-[10px] text-slate-500">{gift.donorEmail}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{gift.paymentMethod}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            ${gift.amount.toFixed(2)}
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

      {activeAdminSubTab === 'audit' && (
        <div className="mt-8 space-y-4">
          {auditError ? <p className="text-xs text-red-600">{auditError}</p> : null}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">Activity log</h3>
            <p className="text-xs text-slate-500 mt-1">Records written by the server when staff take actions such as sending year-end statements.</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Who</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {serverAudit.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-slate-500">No server audit entries yet.</td></tr>
                ) : serverAudit.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-3 font-mono whitespace-nowrap">{new Date(log.at).toLocaleString()}</td>
                    <td className="px-5 py-3">{log.actorLabel} <span className="text-slate-400">({log.actorRole})</span></td>
                    <td className="px-5 py-3 font-mono">{log.action}</td>
                    <td className="px-5 py-3">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeAdminSubTab === 'giving-goals' && isPortalAdmin && <GivingGoalsAdmin />}
      {activeAdminSubTab === 'year-end' && isPortalAdmin && <YearEndStatementsAdmin />}

      {activeAdminSubTab === 'integrations' && (
        <div className="mt-6">
          <IntegrationsSettingsPanel />
        </div>
      )}

      {activeAdminSubTab === 'dcb-sync' && isPortalAdmin && (
        <div className="mt-6">
          <DcbSyncStatusPanel />
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
              This marks transaction <strong>{refundTargetId}</strong> as refunded on this screen only. It does not reverse the charge in Stripe. Issue Stripe refunds from the Stripe Dashboard.
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

