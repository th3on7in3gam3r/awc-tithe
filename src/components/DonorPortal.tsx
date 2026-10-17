import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationFrequency } from '../types';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Lock, Mail } from 'lucide-react';
import {
  createManualGift,
  fetchApiConfig,
  pollStripePaymentStatus,
  type ApiConfig,
  type DonorManualGift,
} from '../lib/api';
import {
  loadVerifiedDonorProfile,
  normalizeDonorEmail,
  setDonorSessionEmail,
} from '../lib/donorSession';
import { computeProcessingFee } from '../../shared/fees';
import { StripeCheckout } from './StripeCheckout';
import { StewardshipFaq } from './StewardshipFaq';
import { TurnstileWidget, getTurnstileSiteKey } from './TurnstileWidget';
import { ManualGiftHandoff } from './ManualGiftHandoff';
import { parseGiveLink, stripGiveLink } from '../lib/giveLink';

type MethodId = 'card' | 'us_bank_account' | 'cashapp' | 'zelle' | 'venmo' | 'cash_app';
type Step = 'details' | 'stripe' | 'manual' | 'done';

interface MethodOption {
  id: MethodId;
  label: string;
  tag: string;
  instant: boolean;
  disabledReason?: string;
}

const PRESETS = [50, 100, 250, 500];

const FREQUENCIES: Array<{ id: DonationFrequency; label: string; adverb: string }> = [
  { id: 'one-time', label: 'One time', adverb: '' },
  { id: 'weekly', label: 'Weekly', adverb: 'weekly' },
  { id: 'bi-weekly', label: 'Every 2 weeks', adverb: 'every 2 weeks' },
  { id: 'monthly', label: 'Monthly', adverb: 'monthly' },
  { id: 'annually', label: 'Yearly', adverb: 'yearly' },
];

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const RETURN_FLAG = 'gift_return';

function SectionLabel({ n, children, id }: { n: string; children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="mb-4 flex items-baseline gap-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-awc-muted">
      <span className="font-serif-display text-xl normal-case tracking-normal text-awc-accent" aria-hidden="true">
        {n}
      </span>
      {children}
    </p>
  );
}

const inputClass =
  'w-full min-h-12 rounded-xl border-[1.5px] border-awc-line bg-awc-paper px-4 text-[15px] text-awc-ink outline-none transition-colors placeholder:text-awc-muted/70 focus:border-awc-accent';

export const DonorPortal: React.FC<{
  onViewMyGiving?: (email: string) => void;
  initialFundId?: string;
  onConsumedInitialFund?: () => void;
}> = ({ onViewMyGiving, initialFundId, onConsumedInitialFund }) => {
  const { funds } = useChurch();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  /** Turnstile tokens are single-use: remount the widget whenever we return to the form. */
  const [turnstileKey, setTurnstileKey] = useState(0);

  const [frequency, setFrequency] = useState<DonationFrequency>('one-time');
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
  const [method, setMethod] = useState<MethodId>('card');
  const [feeMethod, setFeeMethod] = useState<string>('card');
  const [step, setStep] = useState<Step>('details');
  const [starting, setStarting] = useState(false);

  // Donor details
  const [donorName, setDonorName] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [donorAddress, setDonorAddress] = useState<string>('');
  const [dedication, setDedication] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [profilePrefillApplied, setProfilePrefillApplied] = useState(false);

  const [manualGift, setManualGift] = useState<{ gift: DonorManualGift; claimToken: string } | null>(null);
  const [doneState, setDoneState] = useState<{ status: 'processing' | 'completed'; receiptNumber?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stripeLive = Boolean(apiConfig?.integrations.stripe.configured && apiConfig.stripePublishableKey);
  const paymentOptions = apiConfig?.paymentOptions;
  const minGift = (apiConfig?.minGiftCents ?? 500) / 100;

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
      if (profile.name) setDonorName(profile.name);
      if (profile.address) setDonorAddress(profile.address);
      setProfilePrefillApplied(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Links from AWC Connect / the church website can pre-select method and amount.
  useEffect(() => {
    const link = parseGiveLink(window.location.search);
    if (link.frequency) setFrequency(link.frequency);
    if (link.method) setMethod(link.method);
    if (link.amount) {
      if ((PRESETS as number[]).includes(link.amount)) {
        setPresetAmount(link.amount);
      } else {
        setPresetAmount('custom');
        setCustomAmountStr(String(link.amount));
      }
    }
    if (link.method || link.amount || link.frequency || new URLSearchParams(window.location.search).has('from')) {
      window.history.replaceState(null, '', stripGiveLink(window.location.pathname, window.location.search));
    }
  }, []);

  // Coming back from a redirect-based payment (e.g. Cash App Pay on a phone)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RETURN_FLAG)) return;
    const paymentIntentId = params.get('payment_intent') || '';
    const redirectStatus = params.get('redirect_status') || '';
    window.history.replaceState(null, '', window.location.pathname);
    if (!paymentIntentId) return;
    if (redirectStatus === 'failed') {
      setErrorMessage('The payment was not completed. You can try again or choose another method.');
      return;
    }
    setStep('done');
    setDoneState({ status: 'processing' });
    void pollStripePaymentStatus(paymentIntentId)
      .then((s) => {
        if (s.status === 'failed') {
          setStep('details');
          setDoneState(null);
          setErrorMessage('The payment did not go through. You can try another method.');
          return;
        }
        setDoneState({ status: s.status === 'completed' ? 'completed' : 'processing', receiptNumber: s.receiptNumber });
      })
      .catch(() => undefined);
  }, []);

  // Each step starts at the top of the gift area, not wherever the donor had scrolled to.
  const firstStepRender = React.useRef(true);
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    const el = document.getElementById('give-form');
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [step]);

  const activeFunds = funds.filter((f) => f.active);
  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  const principalAmount = presetAmount === 'custom' ? parseFloat(customAmountStr) || 0 : Number(presetAmount);

  const methods: MethodOption[] = useMemo(() => {
    const list: MethodOption[] = [];
    if (stripeLive) {
      list.push({ id: 'card', label: 'Card or Apple Pay', tag: 'Confirmed instantly', instant: true });
      list.push({ id: 'us_bank_account', label: 'Bank account', tag: 'Lowest fee', instant: true });
      if (paymentOptions?.cashAppPay) {
        list.push({
          id: 'cashapp',
          label: 'Cash App',
          tag: 'Confirmed instantly',
          instant: true,
          disabledReason: frequency !== 'one-time' ? 'One-time gifts only' : undefined,
        });
      }
    }
    const manualReason = frequency !== 'one-time' ? 'One-time gifts only' : undefined;
    if (paymentOptions?.zelle.enabled) {
      list.push({ id: 'zelle', label: 'Zelle', tag: 'Confirmed by Finance', instant: false, disabledReason: manualReason });
    }
    if (paymentOptions?.venmo.enabled) {
      list.push({ id: 'venmo', label: 'Venmo', tag: 'Confirmed by Finance', instant: false, disabledReason: manualReason });
    }
    // One Cash App tile: Cash App Pay (Stripe, instant) wins over send-to-$cashtag.
    if (paymentOptions?.cashApp?.enabled && !(stripeLive && paymentOptions?.cashAppPay)) {
      list.push({ id: 'cash_app', label: 'Cash App', tag: 'Confirmed by Finance', instant: false, disabledReason: manualReason });
    }
    return list;
  }, [stripeLive, paymentOptions, frequency]);

  // Keep the chosen method valid as options/frequency change
  useEffect(() => {
    const current = methods.find((m) => m.id === method);
    // A "Cash App" link means whichever Cash App option is offered.
    if (!current && method === 'cash_app' && methods.some((m) => m.id === 'cashapp' && !m.disabledReason)) {
      setMethod('cashapp');
      return;
    }
    if (!current || current.disabledReason) {
      const fallback = methods.find((m) => !m.disabledReason);
      if (fallback && fallback.id !== method) setMethod(fallback.id);
    }
  }, [methods, method]);

  const currentMethod = methods.find((m) => m.id === method);
  const isManual = method === 'zelle' || method === 'venmo' || method === 'cash_app';
  const effectiveFeeMethod = step === 'stripe' ? feeMethod : method;
  const { feeAmount, totalCharged } = computeProcessingFee({
    principal: principalAmount,
    method: effectiveFeeMethod,
    coverFees: !isManual && coverFees,
  });
  const freqInfo = FREQUENCIES.find((f) => f.id === frequency) || FREQUENCIES[0];
  const cadence = isManual ? '' : freqInfo.adverb;

  const handlePaymentError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const rememberEmail = () => {
    if (donorEmail.trim()) setDonorSessionEmail(normalizeDonorEmail(donorEmail));
  };

  const handleStripeProcessing = (result: { status: string; receiptNumber?: string }) => {
    if (result.status === 'failed') {
      setErrorMessage('The payment did not go through. You can try another method.');
      return;
    }
    rememberEmail();
    setErrorMessage(null);
    setStep('done');
    setDoneState({ status: result.status === 'completed' ? 'completed' : 'processing', receiptNumber: result.receiptNumber });
  };

  const backToDetails = () => {
    setStep('details');
    setManualGift(null);
    setErrorMessage(null);
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
  };

  const validate = (): string | null => {
    if (!(principalAmount >= minGift)) return `Enter a gift of at least ${money(minGift)}.`;
    if (!isEmail(donorEmail)) return 'Enter the email where your receipt should go.';
    if (!donorName.trim()) return 'Enter your full name for your receipt.';
    if (!selectedFund) return 'Choose a fund to give to.';
    if (!currentMethod || currentMethod.disabledReason) return 'Choose how you would like to give.';
    if (getTurnstileSiteKey() && !turnstileToken) return 'Please complete the quick verification check above the button.';
    return null;
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage(null);
    if (!isManual) {
      setFeeMethod(method);
      setStep('stripe');
      return;
    }
    setStarting(true);
    try {
      const result = await createManualGift({
        provider: method as 'zelle' | 'venmo' | 'cash_app',
        amount: principalAmount,
        fundId: selectedFund.id,
        donorName: donorName.trim(),
        donorEmail: donorEmail.trim(),
        isAnonymous,
        turnstileToken,
      });
      rememberEmail();
      setManualGift(result);
      setStep('manual');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not start this gift. Please try again.');
      setTurnstileToken(null);
      setTurnstileKey((k) => k + 1);
    } finally {
      setStarting(false);
    }
  };

  const returnUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?${RETURN_FLAG}=1` : `/?${RETURN_FLAG}=1`;
  const giveLabel = `Give ${money(totalCharged)}${cadence ? ` ${cadence}` : ''}`;
  const summaryLine = [cadence ? freqInfo.label : 'One time', selectedFund?.name, currentMethod?.label]
    .filter(Boolean)
    .join(' · ');

  const amountDisplay =
    presetAmount === 'custom' ? customAmountStr : String(presetAmount);

  return (
    <div className="bg-awc-cream">
      <div className="flex flex-wrap">
        {/* ---------------------------------------------------------------- */}
        {/* Message panel                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Why we give"
          className="relative isolate w-full overflow-hidden bg-awc-wine text-awc-on-wine lg:sticky lg:top-[72px] lg:h-[calc(100vh-72px)] lg:w-[42%] lg:self-start"
        >
          <img
            src="/assets/images/awc_giving_hero.jpg"
            alt=""
            aria-hidden="true"
            className="give-hero-media absolute inset-0 -z-20 h-full w-full object-cover object-[68%_center] opacity-30"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{ background: 'linear-gradient(180deg, rgba(59,10,13,0.86) 0%, rgba(42,7,9,0.94) 100%)' }}
          />
          <div className="flex h-full flex-col justify-between gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:overflow-y-auto lg:px-14 lg:py-16">
            <div className="give-hero-rise max-w-[520px] space-y-6">
              <div className="flex items-center gap-3">
                <img
                  src="/images/awc-crest.png"
                  alt=""
                  className="h-12 w-12 object-contain drop-shadow-md sm:h-14 sm:w-14"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/images/awc-logo.png';
                  }}
                />
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-awc-gold">Tithes &amp; Offerings</p>
                  <p className="text-sm text-awc-on-wine-muted">Where Everybody Is Somebody</p>
                </div>
              </div>
              <h1 className="font-serif-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.01em] text-balance sm:text-5xl lg:text-[3.6rem] xl:text-[4.1rem]">
                Honor the Lord with your first fruits.
              </h1>
              <p className="max-w-md text-base leading-relaxed text-awc-on-wine-muted sm:text-lg">
                Your giving keeps the doors open, supports our pastors, and carries the gospel into our community.
                Thank you for sowing into this house.
              </p>
              <figure className="border-t border-[rgba(233,201,121,0.3)] pt-6">
                <blockquote className="font-serif-display text-2xl italic leading-snug text-awc-on-wine sm:text-[1.65rem]">
                  “God loveth a cheerful giver.”
                </blockquote>
                <figcaption className="mt-2 text-[13px] tracking-[0.08em] text-awc-on-wine-muted">2 Corinthians 9:7</figcaption>
              </figure>
            </div>

            <ul className="give-hero-rise-delay hidden max-w-[460px] space-y-4 sm:block">
              <li className="flex items-start gap-3.5">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-awc-gold" aria-hidden="true" />
                <span className="text-[15px] leading-relaxed text-awc-on-wine-muted">
                  <strong className="font-semibold text-awc-on-wine">Secure checkout.</strong> Card and bank details go
                  straight to Stripe and never touch church servers.
                </span>
              </li>
              <li className="flex items-start gap-3.5">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-awc-gold" aria-hidden="true" />
                <span className="text-[15px] leading-relaxed text-awc-on-wine-muted">
                  <strong className="font-semibold text-awc-on-wine">A receipt for every gift,</strong> emailed once the
                  payment is confirmed.
                </span>
              </li>
              <li className="flex items-start gap-3.5">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-awc-gold" aria-hidden="true" />
                <span className="text-[15px] leading-relaxed text-awc-on-wine-muted">
                  <strong className="font-semibold text-awc-on-wine">Year-end statement</strong> for your taxes, from{' '}
                  {(apiConfig?.church?.legalEntityName || 'Anointed Worship Center').replace(/\.$/, '')}.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Gift                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section aria-label="Your gift" className="w-full min-w-0 px-4 py-12 sm:px-8 sm:py-16 lg:w-[58%] lg:px-12 lg:py-16">
          <div id="give-form" className="give-form-enter mx-auto w-full max-w-[600px] scroll-mt-24">
            {apiConfig?.integrations.stripe.mode === 'sandbox' ? (
              <div className="mb-8 rounded-xl border border-awc-warn-line bg-awc-warn-bg px-4 py-3 text-sm leading-relaxed text-awc-warn" role="note">
                <strong className="font-semibold">Test mode.</strong> Card and bank payments are not real yet and no money
                will be taken. Use Stripe test card 4242 4242 4242 4242 to try it.
              </div>
            ) : null}
            {errorMessage && step !== 'done' ? (
              <div className="mb-8 flex items-start gap-2.5 rounded-xl bg-awc-bad-bg px-4 py-3 text-sm text-awc-bad" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {/* ---------- Thank you ---------- */}
            {step === 'done' && doneState ? (
              <div className="space-y-6" role="status">
                <div className="flex items-start gap-4">
                  {doneState.status === 'completed' ? (
                    <CheckCircle2 className="mt-1 h-8 w-8 shrink-0 text-awc-ok" aria-hidden="true" />
                  ) : (
                    <Clock className="mt-1 h-8 w-8 shrink-0 text-awc-warn" aria-hidden="true" />
                  )}
                  <div className="space-y-2">
                    <h2 className="font-serif-display text-4xl font-medium leading-tight text-awc-ink">
                      {doneState.status === 'completed' ? 'Thank you for your gift.' : 'Your gift is processing.'}
                    </h2>
                    <p className="text-[15px] leading-relaxed text-awc-muted">
                      {doneState.status === 'completed'
                        ? doneState.receiptNumber
                          ? `Receipt ${doneState.receiptNumber} is on its way to your inbox.`
                          : 'Your receipt is on its way to your inbox.'
                        : 'Bank payments can take a few business days to clear. We will email your receipt as soon as the payment is confirmed.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {onViewMyGiving ? (
                    <button
                      type="button"
                      onClick={() => onViewMyGiving(normalizeDonorEmail(donorEmail) || '')}
                      className="inline-flex min-h-12 items-center justify-center rounded-full bg-awc-primary px-6 text-[15px] font-semibold text-awc-on-primary"
                    >
                      View My giving
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setDoneState(null);
                      backToDetails();
                    }}
                    className="inline-flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-awc-line px-6 text-[15px] font-semibold text-awc-ink hover:border-awc-accent"
                  >
                    Give another gift
                  </button>
                </div>
              </div>
            ) : null}

            {/* ---------- Zelle / Venmo hand-off ---------- */}
            {step === 'manual' && manualGift && paymentOptions ? (
              <ManualGiftHandoff
                gift={manualGift.gift}
                claimToken={manualGift.claimToken}
                paymentOptions={paymentOptions}
                donorEmail={donorEmail.trim()}
                onBack={backToDetails}
                onViewMyGiving={onViewMyGiving ? () => onViewMyGiving(normalizeDonorEmail(donorEmail) || '') : undefined}
              />
            ) : null}

            {/* ---------- Stripe payment ---------- */}
            {step === 'stripe' && apiConfig?.stripePublishableKey && selectedFund ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={backToDetails}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-awc-muted transition-colors hover:text-awc-ink"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Change gift
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-awc-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Secured by Stripe
                  </span>
                </div>
                <div className="rounded-2xl border border-awc-line bg-awc-paper p-5">
                  <p className="text-sm text-awc-muted">{summaryLine}</p>
                  <p className="mt-1 font-serif-display text-5xl leading-none text-awc-ink tabular-nums">
                    {money(principalAmount)}
                    {cadence ? <span className="ml-2 font-sans text-base text-awc-muted">{cadence}</span> : null}
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-snug text-awc-ink">
                  <input
                    type="checkbox"
                    checked={coverFees}
                    onChange={(e) => setCoverFees(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--awc-primary)]"
                  />
                  <span>
                    Add {money(computeProcessingFee({ principal: principalAmount, method: feeMethod, coverFees: true }).feeAmount)} so
                    the full gift reaches the church{' '}
                    <span className="text-awc-muted">(covers processing fees)</span>
                  </span>
                </label>
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
                  preferredMethod={method}
                  returnUrl={returnUrl}
                  submitLabel={giveLabel}
                  onMethodChange={setFeeMethod}
                  onError={handlePaymentError}
                  onProcessing={handleStripeProcessing}
                />
                <p className="text-center text-[13px] text-awc-muted">
                  {frequency !== 'one-time'
                    ? 'Recurring gifts can be changed or cancelled anytime from My giving.'
                    : 'You will receive an emailed receipt once the payment is confirmed.'}
                </p>
              </div>
            ) : null}

            {/* ---------- Gift details ---------- */}
            {step === 'details' ? (
              <form onSubmit={(e) => void handleContinue(e)} className="space-y-11" noValidate>
                {/* 01 Amount */}
                <fieldset aria-labelledby="amount-label">
                  <SectionLabel n="01" id="amount-label">Amount</SectionLabel>
                  <div className="mb-4 flex items-baseline gap-1.5 border-b-[1.5px] border-awc-ink pb-3">
                    <span className="font-serif-display text-5xl text-awc-muted" aria-hidden="true">$</span>
                    {presetAmount === 'custom' ? (
                      <>
                        <label htmlFor="custom-amount" className="sr-only">Gift amount in dollars</label>
                        <input
                          id="custom-amount"
                          type="number"
                          inputMode="decimal"
                          min={minGift}
                          step="any"
                          autoFocus
                          placeholder="0"
                          value={customAmountStr}
                          onChange={(e) => setCustomAmountStr(e.target.value)}
                          className="awc-amount-input w-full min-w-0 flex-1 border-0 bg-transparent p-0 font-serif-display text-7xl leading-none text-awc-ink outline-none placeholder:text-awc-line sm:text-[5.5rem]"
                        />
                      </>
                    ) : (
                      <span className="font-serif-display text-7xl leading-none text-awc-ink tabular-nums sm:text-[5.5rem]" aria-live="polite">
                        {amountDisplay}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESETS.map((amt) => {
                      const on = presetAmount === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          aria-pressed={on}
                          aria-label={`Give $${amt}`}
                          onClick={() => {
                            setPresetAmount(amt);
                            setCustomAmountStr('');
                          }}
                          className={`min-h-[52px] rounded-xl border-[1.5px] text-base font-semibold transition-colors ${
                            on
                              ? 'border-awc-selected bg-awc-selected text-awc-on-selected'
                              : 'border-awc-line bg-awc-paper text-awc-ink hover:border-awc-accent'
                          }`}
                        >
                          ${amt}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-pressed={presetAmount === 'custom'}
                      onClick={() => setPresetAmount('custom')}
                      className={`min-h-[52px] rounded-xl border-[1.5px] text-base font-semibold transition-colors ${
                        presetAmount === 'custom'
                          ? 'border-awc-selected bg-awc-selected text-awc-on-selected'
                          : 'border-awc-line bg-awc-paper text-awc-ink hover:border-awc-accent'
                      }`}
                    >
                      Other
                    </button>
                  </div>
                </fieldset>

                {/* 02 Frequency */}
                <fieldset aria-labelledby="freq-label">
                  <SectionLabel n="02" id="freq-label">How often</SectionLabel>
                  <div className="flex flex-wrap gap-1 rounded-[14px] bg-awc-sand p-1">
                    {FREQUENCIES.map((f) => {
                      const on = frequency === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setFrequency(f.id)}
                          className={`min-h-[46px] flex-auto rounded-[10px] px-3.5 text-[15px] transition-colors ${
                            on
                              ? 'bg-awc-paper font-semibold text-awc-ink shadow-[0_1px_3px_rgba(59,10,13,0.15)]'
                              : 'font-medium text-awc-muted hover:text-awc-ink'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  {frequency !== 'one-time' ? (
                    <p className="mt-2.5 text-[13px] text-awc-muted">
                      Recurring gifts sustain our pastors and local outreach year-round. Change or cancel anytime.
                    </p>
                  ) : null}
                </fieldset>

                {/* 03 Fund — only when there's a choice */}
                {activeFunds.length > 1 ? (
                  <fieldset aria-labelledby="fund-label">
                    <SectionLabel n="03" id="fund-label">Give to</SectionLabel>
                    <div className="space-y-2.5">
                      {activeFunds.map((f) => {
                        const on = selectedFundId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setSelectedFundId(f.id)}
                            className={`w-full min-h-[3.25rem] rounded-[14px] border-2 bg-awc-paper p-4 text-left transition-colors ${
                              on ? 'border-awc-accent' : 'border-awc-line hover:border-awc-accent/60'
                            }`}
                          >
                            <span className="text-[15px] font-semibold text-awc-ink">{f.name}</span>
                            {f.description ? (
                              <span className="mt-1 block text-[13px] leading-snug text-awc-muted line-clamp-2">{f.description}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}

                {/* Your details */}
                <fieldset aria-labelledby="details-label">
                  <SectionLabel n={activeFunds.length > 1 ? '04' : '03'} id="details-label">Your details</SectionLabel>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="donor-email" className="mb-1.5 block text-sm font-semibold text-awc-ink">
                        Email for your receipt
                      </label>
                      <input
                        id="donor-email"
                        type="email"
                        value={donorEmail}
                        onChange={(e) => setDonorEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        autoComplete="email"
                        className={inputClass}
                      />
                      {profilePrefillApplied ? (
                        <p className="mt-1.5 text-[13px] text-awc-accent">
                          Welcome back{donorName ? `, ${donorName.split(' ')[0]}` : ''}. Your details are filled in from My
                          giving.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[13px] text-awc-muted">
                          Given before?{' '}
                          <button
                            type="button"
                            onClick={() => onViewMyGiving?.(normalizeDonorEmail(donorEmail) || '')}
                            className="font-semibold text-awc-accent underline-offset-2 hover:underline"
                          >
                            Sign in to My giving
                          </button>{' '}
                          to fill these in.
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="donor-name" className="mb-1.5 block text-sm font-semibold text-awc-ink">
                        Full name
                      </label>
                      <input
                        id="donor-name"
                        type="text"
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value)}
                        required
                        placeholder="As it should appear on your receipt"
                        autoComplete="name"
                        className={inputClass}
                      />
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-snug text-awc-ink">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--awc-primary)]"
                      />
                      <span>
                        Keep my gift anonymous in church bulletins{' '}
                        <span className="text-awc-muted">(you'll still get your receipt)</span>
                      </span>
                    </label>
                    <details className="group rounded-xl border border-awc-line bg-awc-paper/60 px-4 py-1">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-awc-ink">
                        Add a dedication or mailing address
                        <span className="text-awc-muted transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                      </summary>
                      <div className="space-y-4 pb-4 pt-2">
                        <div>
                          <label htmlFor="donor-address" className="mb-1.5 block text-sm font-semibold text-awc-ink">
                            Mailing address <span className="font-normal text-awc-muted">(for your year-end statement)</span>
                          </label>
                          <input
                            id="donor-address"
                            type="text"
                            value={donorAddress}
                            onChange={(e) => setDonorAddress(e.target.value)}
                            placeholder="Street, City, State, ZIP"
                            autoComplete="street-address"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="donor-dedication" className="mb-1.5 block text-sm font-semibold text-awc-ink">
                            Dedication or memorial note
                          </label>
                          <input
                            id="donor-dedication"
                            type="text"
                            value={dedication}
                            onChange={(e) => setDedication(e.target.value)}
                            placeholder="In loving memory of…"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                </fieldset>

                {/* Pay with */}
                <fieldset aria-labelledby="method-label">
                  <SectionLabel n={activeFunds.length > 1 ? '05' : '04'} id="method-label">Pay with</SectionLabel>
                  {apiConfigLoading ? (
                    <div className="rounded-xl border border-dashed border-awc-line px-4 py-4 text-sm text-awc-muted" role="status">
                      Checking payment options…
                    </div>
                  ) : methods.length === 0 ? (
                    <div className="rounded-xl border border-awc-line bg-awc-paper px-4 py-4 text-[15px] text-awc-ink">
                      Online giving is temporarily unavailable. Please email{' '}
                      <a className="font-semibold text-awc-accent underline" href={`mailto:${apiConfig?.church?.email || 'stewardship@anointedworshipcenter.com'}`}>
                        {apiConfig?.church?.email || 'stewardship@anointedworshipcenter.com'}
                      </a>
                      .
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
                      {methods.map((m) => {
                        const on = method === m.id;
                        const disabled = Boolean(m.disabledReason);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={on}
                            disabled={disabled}
                            onClick={() => setMethod(m.id)}
                            className={`flex min-h-[78px] flex-col justify-center gap-1.5 rounded-[14px] border-2 bg-awc-paper px-4 py-3 text-left transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-55 ${
                              on && !disabled
                                ? 'border-awc-accent shadow-[0_0_0_4px_rgba(201,154,62,0.18)]'
                                : 'border-awc-line hover:border-awc-accent/60'
                            }`}
                          >
                            <span className="text-base font-semibold text-awc-ink">{m.label}</span>
                            <span
                              className={`text-xs font-semibold tracking-[0.03em] ${
                                disabled ? 'text-awc-muted' : m.instant ? 'text-awc-ok' : 'text-awc-warn'
                              }`}
                            >
                              {m.disabledReason || m.tag}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {isManual ? (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-awc-warn-line bg-awc-warn-bg p-4 text-awc-warn">
                      <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p className="text-[15px] leading-relaxed">
                        <strong className="font-semibold">You'll send this from your own {currentMethod?.label} app.</strong>{' '}
                        We'll show you the church's {currentMethod?.label} details and a memo code. Your gift shows as
                        pending until our Finance team confirms it, usually within 2 business days. Then your receipt is
                        emailed.
                      </p>
                    </div>
                  ) : null}
                </fieldset>

                {/* Summary + continue */}
                <div className="space-y-4 border-t border-awc-line pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[15px] text-awc-muted">{summaryLine || 'Your gift'}</span>
                    <span className="font-serif-display text-3xl font-semibold text-awc-ink tabular-nums">
                      {money(principalAmount)}
                      {cadence ? <span className="ml-1.5 font-sans text-sm font-normal text-awc-muted">{cadence}</span> : null}
                    </span>
                  </div>
                  {!isManual && coverFees && feeAmount > 0 ? (
                    <p className="-mt-2 text-right text-[13px] text-awc-muted">
                      You'll have the option to add {money(feeAmount)} for processing fees on the next step.
                    </p>
                  ) : null}
                  <TurnstileWidget key={turnstileKey} onToken={setTurnstileToken} className="flex justify-center" />
                  <button
                    type="submit"
                    disabled={starting || apiConfigLoading || methods.length === 0}
                    className="flex w-full min-h-[60px] items-center justify-center gap-2.5 rounded-full bg-awc-primary text-[17px] font-semibold tracking-[0.01em] text-awc-on-primary transition-[transform,box-shadow,opacity] hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(59,10,13,0.28)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    {starting
                      ? 'One moment…'
                      : isManual
                        ? `Continue to ${currentMethod?.label}`
                        : 'Continue to secure payment'}
                    <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <p className="text-center text-[13px] text-awc-muted">
                    Your details are used only for your receipt and My giving. They're never shown publicly.
                  </p>
                </div>
              </form>
            ) : null}
          </div>

          <div className="mx-auto mt-16 w-full max-w-[600px]">
            <StewardshipFaq />
          </div>
        </section>
      </div>
    </div>
  );
};
