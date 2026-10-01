import React, { useCallback, useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationFrequency, PaymentMethod } from '../types';
import {
  CreditCard,
  Building2,
  Heart,
  Lock,
  CheckCircle2,
  Sparkles,
  Info,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  HeartHandshake,
  Utensils,
  Droplets,
  GraduationCap,
  Landmark,
  Check,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { fetchApiConfig, type ApiConfig } from '../lib/api';
import { StripeCheckout } from './StripeCheckout';
import { PlaidBankLink } from './PlaidBankLink';

export const getTangibleImpact = (amount: number, fundId: string) => {
  if (amount <= 0) return null;

  if (fundId === 'fund-benevolence') {
    const meals = Math.floor(amount / 5);
    const groceryKits = Math.floor(amount / 25);
    return {
      category: 'Hunger Relief & Benevolence',
      headline: `${meals} Warm Nutritious Meals`,
      icon: Utensils,
      description: `Your $${amount.toFixed(0)} donation provided ${meals} warm meals for local families and unhoused neighbors through our weekly food pantry.`,
      secondary: groceryKits > 0 ? `Also funds ${groceryKits} emergency pantry grocery packs.` : undefined,
    };
  } else if (fundId === 'fund-missions') {
    const filters = Math.floor(amount / 50);
    const medicalPacks = Math.floor(amount / 20);
    return {
      category: 'Global Compassion & Health',
      headline: filters > 0 ? `${filters} Gravity Clean Water Filters` : `${medicalPacks} Emergency Medical Kits`,
      icon: Droplets,
      description: filters > 0
        ? `Your $${amount.toFixed(0)} gift provided ${filters} clean water filter units, supplying safe drinking water to families for 2 years.`
        : `Your $${amount.toFixed(0)} gift provided ${medicalPacks} emergency first-aid and pediatric health kits to partner clinics.`,
      secondary: 'Directly combating waterborne diseases in rural mission partner communities.',
    };
  } else if (fundId === 'fund-building') {
    const sqft = (amount / 100).toFixed(1);
    return {
      category: 'Sanctuary & Community Expansion',
      headline: `${sqft} Sq Ft of Youth Pavilion Construction`,
      icon: Building2,
      description: `Your $${amount.toFixed(0)} gift funded ${sqft} square feet of timber framing and classroom acoustics in our new youth community wing.`,
      secondary: 'Building safe, welcoming fellowship spaces for the next generation.',
    };
  } else {
    const mentoringHours = Math.floor(amount / 25);
    return {
      category: 'Pastoral Care & Youth Mentorship',
      headline: `${mentoringHours} Hours of Pastoral Counseling`,
      icon: GraduationCap,
      description: `Your $${amount.toFixed(0)} donation provided ${mentoringHours} hours of pastoral grief counseling, youth discipleship, and Sunday livestreaming.`,
      secondary: 'Sustaining biblical worship, community outreach, and chaplaincy across our city.',
    };
  }
};

export const DonorPortal: React.FC<{
  onViewMyGiving?: (email: string) => void;
}> = ({ onViewMyGiving }) => {
  const { funds, makeDonation, addNotification } = useChurch();

  const [frequency, setFrequency] = useState<DonationFrequency>('monthly');
  const [selectedFundId, setSelectedFundId] = useState<string>(funds[0]?.id || 'fund-tithes');
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
        setLastGiftEmail(donorEmail.trim().toLowerCase());
      }
    } catch {
      setErrorMessage('An unexpected payment error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
      setShow3DSModal(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {lastGiftEmail && onViewMyGiving && (
        <div
          className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-5 py-4 shadow-sm"
          style={{
            backgroundColor: 'rgba(74,4,4,0.06)',
            borderColor: 'rgba(212,175,55,0.45)',
          }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: '#4A0404' }}>
              Gift received — thank you
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              View your private receipts and tax statements for {lastGiftEmail}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onViewMyGiving(lastGiftEmail)}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
            style={{ backgroundColor: '#4A0404' }}
          >
            View My Giving
          </button>
        </div>
      )}

      {/* Vault-style burgundy hero */}
      <div
        className="relative mb-10 overflow-hidden rounded-2xl text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #2A0202 0%, #4A0404 45%, #7A1414 100%)' }}
      >
        <div className="absolute inset-0 z-0">
          <img
            src="/assets/images/church_sanctuary_hero_1790791320226.jpg"
            alt="Church sanctuary"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-center opacity-25"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(42,2,2,0.92) 0%, rgba(74,4,4,0.75) 55%, rgba(74,4,4,0.35) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 max-w-3xl px-6 py-12 sm:px-10 sm:py-16">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ backgroundColor: 'rgba(212,175,55,0.2)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.45)' }}
            >
              Welcome Home
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] text-white/90"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Faithful Stewardship
            </span>
          </div>
          <h1 className="font-serif-display mt-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
            Giving Worship to God, Blessing Our City
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: '#D4AF37' }}>
            Where Everybody Is Somebody
          </p>
          <blockquote className="mt-4 border-l-2 pl-4 text-sm sm:text-base italic text-white/85 font-serif" style={{ borderColor: '#D4AF37' }}>
            "Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver."
            <footer className="mt-1 text-xs not-italic font-sans font-medium" style={{ color: '#F4CF67' }}>
              — 2 Corinthians 9:7
            </footer>
          </blockquote>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-white/80">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" style={{ color: '#D4AF37' }} />
              Official 501(c)(3) Tax Deductible
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4" style={{ color: '#D4AF37' }} />
              Stripe 256-Bit Encrypted
            </span>
            <span aria-hidden="true">·</span>
            <span>Instant Automated Tax Receipt</span>
          </div>
        </div>
      </div>

      {/* Main Contribution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Giving Form (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Step 1: Frequency Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Giving Schedule
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['one-time', 'weekly', 'bi-weekly', 'monthly', 'annually'] as DonationFrequency[]).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequency(freq)}
                    className={`py-2 px-2 text-xs font-medium rounded-md transition-all capitalize whitespace-nowrap text-center ${
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

            {/* Step 2: Amount Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Contribution Amount
                </label>
                <span className="text-xs text-slate-500 font-mono">USD ($)</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setPresetAmount(amt);
                      setCustomAmountStr('');
                    }}
                    className={`py-3 text-sm font-semibold rounded-lg border transition-all ${
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
                  onClick={() => setPresetAmount('custom')}
                  className={`py-3 text-sm font-semibold rounded-lg border transition-all ${
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
                    className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:border-church-gold focus:ring-1 focus:ring-church-gold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>
              )}

              {/* Dynamic Impact Metrics Display */}
              {tangibleImpact && (
                <div className="mt-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800/60 flex items-start gap-3 transition-all">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 shadow-sm mt-0.5">
                    <tangibleImpact.icon className="h-4 w-4" />
                  </div>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-400">
                        Tangible Ministry Impact
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                        {tangibleImpact.headline}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1 leading-snug">
                      "{tangibleImpact.description}"
                    </p>
                    {tangibleImpact.secondary && (
                      <p className="text-emerald-700 dark:text-emerald-400 text-[11px] mt-1 italic font-serif">
                        {tangibleImpact.secondary}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Fund Designation */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Designated Ministry Fund
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {funds.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFundId(f.id)}
                    className={`p-3 text-left rounded-lg border transition-all flex flex-col justify-between ${
                      selectedFundId === f.id
                        ? 'border-church-gold bg-church-gold/10 dark:border-church-gold dark:bg-church-burgundy/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{f.name}</span>
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">{f.code}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-1 leading-snug">
                        {f.description}
                      </p>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-300 mb-1">
                        <span>
                          Funded:{' '}
                          {f.currentAmount >= 1000
                            ? `$${(f.currentAmount / 1000).toFixed(0)}k`
                            : `$${f.currentAmount.toLocaleString()}`}
                        </span>
                        <span>
                          Goal:{' '}
                          {f.goalAmount >= 1000
                            ? `$${(f.goalAmount / 1000).toFixed(0)}k`
                            : `$${f.goalAmount.toLocaleString()}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-church-burgundy-light dark:bg-church-gold rounded-full"
                          style={{
                            width: `${f.goalAmount > 0 ? Math.min(100, (f.currentAmount / f.goalAmount) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 4: Donor Details */}
            <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Donor Information (for 501c3 Tax Statement)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    required
                    placeholder="Your full legal name"
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Email (for Instant Receipt)</label>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Mailing Address (for IRS Statement)</label>
                  <input
                    type="text"
                    value={donorAddress}
                    onChange={(e) => setDonorAddress(e.target.value)}
                    placeholder="Street, City, State, ZIP"
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Dedication / Memorial Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. In loving memory of grandma Ruth, or in honor of youth camp"
                    value={dedication}
                    onChange={(e) => setDedication(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white"
                  />
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

            {/* Step 5: Payment Processing */}
            <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Payment Method
                </span>
              </div>

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
                  donorName={isAnonymous ? 'Anonymous Donor' : donorName}
                  donorEmail={donorEmail}
                  fundId={selectedFund.id}
                  fundCode={selectedFund.code}
                  fundName={selectedFund.name}
                  frequency={frequency}
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
                  donorName={isAnonymous ? 'Anonymous Donor' : donorName}
                  donorEmail={donorEmail}
                  fundCode={selectedFund.code}
                  fundName={selectedFund.name}
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
            <div className="bg-church-gold/10 dark:bg-church-burgundy/20 p-4 rounded-lg border border-church-gold/30 dark:border-church-gold/30">
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
              className="w-full py-3.5 px-4 text-white font-semibold text-sm rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#4A0404' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#7A1414';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A0404';
              }}
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

        {/* Right Column: Stewardship Overview & Gift Summary (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Active Fund Spotlight Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="h-40 relative">
              <img
                src={selectedFund.image || '/assets/images/church_sanctuary_hero_1790791320226.jpg'}
                alt={selectedFund.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-church-gold-light">
                  {selectedFund.category} Ministry
                </span>
                <h3 className="font-serif-display text-lg font-bold text-white leading-snug">
                  {selectedFund.name}
                </h3>
              </div>
            </div>

            <div className="p-5">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedFund.description}
              </p>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Campaign Progress</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    ${selectedFund.currentAmount.toLocaleString()} / ${selectedFund.goalAmount.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-church-burgundy-light dark:bg-church-gold rounded-full transition-all duration-500"
                    style={{
                      width: `${selectedFund.goalAmount > 0 ? Math.min(100, (selectedFund.currentAmount / selectedFund.goalAmount) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 text-right">
                  {selectedFund.goalAmount > 0
                    ? `${((selectedFund.currentAmount / selectedFund.goalAmount) * 100).toFixed(1)}% of annual objective funded`
                    : 'Campaign goal ready for your first gift'}
                </p>
              </div>
            </div>
          </div>

          {/* Real-time Order Summary / Tax Calculation */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h4 className="font-serif-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Contribution Summary
            </h4>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Direct Ministry Principal</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  ${principalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Stripe Processing Cost</span>
                <span className="font-mono tabular-nums">
                  {coverFees ? `+$${feeAmount.toFixed(2)} (Covered)` : '$0.00 (Deducted from gift)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Frequency Cadence</span>
                <span className="capitalize font-medium text-church-burgundy dark:text-church-gold">
                  {frequency}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white">
                <span>Total Payment Today</span>
                <span className="font-mono tabular-nums text-sm text-church-burgundy dark:text-church-gold-light">
                  ${totalCharged.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>100% Tax Deductible under IRC § 170</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Official PDF statement delivered by email</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Encrypted tokenization (no raw cards stored)</span>
              </div>
            </div>
          </div>

          {/* How gifts translate into ministry */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <HeartHandshake className="h-4 w-4 text-church-gold-dark dark:text-church-gold" />
              <h4 className="font-serif-display text-sm font-semibold text-slate-900 dark:text-white">
                How Your Gift Translates
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
              Every contribution fuels tangible ministry across Anointed Worship Center:
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 mb-1">
                  <Utensils className="h-3.5 w-3.5" />
                  <span className="font-mono font-bold text-sm">$5</span>
                </div>
                <span className="text-[11px] font-medium text-slate-900 dark:text-white block">Warm Meal</span>
                <span className="text-[10px] text-slate-500">Food pantry &amp; benevolence</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 mb-1">
                  <Droplets className="h-3.5 w-3.5" />
                  <span className="font-mono font-bold text-sm">$50</span>
                </div>
                <span className="text-[11px] font-medium text-slate-900 dark:text-white block">Clean Water Filter</span>
                <span className="text-[10px] text-slate-500">Missions partnerships</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-church-gold-dark dark:text-church-gold mb-1">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="font-mono font-bold text-sm">$100</span>
                </div>
                <span className="text-[11px] font-medium text-slate-900 dark:text-white block">1 Sq Ft Youth Wing</span>
                <span className="text-[10px] text-slate-500">Building campaign</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 mb-1">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span className="font-mono font-bold text-sm">$25</span>
                </div>
                <span className="text-[11px] font-medium text-slate-900 dark:text-white block">Pastoral Care Hour</span>
                <span className="text-[10px] text-slate-500">Counseling &amp; discipleship</span>
              </div>
            </div>
          </div>

          {/* Frequently Asked Questions */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h4 className="font-serif-display text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4 text-slate-400" />
              <span>Stewardship FAQ</span>
            </h4>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">How do recurring contributions work?</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Your pledge processes automatically on your selected schedule. You can pause or adjust amount anytime via your self-service portal.
                </p>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">When do I receive my annual tax statement?</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Per-transaction receipts are delivered instantly. Comprehensive annual statements for IRS filing are available on-demand in the portal.
                </p>
              </div>
            </div>
          </div>

        </div>

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

    </div>
  );
};
