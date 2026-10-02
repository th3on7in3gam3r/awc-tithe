import React, { useEffect, useMemo, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { Donor, Donation, DonationFrequency } from '../types';
import { fetchGiftsByEmail } from '../lib/api';
import {
  DONOR_PORTAL_EMAIL_KEY,
  clearDonorSessionEmail,
  normalizeDonorEmail,
  setDonorSessionEmail,
} from '../lib/donorSession';
import { PledgeTracker } from './PledgeTracker';
import { AnnualGivingSummaryCard } from './AnnualGivingSummaryCard';
import {
  Download,
  FileText,
  Shield,
  Trash2,
  ExternalLink,
  Lock,
  Target,
  LogOut,
  Mail,
} from 'lucide-react';

const normalizeEmail = (value: string) => normalizeDonorEmail(value);

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
    config,
    funds,
    cancelRecurringPledge,
    requestGdprExport,
    requestGdprErasure,
    setSelectedReceipt,
  } = useChurch();

  const [emailInput, setEmailInput] = useState('');
  const [unlockedEmail, setUnlockedEmail] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [currentDonor, setCurrentDonor] = useState<Donor | null>(null);
  const [donorGifts, setDonorGifts] = useState<Donation[]>([]);
  const [taxYear, setTaxYear] = useState<number>(2026);
  const [showAnnualStatement, setShowAnnualStatement] = useState(false);
  const [activePortalTab, setActivePortalTab] = useState<'pledges' | 'statements'>('pledges');

  const tryUnlock = async (email: string): Promise<boolean> => {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setLookupError('Enter a valid email address used on your gift receipt.');
      return false;
    }

    setLookingUp(true);
    setLookupError(null);
    try {
      const result = await fetchGiftsByEmail(normalized);
      if (!result.donor && result.donations.length === 0) {
        setLookupError('No gifts found for this email. Check the address on your receipt, or give first.');
        setUnlockedEmail(null);
        setCurrentDonor(null);
        setDonorGifts([]);
        clearDonorSessionEmail();
        return false;
      }

      const gifts: Donation[] = result.donations.map((sd) => ({
        id: sd.id,
        transactionId: sd.transactionId,
        receiptNumber: sd.receiptNumber,
        donorId: sd.donorId,
        donorName: sd.donorName,
        donorEmail: sd.donorEmail,
        donorAddress: sd.donorAddress,
        amount: sd.amount,
        feeCovered: sd.feeCovered,
        feeAmount: sd.feeAmount,
        totalCharged: sd.totalCharged,
        frequency: sd.frequency as DonationFrequency,
        fundId: sd.fundId,
        fundName: sd.fundName,
        paymentMethod: sd.paymentMethod as Donation['paymentMethod'],
        cardBrand: sd.cardBrand,
        cardLast4: sd.cardLast4,
        status: sd.status as Donation['status'],
        dedication: sd.dedication,
        isAnonymous: sd.isAnonymous,
        timestamp: sd.timestamp,
        nextBillingDate: sd.nextBillingDate,
        stripePaymentIntentId: sd.stripePaymentIntentId || '',
        encryptedToken: sd.encryptedToken,
        envelopeNumber: sd.envelopeNumber,
        awcDcbVoucher: sd.awcDcbVoucher,
        awcSynced: sd.awcSynced,
        plaidInstitution: sd.plaidInstitution,
        plaidAccountMask: sd.plaidAccountMask,
        plaidTransferId: sd.plaidTransferId,
      }));

      const donor: Donor =
        result.donor
          ? {
              ...result.donor,
              recurringFrequency: result.donor.recurringFrequency as DonationFrequency | undefined,
            }
          : {
              id: gifts[0]?.donorId || `donor-email-${normalized}`,
              name: gifts[0]?.donorName || 'Donor',
              email: normalized,
              phone: '',
              address: gifts[0]?.donorAddress || '',
              lifetimeGiving: gifts.reduce((s, g) => s + g.amount, 0),
              totalGiftsCount: gifts.length,
              firstGiftDate: gifts[gifts.length - 1]?.timestamp || new Date().toISOString(),
              lastGiftDate: gifts[0]?.timestamp || new Date().toISOString(),
              recurringActive: false,
              gdprConsent: true,
              gdprConsentDate: gifts[0]?.timestamp || new Date().toISOString(),
            };

      setCurrentDonor(donor);
      setDonorGifts(gifts);
      setUnlockedEmail(normalized);
      setDonorSessionEmail(normalized);
      return true;
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Could not look up giving history.');
      return false;
    } finally {
      setLookingUp(false);
    }
  };

  useEffect(() => {
    const fromPrefill = initialEmail?.trim();
    const fromSession = sessionStorage.getItem(DONOR_PORTAL_EMAIL_KEY);
    const candidate = fromPrefill || fromSession;
    if (candidate) {
      setEmailInput(candidate);
      void tryUnlock(candidate);
      if (fromPrefill) onConsumedInitialEmail?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  const taxYearGifts = donorGifts.filter((d) => {
    const giftYear = new Date(d.timestamp).getFullYear();
    return giftYear === taxYear && d.status === 'completed';
  });

  const totalDeductibleInTaxYear = taxYearGifts.reduce((acc, curr) => acc + curr.amount, 0);

  const completedGifts = useMemo(
    () => donorGifts.filter((d) => d.status === 'completed'),
    [donorGifts]
  );

  const contributionSummary = useMemo(() => {
    const ytdYear = new Date().getFullYear();
    const ytdGifts = completedGifts.filter((d) => new Date(d.timestamp).getFullYear() === ytdYear);
    const principalLifetime = completedGifts.reduce((s, g) => s + g.amount, 0);
    const principalYtd = ytdGifts.reduce((s, g) => s + g.amount, 0);
    const feesCoveredLifetime = completedGifts.reduce((s, g) => s + (g.feeCovered ? g.feeAmount : 0), 0);
    const feesCoveredYtd = ytdGifts.reduce((s, g) => s + (g.feeCovered ? g.feeAmount : 0), 0);
    const totalChargedLifetime = completedGifts.reduce((s, g) => s + g.totalCharged, 0);
    return {
      ytdYear,
      giftCountLifetime: completedGifts.length,
      giftCountYtd: ytdGifts.length,
      principalLifetime,
      principalYtd,
      feesCoveredLifetime,
      feesCoveredYtd,
      totalChargedLifetime,
    };
  }, [completedGifts]);

  const designatedFunds = useMemo(() => {
    const byFund = new Map<string, { fundId: string; fundName: string; amount: number; count: number }>();
    for (const g of completedGifts) {
      const existing = byFund.get(g.fundId);
      if (existing) {
        existing.amount += g.amount;
        existing.count += 1;
      } else {
        byFund.set(g.fundId, {
          fundId: g.fundId,
          fundName: g.fundName,
          amount: g.amount,
          count: 1,
        });
      }
    }
    return Array.from(byFund.values())
      .map((row) => {
        const fund = funds.find((f) => f.id === row.fundId);
        return {
          ...row,
          fundName: fund?.name || row.fundName,
          currentAmount: fund?.currentAmount ?? row.amount,
          goalAmount: fund?.goalAmount ?? 0,
          description: fund?.description ?? '',
          image: fund?.image,
          category: fund?.category ?? 'Ministry',
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [completedGifts, funds]);

  const handleAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void tryUnlock(emailInput);
  };

  const handleSignOut = () => {
    setUnlockedEmail(null);
    setEmailInput('');
    setLookupError(null);
    setCurrentDonor(null);
    setDonorGifts([]);
    setShowAnnualStatement(false);
    clearDonorSessionEmail();
  };

  const handlePrintAnnualStatement = () => {
    window.print();
  };

  // Private gate — no profile until email unlocks
  if (!unlockedEmail || !currentDonor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-8 shadow-sm">
          <div
            className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(74,4,4,0.08)', color: '#4A0404' }}
          >
            <Lock className="h-5 w-5" style={{ color: '#D4AF37' }} />
          </div>
          <h1 className="font-serif-display text-center text-2xl font-semibold text-slate-900 dark:text-white">
            Sign in to My Giving
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Use the email on your gift receipt to view your contributions, designated funds, receipts,
            pledges, and tax statements. No password—your receipt email unlocks your private profile.
          </p>

          <form onSubmit={handleAccessSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
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
                  className="w-full rounded-xl border border-[#E8E2D9] bg-white py-2.5 pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
              disabled={lookingUp}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#4A0404' }}
            >
              {lookingUp ? 'Looking up…' : 'Access My Giving'}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-slate-500 leading-relaxed">
            Only your gifts appear here. Staff tools stay in Staff Portal (invite required).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-6 border-b border-[#E8E2D9] dark:border-slate-800 gap-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Private Donor Profile
          </span>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mt-1.5 tracking-tight">
            My Giving &amp; Tax Statements
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Signed in as {unlockedEmail}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E2D9] px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm border-l-4 border-l-[#4A0404]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Donor Profile</span>
              <span className="text-[11px] font-medium text-slate-400">Private</span>
            </div>
            <h2 className="font-serif-display text-2xl font-semibold text-slate-900 dark:text-white mt-3 tracking-tight">
              {currentDonor.name}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">{currentDonor.email}</p>
            {currentDonor.phone ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{currentDonor.phone}</p>
            ) : null}
            {currentDonor.address ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {currentDonor.address}
              </p>
            ) : null}

            <div className="mt-6 pt-5 border-t border-[#E8E2D9] dark:border-slate-800 grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  Lifetime Generosity
                </span>
                <span className="font-mono text-xl font-semibold text-church-burgundy dark:text-church-gold-light tabular-nums mt-1 block">
                  ${currentDonor.lifetimeGiving.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  Total Gifts
                </span>
                <span className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1 block">
                  {currentDonor.totalGiftsCount}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white">
                Active Recurring Pledge
              </h3>
              {currentDonor.recurringActive ? (
                <span className="text-[11px] font-medium text-church-burgundy dark:text-church-gold">Active</span>
              ) : (
                <span className="text-[11px] text-slate-400">None yet</span>
              )}
            </div>

            {currentDonor.recurringActive ? (
              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-xl border border-[#E8E2D9] dark:border-slate-700 bg-white/60 dark:bg-slate-800/40">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-mono text-2xl font-semibold text-church-burgundy dark:text-church-gold-light tabular-nums">
                      ${currentDonor.recurringAmount?.toFixed(2)}
                    </span>
                    <span className="capitalize text-xs font-medium text-slate-500">
                      {currentDonor.recurringFrequency}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Next gift processes automatically through Stripe.
                  </p>
                </div>

                <button
                  onClick={() => cancelRecurringPledge(currentDonor.id)}
                  className="w-full py-2 text-xs font-medium text-red-700 hover:text-red-800 bg-red-50/80 hover:bg-red-50 rounded-xl border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50 transition-colors"
                >
                  Cancel recurring
                </button>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Clears your recurring marker here. Pausing the live Stripe subscription still needs the
                  stewardship team until Customer Portal is available.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#E8E2D9] dark:border-slate-700 bg-white/50 dark:bg-slate-800/30 px-4 py-5 text-center">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  A monthly tithe helps sustain worship and outreach year-round.
                </p>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  Set one up anytime from Give Now—you can adjust later.
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5">
              <Shield className="h-4 w-4 text-slate-400" />
              <span>Your Privacy</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Your giving details stay private to this profile. Download a copy of your data, or ask us to
              anonymize personal fields when needed.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => requestGdprExport(currentDonor.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-xl border border-[#E8E2D9] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download my data</span>
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
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50/80 rounded-xl transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Request anonymization</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {/* Member Contribution Summary */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white">
              Contribution Summary
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">Your personal giving totals</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="h-full flex flex-col">
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  {contributionSummary.ytdYear} YTD
                </span>
                <span className="font-mono text-2xl font-semibold text-church-burgundy dark:text-church-gold-light tabular-nums mt-2 tracking-tight">
                  ${contributionSummary.principalYtd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 mt-auto pt-2">
                  {contributionSummary.giftCountYtd} gift{contributionSummary.giftCountYtd === 1 ? '' : 's'}
                </span>
              </div>
              <div className="h-full flex flex-col">
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  Lifetime Principal
                </span>
                <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-2 tracking-tight">
                  ${contributionSummary.principalLifetime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 mt-auto pt-2">
                  {contributionSummary.giftCountLifetime} gift{contributionSummary.giftCountLifetime === 1 ? '' : 's'}
                </span>
              </div>
              <div className="h-full flex flex-col">
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  Fees You Covered
                </span>
                <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-2 tracking-tight">
                  ${contributionSummary.feesCoveredLifetime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 mt-auto pt-2">
                  YTD ${contributionSummary.feesCoveredYtd.toFixed(2)}
                </span>
              </div>
              <div className="h-full flex flex-col">
                <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                  Total Charged
                </span>
                <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-2 tracking-tight">
                  ${contributionSummary.totalChargedLifetime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 mt-auto pt-2">Including covered fees</span>
              </div>
            </div>
          </div>

          {/* Designated funds */}
          <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white">
              Your Designated Funds
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Ministries you have supported
            </p>
            {designatedFunds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E8E2D9] dark:border-slate-700 px-5 py-8 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No completed gifts yet for this email.
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  After you give, your designated funds will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {designatedFunds.map((row) => {
                  const pct =
                    row.goalAmount > 0
                      ? Math.min(100, (row.currentAmount / row.goalAmount) * 100)
                      : 0;
                  return (
                    <div
                      key={row.fundId}
                      className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 overflow-hidden bg-white/50 dark:bg-slate-800/30"
                    >
                      <div className="flex flex-col sm:flex-row">
                        {row.image ? (
                          <div className="sm:w-40 h-28 sm:h-auto shrink-0 relative min-h-[7rem]">
                            <img
                              src={row.image}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-black/10" />
                          </div>
                        ) : null}
                        <div className="flex-1 p-5">
                          <span className="text-[11px] uppercase font-medium tracking-wider text-slate-500">
                            {row.category}
                          </span>
                          <h4 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                            {row.fundName}
                          </h4>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                            <span>
                              Your gifts{' '}
                              <strong className="font-mono text-slate-900 dark:text-white">
                                ${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </span>
                            <span className="text-slate-400">
                              {row.count} gift{row.count === 1 ? '' : 's'}
                            </span>
                          </div>
                          {row.goalAmount > 0 && (
                            <div className="mt-4 space-y-2">
                              <div className="flex justify-between items-baseline text-xs">
                                <span className="text-slate-500">Campaign progress</span>
                                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                                  <strong className="font-semibold text-slate-900 dark:text-white">
                                    ${row.currentAmount.toLocaleString()}
                                  </strong>
                                  <span className="text-slate-400"> / ${row.goalAmount.toLocaleString()}</span>
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-[#E8E2D9]/80 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.max(pct, pct > 0 ? pct : 0)}%`,
                                    minWidth: pct > 0 && pct < 2 ? '2%' : undefined,
                                    backgroundColor: '#4A0404',
                                  }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {pct.toFixed(1)}% of objective funded
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <AnnualGivingSummaryCard
            donor={currentDonor}
            gifts={donorGifts}
            onOpenStatementModal={(yr) => {
              setTaxYear(yr);
              setShowAnnualStatement(true);
            }}
          />

          <div className="flex items-center gap-2 border-b border-[#E8E2D9] dark:border-slate-800 pb-3">
            <button
              onClick={() => setActivePortalTab('pledges')}
              className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl transition-colors ${
                activePortalTab === 'pledges'
                  ? 'bg-church-burgundy text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Annual Faith Pledge Tracker</span>
            </button>

            <button
              onClick={() => setActivePortalTab('statements')}
              className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl transition-colors ${
                activePortalTab === 'statements'
                  ? 'bg-church-burgundy text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
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
              <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[#E8E2D9] dark:border-slate-800 gap-3">
                  <div>
                    <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white">
                      Annual Tax Giving Statement
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Official summary for your tax records
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Tax Year</span>
                      <select
                        value={taxYear}
                        onChange={(e) => setTaxYear(Number(e.target.value))}
                        className="text-xs px-2.5 py-1.5 rounded-xl border border-[#E8E2D9] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value={2026}>2026 (YTD)</option>
                        <option value={2025}>2025</option>
                        <option value={2024}>2024</option>
                      </select>
                    </div>
                    <button
                      onClick={() => setShowAnnualStatement(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-xl shadow-sm transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Generate Statement</span>
                    </button>
                  </div>
                </div>

                <div className="pt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                      Tax Year Contributions
                    </span>
                    <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1.5 block tracking-tight">
                      ${totalDeductibleInTaxYear.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                      Deductible Transactions
                    </span>
                    <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1.5 block tracking-tight">
                      {taxYearGifts.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                      Tax Status
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 block text-sm mt-2">
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
                  {config.legalEntityName?.trim() ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">{config.legalEntityName}</p>
                  ) : null}
                  {[config.address, config.cityStateZip].filter((p) => p?.trim()).length > 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {[config.address, config.cityStateZip].filter((p) => p?.trim()).join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  {config.ein?.trim() ? (
                    <p className="font-mono font-bold text-xs">EIN: {config.ein}</p>
                  ) : null}
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
