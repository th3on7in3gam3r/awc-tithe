import React, { useCallback, useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationFrequency } from '../types';
import { ShieldCheck, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { fetchApiConfig, type ApiConfig } from '../lib/api';
import {
  loadVerifiedDonorProfile,
  normalizeDonorEmail,
  setDonorSessionEmail,
} from '../lib/donorSession';
import { computeProcessingFee, formatFeeLabel } from '../../shared/fees';
import { StripeCheckout } from './StripeCheckout';
import { StewardshipFaq } from './StewardshipFaq';
import { TurnstileWidget } from './TurnstileWidget';

export const DonorPortal: React.FC<{
  onViewMyGiving?: (email: string) => void;
  initialFundId?: string;
  onConsumedInitialFund?: () => void;
}> = ({ onViewMyGiving, initialFundId, onConsumedInitialFund }) => {
  const { funds, addNotification } = useChurch();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [frequency, setFrequency] = useState<DonationFrequency>('monthly');
  const [selectedFundId, setSelectedFundId] = useState<string>(
    () => (initialFundId && funds.some((f) => f.id === initialFundId) ? initialFundId : funds[0]?.id) || 'fund-tithes'
  );

  useEffect(() => {
    if (!initialFundId) return;
    if (funds.some((f) => f.id === initialFundId)) {
      setSelectedFundId(initialFundId);
    }
    onConsumedInitialFund?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFundId]);

  // Keep selection on the sole active fund when designation UI is hidden
  useEffect(() => {
    const active = funds.filter((f) => f.active);
    if (active.length === 1 && selectedFundId !== active[0].id) {
      setSelectedFundId(active[0].id);
    } else if (active.length > 0 && !active.some((f) => f.id === selectedFundId)) {
      setSelectedFundId(active[0].id);
    }
  }, [funds, selectedFundId]);
  const [presetAmount, setPresetAmount] = useState<number | 'custom'>(100);
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [coverFees, setCoverFees] = useState<boolean>(true);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [apiConfigLoading, setApiConfigLoading] = useState(true);
  const [lastGiftEmail, setLastGiftEmail] = useState<string | null>(null);
  const [giftNote, setGiftNote] = useState<string | null>(null);
  const [feeMethod, setFeeMethod] = useState('card');

  // Donor credentials
  const [donorName, setDonorName] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [donorAddress, setDonorAddress] = useState<string>('');
  const [dedication, setDedication] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [profilePrefillApplied, setProfilePrefillApplied] = useState(false);
  /** Name/address last applied from verified session — used so manual edits are not overwritten. */
  const autoFilledRef = React.useRef({ name: '', address: '' });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stripeLive = Boolean(apiConfig?.integrations.stripe.configured && apiConfig.stripePublishableKey);

  useEffect(() => {
    let cancelled = false;
    setApiConfigLoading(true);
    void fetchApiConfig().then((cfg) => {
      if (cancelled) return;
      setApiConfig(cfg);
      setApiConfigLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefill only from verified Better Auth session (no public email lookup)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await loadVerifiedDonorProfile();
      if (cancelled || !profile?.found) return;
      setDonorEmail(profile.email);
      if (profile.name) {
        setDonorName(profile.name);
        autoFilledRef.current.name = profile.name;
      }
      if (profile.address) {
        setDonorAddress(profile.address);
        autoFilledRef.current.address = profile.address;
      }
      setProfilePrefillApplied(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  const principalAmount =
    presetAmount === 'custom'
      ? parseFloat(customAmountStr) || 0
      : Number(presetAmount);

  const { feeAmount, totalCharged } = computeProcessingFee({
    principal: principalAmount,
    method: feeMethod,
    coverFees,
  });
  const feeLabel = formatFeeLabel(feeAmount, principalAmount);

  const handlePaymentError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleStripeProcessing = (result: { status: string; receiptNumber?: string }) => {
    if (result.status === 'failed') {
      setErrorMessage('The payment did not go through. You can try another method.');
      return;
    }
    if (donorEmail.trim()) {
      const normalized = normalizeDonorEmail(donorEmail);
      setLastGiftEmail(normalized);
      setDonorSessionEmail(normalized);
    }
    setGiftNote(
      result.receiptNumber
        ? `Receipt ${result.receiptNumber} is on its way.`
        : 'Your gift is processing. A receipt will be emailed when the payment completes.'
    );
  };

  const scrollToGiveForm = () => {
    document.getElementById('give-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      {/* Brand-led full-bleed hero — first viewport */}
      <section className="relative w-full min-h-[min(96vh,900px)] flex items-end overflow-hidden text-white">
        <div className="absolute inset-0 give-hero-media">
          <img
            src="/assets/images/awc_giving_hero.jpg"
            alt="Hands exchanging a giving envelope beside an open Bible at Anointed Worship Center"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-[68%_center]"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(105deg, rgba(42,2,2,0.78) 0%, rgba(42,2,2,0.52) 42%, rgba(42,2,2,0.35) 70%, rgba(42,2,2,0.55) 100%), linear-gradient(180deg, rgba(42,2,2,0.25) 0%, rgba(42,2,2,0.72) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-32 sm:px-8 sm:pb-24 sm:pt-36 lg:pb-28">
          <div className="give-hero-rise flex items-center gap-3">
            <img
              src="/images/awc-crest.png"
              alt=""
              className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-md"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/images/awc-logo.png';
              }}
            />
            <div>
              <p className="font-serif-display text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-none">
                Anointed Worship Center
              </p>
              <p
                className="mt-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em]"
                style={{ color: '#D4AF37' }}
              >
                AWC Tithe
              </p>
            </div>
          </div>

          <h1 className="give-hero-rise-delay font-serif-display mt-10 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.15] max-w-2xl text-balance">
            Giving Worship to God, Blessing Our City
          </h1>
          <p className="give-hero-rise-delay mt-4 text-base sm:text-lg text-white/80 max-w-md leading-relaxed">
            Where Everybody Is Somebody
          </p>

          <p className="give-hero-rise-delay mt-6 max-w-xl text-sm sm:text-[15px] italic text-white/75 font-serif-display leading-relaxed">
            “God loves a cheerful giver.”{' '}
            <span className="not-italic font-sans text-xs text-white/55">— 2 Corinthians 9:7</span>
          </p>

          <div className="give-hero-rise-delay mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#D4AF37' }} />
              Secure via Stripe
            </span>
            <span className="text-white/30">·</span>
            <span>Contribution receipts</span>
          </div>

          <div className="give-hero-rise-delay mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              type="button"
              onClick={scrollToGiveForm}
              className="give-cta inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-[#2A0202]"
              style={{ backgroundColor: '#D4AF37' }}
            >
              Give now
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

            {/* Quiet give form */}
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-14 sm:py-16 give-form-enter">
        {lastGiftEmail && onViewMyGiving && (
          <div
            className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3"
            style={{
              backgroundColor: 'rgba(74,4,4,0.04)',
              borderColor: 'rgba(212,175,55,0.4)',
            }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: '#4A0404' }}>
                {giftNote || 'Gift received — thank you'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                View receipts and tax statements for {lastGiftEmail}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onViewMyGiving(lastGiftEmail)}
              className="shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: '#4A0404' }}
            >
              View My Giving
            </button>
          </div>
        )}

        <blockquote className="mb-10 border-l-2 pl-4 text-sm sm:text-[15px] italic text-slate-600 dark:text-slate-300 font-serif-display leading-relaxed" style={{ borderColor: '#D4AF37' }}>
          “Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.”
          <footer className="mt-2 text-xs not-italic font-sans font-medium text-slate-500">
            — 2 Corinthians 9:7
          </footer>
        </blockquote>

        <div
          id="give-form"
          className="scroll-mt-24 rounded-2xl border border-[#E8E2D9] bg-[#FFFCF8] p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900"
          style={{ boxShadow: '0 10px 40px -12px rgba(74, 4, 4, 0.12), 0 2px 8px rgba(42, 2, 2, 0.04)' }}
        >
          <h2 className="font-serif-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mb-8">
            Your gift
          </h2>

          <form onSubmit={handleSubmit} className="space-y-10">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Amount
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    aria-label={`Give $${amt}`}
                    aria-pressed={presetAmount === amt}
                    onClick={() => {
                      setPresetAmount(amt);
                      setCustomAmountStr('');
                    }}
                    className={`min-h-11 py-3.5 text-sm font-semibold rounded-xl border transition-all ${
                      presetAmount === amt
                        ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.18)] text-[#4A0404] dark:text-[#F4CF67] dark:bg-[rgba(212,175,55,0.22)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Enter a custom gift amount"
                  aria-pressed={presetAmount === 'custom'}
                  onClick={() => setPresetAmount('custom')}
                  className={`min-h-11 py-3.5 text-sm font-semibold rounded-xl border transition-all ${
                    presetAmount === 'custom'
                      ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.18)] text-[#4A0404] dark:text-[#F4CF67] dark:bg-[rgba(212,175,55,0.22)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  Custom
                </button>
              </div>

              {presetAmount === 'custom' && (
                <div className="mt-3 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="Enter custom gift amount"
                    value={customAmountStr}
                    onChange={(e) => setCustomAmountStr(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-church-gold focus:ring-1 focus:ring-church-gold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>
              )}
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                How often?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(['one-time', 'weekly', 'bi-weekly', 'monthly', 'annually'] as DonationFrequency[]).map((freq) => {
                  const label =
                    freq === 'one-time'
                      ? 'One-time'
                      : freq === 'bi-weekly'
                        ? 'Bi-weekly'
                        : freq === 'annually'
                          ? 'Annually'
                          : freq.charAt(0).toUpperCase() + freq.slice(1);
                  return (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequency(freq)}
                    className={`min-h-10 py-2.5 px-2 text-[11px] sm:text-xs font-medium rounded-lg transition-all text-center leading-tight ${
                      frequency === freq
                        ? 'bg-white text-slate-900 shadow-sm font-semibold dark:bg-slate-700 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                  );
                })}
              </div>
              {frequency !== 'one-time' && (
                <p className="text-xs text-[#4A0404] dark:text-[#F4CF67] mt-2 flex items-start gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Recurring gifts sustain our pastors and local outreach year-round. Cancel anytime.</span>
                </p>
              )}
            </div>

            {/* Fund — hidden when only one active fund (auto-designated) */}
            {funds.filter((f) => f.active).length > 1 ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Designate to
                </label>
                <div className="space-y-2.5">
                  {funds
                    .filter((f) => f.active)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-label={`Designate gift to ${f.name}`}
                        aria-pressed={selectedFundId === f.id}
                        onClick={() => setSelectedFundId(f.id)}
                        className={`w-full min-h-[3.25rem] p-4 text-left rounded-xl border transition-all ${
                          selectedFundId === f.id
                            ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.12)] dark:bg-[rgba(212,175,55,0.16)]'
                            : 'border-slate-200 bg-white/60 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-500'
                        }`}
                      >
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{f.name}</span>
                        {f.description ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-snug">
                            {f.description}
                          </p>
                        ) : null}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {/* Identity — email first for returning donors */}
            <div className="pt-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Your information
              </span>
              <p className="text-xs text-slate-500 mb-4 -mt-1">
                Used only for your tax receipt and My Giving — never shown publicly.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Email on your gift receipt
                  </label>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none"
                  />
                  {profilePrefillApplied ? (
                    <p className="mt-1.5 text-[11px] font-medium" style={{ color: '#4A0404' }}>
                      Welcome back{donorName ? `, ${donorName.split(' ')[0]}` : ''} — details from your signed-in
                      My Giving session. Confirm or edit below.
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Given before?{' '}
                      <button
                        type="button"
                        onClick={() => onViewMyGiving?.(normalizeDonorEmail(donorEmail) || '')}
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: '#4A0404' }}
                      >
                        Sign in to My Giving
                      </button>{' '}
                      to prefill your details.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 sm:max-w-none">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Full legal name</label>
                    <input
                      type="text"
                      value={donorName}
                      onChange={(e) => {
                        setDonorName(e.target.value);
                      }}
                      required
                      placeholder="Your full legal name"
                      autoComplete="name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Mailing address (for IRS statement)
                    </label>
                    <input
                      type="text"
                      value={donorAddress}
                      onChange={(e) => {
                        setDonorAddress(e.target.value);
                      }}
                      placeholder="Street, City, State, ZIP"
                      autoComplete="street-address"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Dedication / memorial note (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. In loving memory of grandma Ruth"
                      value={dedication}
                      onChange={(e) => setDedication(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  id="anonymous-toggle"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-church-gold-dark focus:ring-church-gold dark:border-slate-700"
                />
                <label htmlFor="anonymous-toggle" className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-w-0 flex-1">
                  Keep gift anonymous from congregation bulletins (official tax receipt will still be emailed to you)
                </label>
              </div>
            </div>

            {/* Payment */}
            <div className="pt-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Payment
              </span>

              {apiConfigLoading && (
                <div className="mb-4 rounded-xl border border-[#E8E2D9] bg-[#F7F4EF] px-4 py-3.5 text-sm text-slate-600">
                  Checking payment options…
                </div>
              )}
              <TurnstileWidget onToken={setTurnstileToken} className="mb-4" />
              {!apiConfigLoading && stripeLive && apiConfig?.stripePublishableKey && selectedFund && (
                <StripeCheckout
                  amount={principalAmount}
                  coverFees={coverFees}
                  donorName={isAnonymous ? 'Anonymous' : donorName}
                  donorEmail={donorEmail}
                  fundId={selectedFund.id}
                  fundCode={selectedFund.code}
                  fundName={selectedFund.name}
                  frequency={frequency}
                  isAnonymous={isAnonymous}
                  turnstileToken={turnstileToken}
                  publishableKey={apiConfig.stripePublishableKey}
                  onMethodChange={setFeeMethod}
                  onError={handlePaymentError}
                  onProcessing={handleStripeProcessing}
                />
              )}
              {!apiConfigLoading && !stripeLive && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Online giving is temporarily unavailable. Please email {apiConfig?.church?.email || 'stewardship@anointedworshipcenter.com'}.
                </div>
              )}
            </div>

            {/* Fee Coverage Checkbox */}
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coverFees}
                  onChange={(e) => setCoverFees(e.target.checked)}
                  className="mt-0.5 rounded border-church-gold text-church-burgundy focus:ring-church-gold"
                />
                <div className="text-xs">
                  <span className="font-semibold text-church-burgundy-dark dark:text-church-gold-light">
                    {feeLabel}
                  </span>
                  <p className="text-church-burgundy/80 dark:text-church-gold mt-0.5">
                    Adding ${feeAmount.toFixed(2)} ensures that 100% of your ${principalAmount.toFixed(2)} gift goes
                    directly into {selectedFund.name}.
                  </p>
                </div>
              </label>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Secure checkout via Stripe · Contribution receipt for your records</span>
            </div>

          </form>
        </div>

        <StewardshipFaq />
      </div>

    </div>
  );
};
