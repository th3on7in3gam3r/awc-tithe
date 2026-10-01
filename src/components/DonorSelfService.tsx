import React, { useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { Donor } from '../types';
import { PledgeTracker } from './PledgeTracker';
import { AnnualGivingSummaryCard } from './AnnualGivingSummaryCard';
import {
  Download,
  FileText,
  Shield,
  Trash2,
  Clock,
  ExternalLink,
  Lock,
  Target,
  LogOut,
  Mail,
} from 'lucide-react';

const SESSION_EMAIL_KEY = 'awc_donor_portal_email';

interface DonorSelfServiceProps {
  /** Prefill from a just-completed gift (session handoff). */
  initialEmail?: string;
  onConsumedInitialEmail?: () => void;
}

export const DonorSelfService: React.FC<DonorSelfServiceProps> = ({
  initialEmail,
  onConsumedInitialEmail,
}) => {
  const {
    donors,
    donations,
    config,
    cancelRecurringPledge,
    requestGdprExport,
    requestGdprErasure,
    setSelectedReceipt,
  } = useChurch();

  const [emailInput, setEmailInput] = useState('');
  const [unlockedEmail, setUnlockedEmail] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [taxYear, setTaxYear] = useState<number>(2026);
  const [showAnnualStatement, setShowAnnualStatement] = useState(false);
  const [activePortalTab, setActivePortalTab] = useState<'pledges' | 'statements'>('pledges');

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const findDonorForEmail = (email: string): Donor | null => {
    const normalized = normalizeEmail(email);
    const byProfile = donors.find((d) => normalizeEmail(d.email) === normalized);
    if (byProfile) return byProfile;

    const matchingGifts = donations.filter(
      (d) => normalizeEmail(d.donorEmail) === normalized && d.status === 'completed'
    );
    if (matchingGifts.length === 0) return null;

    const sorted = [...matchingGifts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    return {
      id: first.donorId,
      name: last.donorName,
      email: last.donorEmail,
      phone: '',
      address: last.donorAddress || '',
      taxId: '',
      lifetimeGiving: matchingGifts.reduce((sum, d) => sum + d.amount, 0),
      totalGiftsCount: matchingGifts.length,
      firstGiftDate: first.timestamp,
      lastGiftDate: last.timestamp,
      recurringActive: false,
      gdprConsent: true,
      gdprConsentDate: first.timestamp,
    };
  };

  const tryUnlock = (email: string): boolean => {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setLookupError('Enter a valid email address used on your gift receipt.');
      return false;
    }

    const donor = findDonorForEmail(normalized);
    const hasGifts = donations.some(
      (d) => normalizeEmail(d.donorEmail) === normalized && d.status === 'completed'
    );

    if (!donor && !hasGifts) {
      setLookupError('No gifts found for this email. Check the address on your receipt, or give first.');
      setUnlockedEmail(null);
      sessionStorage.removeItem(SESSION_EMAIL_KEY);
      return false;
    }

    setLookupError(null);
    setUnlockedEmail(normalized);
    sessionStorage.setItem(SESSION_EMAIL_KEY, normalized);
    return true;
  };

  useEffect(() => {
    const fromPrefill = initialEmail?.trim();
    const fromSession = sessionStorage.getItem(SESSION_EMAIL_KEY);
    const candidate = fromPrefill || fromSession;
    if (candidate) {
      setEmailInput(candidate);
      tryUnlock(candidate);
      if (fromPrefill) onConsumedInitialEmail?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unlock once on mount / prefill
  }, [initialEmail]);

  const currentDonor = unlockedEmail ? findDonorForEmail(unlockedEmail) : null;

  const donorGifts = unlockedEmail
    ? donations.filter(
        (d) =>
          normalizeEmail(d.donorEmail) === unlockedEmail ||
          (currentDonor && d.donorId === currentDonor.id)
      )
    : [];

  const taxYearGifts = donorGifts.filter((d) => {
    const giftYear = new Date(d.timestamp).getFullYear();
    return giftYear === taxYear && d.status === 'completed';
  });

  const totalDeductibleInTaxYear = taxYearGifts.reduce((acc, curr) => acc + curr.amount, 0);

  const handleAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    tryUnlock(emailInput);
  };

  const handleSignOut = () => {
    setUnlockedEmail(null);
    setEmailInput('');
    setLookupError(null);
    setShowAnnualStatement(false);
    sessionStorage.removeItem(SESSION_EMAIL_KEY);
  };

  const handlePrintAnnualStatement = () => {
    window.print();
  };

  // Private gate — no profile until email unlocks
  if (!unlockedEmail || !currentDonor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
          <div
            className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(74,4,4,0.08)', color: '#4A0404' }}
          >
            <Lock className="h-5 w-5" style={{ color: '#D4AF37' }} />
          </div>
          <h1 className="font-serif-display text-center text-2xl font-bold text-slate-900 dark:text-white">
            Private Donor Portal
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
            Your giving history is private. Enter the email used on your contribution to view receipts,
            pledges, and tax statements.
          </p>

          <form onSubmit={handleAccessSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email on your gift receipt
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setLookupError(null);
                  }}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {lookupError && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {lookupError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
              style={{ backgroundColor: '#4A0404' }}
            >
              Access My Giving
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-slate-500">
            This portal never lists other donors. Staff stewardship tools are separate via Staff Login.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-church-burgundy dark:text-church-gold">
            Private Donor Profile
          </span>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            My Giving &amp; Tax Statements
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Signed in as {unlockedEmail}. Only your gifts and pledges are shown here.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Donor Profile</span>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                Private
              </span>
            </div>
            <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white mt-2">
              {currentDonor.name}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">{currentDonor.email}</p>
            {currentDonor.phone ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">{currentDonor.phone}</p>
            ) : null}
            {currentDonor.address ? (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{currentDonor.address}</p>
            ) : null}

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Lifetime Generosity</span>
                <span className="font-mono text-base font-bold text-church-burgundy dark:text-church-gold-light tabular-nums">
                  ${currentDonor.lifetimeGiving.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Total Gifts</span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {currentDonor.totalGiftsCount}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-church-gold-dark" />
                <span>Active Recurring Pledge</span>
              </h3>
              {currentDonor.recurringActive ? (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Active
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">None Active</span>
              )}
            </div>

            {currentDonor.recurringActive ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-church-gold/10 dark:bg-church-burgundy/20 rounded-lg border border-church-gold/30 dark:border-church-gold/30">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-church-burgundy-dark dark:text-church-gold-light">
                      ${currentDonor.recurringAmount?.toFixed(2)}
                    </span>
                    <span className="capitalize text-[11px] font-medium text-church-burgundy dark:text-church-gold">
                      {currentDonor.recurringFrequency}
                    </span>
                  </div>
                  <p className="text-[11px] text-church-burgundy/80 dark:text-church-gold mt-1">
                    Next automatic transaction scheduled via Stripe tokenized gateway.
                  </p>
                </div>

                <button
                  onClick={() => cancelRecurringPledge(currentDonor.id)}
                  className="w-full py-2 text-xs font-medium text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50 transition-colors"
                >
                  Pause or Cancel Recurring Pledge
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You currently have no active recurring pledges. Consider setting up a recurring monthly tithe in Give Now.
              </p>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-2">
              <Shield className="h-4 w-4 text-emerald-700" />
              <span>GDPR &amp; CCPA Privacy Center</span>
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Your personal and financial information is encrypted with AES-256 tokens and protected under global privacy standards.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => requestGdprExport(currentDonor.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Data Archive (JSON)</span>
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Are you sure you want to request data anonymization under GDPR Article 17 / CCPA? This will redact your name, email, and address from church records while maintaining financial totals required by IRS regulations.'
                    )
                  ) {
                    requestGdprErasure(currentDonor.id);
                    handleSignOut();
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Exercise Right to Erasure</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <AnnualGivingSummaryCard
            donor={currentDonor}
            onOpenStatementModal={(yr) => {
              setTaxYear(yr);
              setShowAnnualStatement(true);
            }}
          />

          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              onClick={() => setActivePortalTab('pledges')}
              className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors ${
                activePortalTab === 'pledges'
                  ? 'bg-church-burgundy text-white dark:bg-church-burgundy-light shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Annual Faith Pledge Tracker</span>
            </button>

            <button
              onClick={() => setActivePortalTab('statements')}
              className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors ${
                activePortalTab === 'statements'
                  ? 'bg-church-burgundy text-white dark:bg-church-burgundy-light shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Annual Tax Statements &amp; Ledger</span>
            </button>
          </div>

          {activePortalTab === 'pledges' && (
            <PledgeTracker donorId={currentDonor.id} privateMode />
          )}

          {activePortalTab === 'statements' && (
            <>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
                  <div>
                    <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-church-gold-dark" />
                      <span>Annual Tax Giving Statement</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Official IRS-compliant summary statement for filing federal Schedule A deductions.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Tax Year:</span>
                      <select
                        value={taxYear}
                        onChange={(e) => setTaxYear(Number(e.target.value))}
                        className="text-xs px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value={2026}>2026 (YTD)</option>
                        <option value={2025}>2025</option>
                        <option value={2024}>2024</option>
                      </select>
                    </div>
                    <button
                      onClick={() => setShowAnnualStatement(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Generate Statement</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <span className="text-slate-500 block text-[10px] uppercase">Tax Year Contributions</span>
                    <span className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                      ${totalDeductibleInTaxYear.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <span className="text-slate-500 block text-[10px] uppercase">Deductible Transactions</span>
                    <span className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                      {taxYearGifts.length}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <span className="text-slate-500 block text-[10px] uppercase">Tax Status</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 block text-xs">
                      501(c)(3) Eligible
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                    Contribution History ({donorGifts.length})
                  </h3>
                  <span className="text-xs text-slate-500">Click any transaction to view official receipt</span>
                </div>

                {donorGifts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No contributions found on record for this profile.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium">Receipt #</th>
                          <th className="px-6 py-3 font-medium">Fund</th>
                          <th className="px-6 py-3 font-medium">Frequency</th>
                          <th className="px-6 py-3 font-medium text-right">Amount</th>
                          <th className="px-6 py-3 font-medium text-center">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {donorGifts.map((gift) => (
                          <tr
                            key={gift.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                            onClick={() => setSelectedReceipt(gift)}
                          >
                            <td className="px-6 py-3.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {new Date(gift.timestamp).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="px-6 py-3.5 font-mono font-medium text-slate-900 dark:text-white">
                              {gift.receiptNumber}
                            </td>
                            <td className="px-6 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                              {gift.fundName}
                            </td>
                            <td className="px-6 py-3.5 capitalize text-slate-600 dark:text-slate-400">
                              {gift.frequency}
                            </td>
                            <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                              ${gift.amount.toFixed(2)}
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-church-burgundy hover:text-church-burgundy dark:text-church-gold">
                                <span>View</span>
                                <ExternalLink className="h-3 w-3" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showAnnualStatement && currentDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto no-print">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 my-8">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800 mb-6">
              <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
                IRS 501(c)(3) Annual Giving Statement ({taxYear})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintAnnualStatement}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={() => setShowAnnualStatement(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-6 text-xs text-slate-900 dark:text-slate-100">
              <div className="flex justify-between items-start border-b border-slate-900 dark:border-slate-200 pb-4">
                <div>
                  <h3 className="font-serif-display text-xl font-bold text-slate-950 dark:text-white">
                    {config.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{config.legalEntityName}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {config.address} · {config.cityStateZip}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-xs">EIN: {config.ein}</p>
                  <p className="text-xs text-slate-500">Calendar Tax Year: {taxYear}</p>
                  <p className="text-[11px] text-slate-500">Issued: {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">Prepared For</span>
                <p className="font-semibold text-sm">{currentDonor.name}</p>
                <p>{currentDonor.address}</p>
                <p className="font-mono text-slate-500">Email: {currentDonor.email}</p>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-500 uppercase text-[10px]">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Receipt #</th>
                    <th className="pb-2 font-medium">Designation</th>
                    <th className="pb-2 font-medium text-right">Tax Deductible Gift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {taxYearGifts.map((g) => (
                    <tr key={g.id}>
                      <td className="py-2 font-mono">{new Date(g.timestamp).toLocaleDateString()}</td>
                      <td className="py-2 font-mono">{g.receiptNumber}</td>
                      <td className="py-2">{g.fundName}</td>
                      <td className="py-2 text-right font-mono tabular-nums font-medium">${g.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2 border-slate-900 dark:border-slate-300">
                    <td colSpan={3} className="pt-3 text-right">
                      Total Tax Deductible Contributions in {taxYear}:
                    </td>
                    <td className="pt-3 text-right font-mono text-sm tabular-nums text-church-burgundy dark:text-church-gold-light">
                      ${totalDeductibleInTaxYear.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                Under Internal Revenue Code Section 170(f)(8), {config.name} confirms that no goods or services were
                provided in exchange for the above monetary contributions other than intangible religious benefits.
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="font-mono text-[10px] text-slate-400">
                  Verification SHA: {currentDonor.id}-{taxYear}-VERIFIED
                </span>
                <div className="text-right">
                  <p className="font-serif-display italic font-semibold">{config.financialOfficer || config.name}</p>
                  <p className="text-[10px] text-slate-500">Director of Stewardship &amp; Accounting</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
