import React, { useCallback, useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationFrequency, PaymentMethod } from '../types';
import {
  CreditCard,
  Building2,
  Lock,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Landmark,
  ArrowRight,
} from 'lucide-react';
import { fetchApiConfig, type ApiConfig } from '../lib/api';
import {
  getDonorSessionEmail,
  loadDonorProfileByEmail,
  normalizeDonorEmail,
  setDonorSessionEmail,
} from '../lib/donorSession';
import { getTangibleImpact } from '../lib/tangibleImpact';
import { StripeCheckout } from './StripeCheckout';
import { PlaidBankLink } from './PlaidBankLink';
import { GivingOnboardingWizard } from './GivingOnboardingWizard';
import { StewardshipFaq } from './StewardshipFaq';

export { getTangibleImpact } from '../lib/tangibleImpact';

export const DonorPortal: React.FC<{
  onViewMyGiving?: (email: string) => void;
  initialMode?: 'classic' | 'guided';
  initialFundId?: string;
  onConsumedInitialFund?: () => void;
}> = ({ onViewMyGiving, initialMode = 'classic', initialFundId, onConsumedInitialFund }) => {
  const { funds, makeDonation, addNotification, donors, donations } = useChurch();
  const [giveMode, setGiveMode] = useState<'classic' | 'guided'>(initialMode);

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
  const [presetAmount, setPresetAmount] = useState<number | 'custom'>(100);
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [coverFees, setCoverFees] = useState<boolean>(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [lastGiftEmail, setLastGiftEmail] = useState<string | null>(null);

  // Donor credentials
  const [donorName, setDonorName] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [donorAddress, setDonorAddress] = useState<string>('');
  const [dedication, setDedication] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [profileFound, setProfileFound] = useState(false);
  const [profileLookingUp, setProfileLookingUp] = useState(false);
  const [profileStatus, setProfileStatus] = useState<'idle' | 'found' | 'new'>('idle');
  /** Name/address last applied by session/lookup — used so manual edits are not overwritten. */
  const autoFilledRef = React.useRef({ name: '', address: '' });
  const donorNameRef = React.useRef(donorName);
  const donorAddressRef = React.useRef(donorAddress);
  donorNameRef.current = donorName;
  donorAddressRef.current = donorAddress;

  // Card details (simulator)
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardExpiry, setCardExpiry] = useState<string>('');
  const [cardCvc, setCardCvc] = useState<string>('');
  const [cardZip, setCardZip] = useState<string>('');
  const [achBankName, setAchBankName] = useState<string>('');
  const [achRouting, setAchRouting] = useState<string>('');
  const [achAccount, setAchAccount] = useState<string>('');

  // Plaid simulator fallback labels
  const [plaidInstitution, setPlaidInstitution] = useState<string>('');
  const [plaidAccountMask, setPlaidAccountMask] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [show3DSModal, setShow3DSModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stripeLive = Boolean(apiConfig?.integrations.stripe.configured && apiConfig.stripePublishableKey);
  const plaidLive = Boolean(apiConfig?.integrations.plaid.configured);

  useEffect(() => {
    fetchApiConfig().then(setApiConfig);
  }, []);

  const applyProfilePrefill = useCallback(async (email: string, source: 'session' | 'lookup') => {
    const normalized = normalizeDonorEmail(email);
    if (!normalized.includes('@')) return;

    setProfileLookingUp(true);
    try {
      const profile = await loadDonorProfileByEmail(normalized, source, {
        donors,
        donations,
      });
      setDonorEmail(profile.email);

      const currentName = donorNameRef.current.trim();
      const currentAddress = donorAddressRef.current.trim();
      const nameIsAutoOrEmpty =
        !currentName || currentName === autoFilledRef.current.name.trim();
      const addressIsAutoOrEmpty =
        !currentAddress || currentAddress === autoFilledRef.current.address.trim();

      if (profile.found) {
        if (nameIsAutoOrEmpty && profile.name) {
          setDonorName(profile.name);
          autoFilledRef.current.name = profile.name;
        }
        if (addressIsAutoOrEmpty && profile.address) {
          setDonorAddress(profile.address);
          autoFilledRef.current.address = profile.address;
        }
        setProfileFound(true);
        setProfileStatus('found');
      } else {
        if (nameIsAutoOrEmpty) {
          setDonorName('');
          autoFilledRef.current.name = '';
        }
        if (addressIsAutoOrEmpty) {
          setDonorAddress('');
          autoFilledRef.current.address = '';
        }
        setProfileFound(false);
        setProfileStatus('new');
      }
    } catch {
      setProfileStatus('idle');
    } finally {
      setProfileLookingUp(false);
    }
  }, [donors, donations]);

  // Prefill from My Giving session when present (once on load)
  useEffect(() => {
    const sessionEmail = getDonorSessionEmail();
    if (sessionEmail) {
      void applyProfilePrefill(sessionEmail, 'session');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  const principalAmount =
    presetAmount === 'custom'
      ? parseFloat(customAmountStr) || 0
      : Number(presetAmount);

  const feeAmount =
    coverFees && principalAmount > 0
      ? paymentMethod === 'plaid'
        ? Number(Math.min(5.0, principalAmount * 0.008).toFixed(2))
        : Number(((principalAmount * 0.029) + 0.30).toFixed(2))
      : 0;
  const totalCharged = Number((principalAmount + feeAmount).toFixed(2));
  const tangibleImpact = getTangibleImpact(principalAmount, selectedFund.id);

  const handlePaymentError = useCallback((message: string) => {
    setErrorMessage(message);
    setIsProcessing(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (principalAmount <= 0) {
      setErrorMessage('Please select or specify a contribution amount greater than $0.');
      return;
    }

    if (!donorEmail || !donorEmail.includes('@')) {
      setErrorMessage('A valid email address is required for automated 501(c)(3) tax receipt delivery.');
      return;
    }

    // Live Stripe / Plaid flows use their own confirm buttons
    if (stripeLive && paymentMethod === 'card') return;
    if (plaidLive && paymentMethod === 'plaid') return;

    if (paymentMethod === 'card' && cardNumber.includes('0002')) {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        setErrorMessage('Your card was declined by the issuer (Error code: card_declined). Please try another card.');
      }, 900);
      return;
    }

    if (paymentMethod === 'card' && cardNumber.includes('3063')) {
      setShow3DSModal(true);
      return;
    }

    await executePayment();
  };

  const executePayment = async (overrides?: {
    paymentMethod?: PaymentMethod;
    cardBrand?: string;
    cardLast4?: string;
    stripePaymentIntentId?: string;
    plaidTransferId?: string;
    plaidInstitution?: string;
    plaidAccountMask?: string;
    awcDcbVoucher?: string;
    awcSynced?: boolean;
  }) => {
    setIsProcessing(true);
    try {
      if (!overrides) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      const method = overrides?.paymentMethod || paymentMethod;
      await makeDonation({
        amount: principalAmount,
        feeCovered: coverFees,
        frequency,
        fundId: selectedFund.id,
        donorName: isAnonymous ? 'Anonymous Donor' : donorName,
        donorEmail,
        donorAddress,
        paymentMethod: method,
        cardBrand:
          overrides?.cardBrand ||
          (method === 'plaid' ? plaidInstitution : method === 'ach' ? 'Bank ACH' : 'Visa'),
        cardLast4:
          overrides?.cardLast4 ||
          (method === 'plaid' ? plaidAccountMask : method === 'ach' ? '9012' : cardNumber.slice(-4)),
        dedication,
        isAnonymous,
        plaidInstitution: method === 'plaid' ? overrides?.plaidInstitution || plaidInstitution : undefined,
        plaidAccountMask: method === 'plaid' ? overrides?.plaidAccountMask || plaidAccountMask : undefined,
        stripePaymentIntentId: overrides?.stripePaymentIntentId,
        plaidTransferId: overrides?.plaidTransferId,
        awcDcbVoucher: overrides?.awcDcbVoucher,
        awcSynced: overrides?.awcSynced,
      });
      if (donorEmail.trim()) {
        const normalized = normalizeDonorEmail(donorEmail);
        setLastGiftEmail(normalized);
        setDonorSessionEmail(normalized);
      }
    } catch {
      setErrorMessage('An unexpected payment error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
      setShow3DSModal(false);
    }
  };

  const scrollToGiveForm = () => {
    document.getElementById('give-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      {giveMode === 'guided' ? (
        <GivingOnboardingWizard
          onExitToClassic={() => setGiveMode('classic')}
          onViewMyGiving={onViewMyGiving}
        />
      ) : (
        <>
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

        <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-32 sm:px-8 sm:pb-24 sm:pt-36">
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

          <div className="give-hero-rise-delay mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#D4AF37' }} />
              Stripe PCI-DSS
            </span>
            <span className="text-white/30">·</span>
            <span>501(c)(3) receipts</span>
            <span className="text-white/30">·</span>
            <span>Settled to DCU</span>
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
            <button
              type="button"
              onClick={() => setGiveMode('guided')}
              className="text-sm text-white/75 hover:text-white underline-offset-4 hover:underline transition-colors text-left"
            >
              Prefer a guided walkthrough?
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
                Gift received — thank you
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
                    className={`py-3 text-sm font-semibold rounded-xl border transition-all ${
                      presetAmount === amt
                        ? ''
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                    style={
                      presetAmount === amt
                        ? { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.12)', color: '#4A0404' }
                        : undefined
                    }
                  >
                    ${amt}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Enter a custom gift amount"
                  aria-pressed={presetAmount === 'custom'}
                  onClick={() => setPresetAmount('custom')}
                  className={`py-3 text-sm font-semibold rounded-xl border transition-all ${
                    presetAmount === 'custom'
                      ? ''
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                  style={
                    presetAmount === 'custom'
                      ? { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.12)', color: '#4A0404' }
                      : undefined
                  }
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

              {tangibleImpact && (
                <div
                  className="mt-4 rounded-xl border border-[#B7D4C2] px-4 py-3.5"
                  style={{
                    backgroundColor: '#ECF5EF',
                    borderLeftWidth: '3px',
                    borderLeftColor: '#3D7A5A',
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#3D7A5A] mb-1">
                    Tangible ministry impact
                  </p>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    <span className="font-semibold text-slate-900 dark:text-white">{tangibleImpact.headline}</span>
                    {' — '}
                    <span className="text-slate-600 dark:text-slate-300">{tangibleImpact.description}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                How often?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(['one-time', 'weekly', 'bi-weekly', 'monthly', 'annually'] as DonationFrequency[]).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequency(freq)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg transition-all capitalize whitespace-nowrap text-center ${
                      frequency === freq
                        ? 'bg-white text-slate-900 shadow-sm font-semibold dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {freq === 'bi-weekly' ? 'Bi-Weekly' : freq}
                  </button>
                ))}
              </div>
              {frequency !== 'one-time' && (
                <p className="text-xs text-church-burgundy dark:text-church-gold mt-2 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Recurring gifts sustain our pastors and local outreach year-round. Cancel anytime.</span>
                </p>
              )}
            </div>

            {/* Fund */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Designate to
              </label>
              <div className="space-y-2">
                {funds.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={`Designate gift to ${f.name}`}
                    aria-pressed={selectedFundId === f.id}
                    onClick={() => setSelectedFundId(f.id)}
                    className={`w-full p-4 text-left rounded-xl border transition-all ${
                      selectedFundId === f.id
                        ? 'border-[#D4AF37] bg-[rgba(212,175,55,0.08)]'
                        : 'border-slate-200 bg-transparent hover:border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{f.name}</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-snug">
                      {f.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

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
                    onChange={(e) => {
                      setDonorEmail(e.target.value);
                      setProfileStatus('idle');
                    }}
                    onBlur={() => {
                      const normalized = normalizeDonorEmail(donorEmail);
                      if (normalized.includes('@')) {
                        void applyProfilePrefill(normalized, 'lookup');
                      }
                    }}
                    required
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none"
                  />
                  {profileLookingUp && (
                    <p className="mt-1.5 text-[11px] text-slate-500">Looking up your giving profile…</p>
                  )}
                  {!profileLookingUp && (
                    <button
                      type="button"
                      disabled={!normalizeDonorEmail(donorEmail).includes('@')}
                      onClick={() => void applyProfilePrefill(donorEmail, 'lookup')}
                      className="mt-2 text-[11px] font-semibold underline-offset-2 hover:underline disabled:opacity-40"
                      style={{ color: '#4A0404' }}
                    >
                      Find my profile from prior gifts
                    </button>
                  )}
                  {!profileLookingUp && profileStatus === 'found' && profileFound && (
                    <p className="mt-1.5 text-[11px] font-medium" style={{ color: '#4A0404' }}>
                      Welcome back{donorName ? `, ${donorName.split(' ')[0]}` : ''} — we filled your details
                      from prior gifts. Confirm or edit below.
                    </p>
                  )}
                  {!profileLookingUp && profileStatus === 'new' && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      No prior gifts for this email — enter your details for this receipt.
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

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="anonymous-toggle"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded border-slate-300 text-church-gold-dark focus:ring-church-gold dark:border-slate-700"
                />
                <label htmlFor="anonymous-toggle" className="text-xs text-slate-600 dark:text-slate-400">
                  Keep gift anonymous from congregation bulletins (official tax receipt will still be emailed to you)
                </label>
              </div>
            </div>

            {/* Payment */}
            <div className="pt-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Payment
              </span>

              {/* Method Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paymentMethod === 'card'
                      ? 'border-church-gold bg-church-gold/10 text-church-burgundy font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('plaid')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paymentMethod === 'plaid'
                      ? 'border-church-gold bg-church-gold/10 text-church-burgundy font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <Landmark className="h-3.5 w-3.5" />
                  <span>Plaid Bank</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('ach')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paymentMethod === 'ach'
                      ? 'border-church-gold bg-church-gold/10 text-church-burgundy font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Manual ACH</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('apple_pay')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paymentMethod === 'apple_pay'
                      ? 'border-church-gold bg-church-gold/10 text-church-burgundy font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Wallet</span>
                </button>
              </div>

              {/* Card Inputs — live Stripe Elements or simulator */}
              {paymentMethod === 'card' && stripeLive && apiConfig?.stripePublishableKey && (
                <StripeCheckout
                  amount={principalAmount}
                  feeAmount={feeAmount}
                  donorName={isAnonymous ? 'Anonymous' : donorName}
                  donorEmail={donorEmail}
                  fundId={selectedFund.id}
                  fundCode={selectedFund.code}
                  fundName={selectedFund.name}
                  frequency={frequency}
                  isAnonymous={isAnonymous}
                  publishableKey={apiConfig.stripePublishableKey}
                  onError={handlePaymentError}
                  onSuccess={async (result) => {
                    await executePayment({
                      paymentMethod: 'card',
                      stripePaymentIntentId: result.paymentIntentId,
                      awcDcbVoucher: result.voucherNumber,
                      awcSynced: result.awcSynced,
                      cardBrand: 'Card',
                      cardLast4: '****',
                    });
                  }}
                />
              )}

              {paymentMethod === 'card' && !stripeLive && (
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Card Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                        placeholder="Card number"
                        autoComplete="cc-number"
                      />
                      <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Expires</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        autoComplete="cc-exp"
                        className="w-full px-2 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">CVC</label>
                      <input
                        type="text"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="CVC"
                        autoComplete="cc-csc"
                        className="w-full px-2 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Postal Code</label>
                      <input
                        type="text"
                        value={cardZip}
                        onChange={(e) => setCardZip(e.target.value)}
                        placeholder="ZIP"
                        autoComplete="postal-code"
                        className="w-full px-2 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Plaid bank link — live or simulator */}
              {paymentMethod === 'plaid' && plaidLive && (
                <PlaidBankLink
                  amount={principalAmount}
                  feeAmount={feeAmount}
                  donorName={isAnonymous ? 'Anonymous' : donorName}
                  donorEmail={donorEmail}
                  fundId={selectedFund.id}
                  fundCode={selectedFund.code}
                  fundName={selectedFund.name}
                  frequency={frequency}
                  isAnonymous={isAnonymous}
                  onError={handlePaymentError}
                  onSuccess={async (result) => {
                    setPlaidInstitution(result.institutionName);
                    setPlaidAccountMask(result.accountMask);
                    await executePayment({
                      paymentMethod: 'plaid',
                      plaidTransferId: result.transferId,
                      plaidInstitution: result.institutionName,
                      plaidAccountMask: result.accountMask,
                      cardBrand: result.institutionName,
                      cardLast4: result.accountMask,
                      awcDcbVoucher: result.voucherNumber,
                      awcSynced: result.awcSynced,
                    });
                  }}
                />
              )}

              {paymentMethod === 'plaid' && !plaidLive && (
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    Enter your bank details to continue. Live Plaid linking activates once bank credentials are configured.
                  </p>
                  <div>
                    <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Institution</label>
                    <input
                      type="text"
                      value={plaidInstitution}
                      onChange={(e) => setPlaidInstitution(e.target.value)}
                      placeholder="Your bank or credit union"
                      className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Account ending in</label>
                    <input
                      type="text"
                      value={plaidAccountMask}
                      onChange={(e) => setPlaidAccountMask(e.target.value)}
                      placeholder="Last 4 digits"
                      className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* ACH Inputs */}
              {paymentMethod === 'ach' && (
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={achBankName}
                      onChange={(e) => setAchBankName(e.target.value)}
                      placeholder="Bank name"
                      className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Routing Number</label>
                      <input
                        type="text"
                        value={achRouting}
                        onChange={(e) => setAchRouting(e.target.value)}
                        placeholder="9-digit routing"
                        className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Account Number</label>
                      <input
                        type="text"
                        value={achAccount}
                        onChange={(e) => setAchAccount(e.target.value)}
                        placeholder="Account number"
                        className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Apple Pay / Digital Wallet */}
              {paymentMethod === 'apple_pay' && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {stripeLive
                      ? 'Use the Card tab — Stripe Payment Element includes Apple Pay / Google Pay when available on your device.'
                      : 'One-touch authentication with Apple Pay / Google Pay. Ready on your secure device (simulator).'}
                  </p>
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
                    Cover credit card processing fee (${feeAmount.toFixed(2)})
                  </span>
                  <p className="text-church-burgundy/80 dark:text-church-gold mt-0.5">
                    Adding ${feeAmount.toFixed(2)} ensures that 100% of your ${principalAmount.toFixed(2)} pledge goes directly into {selectedFund.name}.
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

            {/* Primary Submit Button — hidden when live Stripe/Plaid UI owns confirmation */}
            {!(stripeLive && paymentMethod === 'card') && !(plaidLive && paymentMethod === 'plaid') && (
            <button
              type="submit"
              disabled={isProcessing || principalAmount <= 0}
              className="give-cta w-full py-3.5 px-4 text-white font-semibold text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#4A0404' }}
            >
              {isProcessing ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Securing Payment with Stripe...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-church-gold-light" />
                  <span>
                    Give ${totalCharged.toFixed(2)}{' '}
                    {frequency !== 'one-time' ? `${frequency}` : 'Now'}
                  </span>
                </>
              )}
            </button>
            )}

            <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>TLS 1.3 · Stripe PCI-DSS Level 1 · IRS 501(c)(3) Receipt Issued Immediately</span>
            </div>

          </form>
        </div>

        <StewardshipFaq />
      </div>


      {/* 3D Secure Simulation Modal */}
      {show3DSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 mb-4">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
              Stripe 3D Secure Verification
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Your financial institution requires two-factor confirmation for this transaction of <strong>${totalCharged.toFixed(2)}</strong>.
            </p>

            <div className="my-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-left text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant:</span>
                <span className="font-semibold text-slate-900 dark:text-white">AWC Tithe</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cardholder:</span>
                <span>{donorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Card ending:</span>
                <span className="font-mono">•••• 3063</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShow3DSModal(false)}
                className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executePayment()}
                className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
              >
                Authorize Payment
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}
    </div>
  );
};
