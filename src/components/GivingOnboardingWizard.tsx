import React, { useEffect, useMemo, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { DonationFrequency, PaymentMethod } from '../types';
import { fetchApiConfig, submitVaultInterest, type ApiConfig } from '../lib/api';
import { StripeCheckout } from './StripeCheckout';
import { PlaidBankLink } from './PlaidBankLink';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  CreditCard,
  Heart,
  Landmark,
  Lock,
  Sparkles,
  Users,
} from 'lucide-react';

type Audience = 'returning' | 'new';
type WizardStep =
  | 'welcome'
  | 'audience'
  | 'vault'
  | 'frequency'
  | 'identity'
  | 'payMethod'
  | 'amount'
  | 'review'
  | 'pay'
  | 'success';

const FREQUENCIES: { id: DonationFrequency; label: string; hint: string }[] = [
  { id: 'one-time', label: 'One-time', hint: 'A single gift today' },
  { id: 'weekly', label: 'Weekly', hint: 'Every week' },
  { id: 'bi-weekly', label: 'Bi-weekly', hint: 'Every two weeks' },
  { id: 'monthly', label: 'Monthly', hint: 'Once each month' },
  { id: 'annually', label: 'Annually', hint: 'Once each year' },
];

const PRESETS = [25, 50, 100, 250, 500] as const;

interface GivingOnboardingWizardProps {
  onExitToClassic: () => void;
  onViewMyGiving?: (email: string) => void;
}

export const GivingOnboardingWizard: React.FC<GivingOnboardingWizardProps> = ({
  onExitToClassic,
  onViewMyGiving,
}) => {
  const { funds, makeDonation, addNotification } = useChurch();
  const [step, setStep] = useState<WizardStep>('welcome');
  const [audience, setAudience] = useState<Audience | null>(null);
  const [vaultOptIn, setVaultOptIn] = useState<boolean | null>(null);
  const [vaultSubmitted, setVaultSubmitted] = useState(false);
  const [vaultSetupUrl, setVaultSetupUrl] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<DonationFrequency>('monthly');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorAddress, setDonorAddress] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'plaid'>('card');
  const [selectedFundId, setSelectedFundId] = useState(funds[0]?.id || 'fund-tithes');
  const [presetAmount, setPresetAmount] = useState<number | 'custom'>(100);
  const [customAmountStr, setCustomAmountStr] = useState('');
  const [coverFees, setCoverFees] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  // Simulator card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [plaidInstitution, setPlaidInstitution] = useState('');
  const [plaidAccountMask, setPlaidAccountMask] = useState('');

  useEffect(() => {
    fetchApiConfig().then(setApiConfig);
  }, []);

  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0];
  const principalAmount =
    presetAmount === 'custom' ? parseFloat(customAmountStr) || 0 : Number(presetAmount);
  const feeAmount =
    coverFees && principalAmount > 0
      ? paymentMethod === 'plaid'
        ? Number(Math.min(5.0, principalAmount * 0.008).toFixed(2))
        : Number((principalAmount * 0.029 + 0.3).toFixed(2))
      : 0;
  const totalCharged = Number((principalAmount + feeAmount).toFixed(2));

  const stripeLive = Boolean(apiConfig?.integrations.stripe.configured && apiConfig.stripePublishableKey);
  const plaidLive = Boolean(apiConfig?.integrations.plaid.configured);

  const steps = useMemo((): WizardStep[] => {
    const base: WizardStep[] = ['welcome', 'audience'];
    if (audience === 'new') base.push('vault');
    base.push('frequency', 'identity', 'payMethod', 'amount', 'review', 'pay', 'success');
    return base;
  }, [audience]);

  const stepIndex = Math.max(0, steps.indexOf(step));
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const goNext = () => {
    setErrorMessage(null);
    const idx = steps.indexOf(step);
    if (idx >= 0 && idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const goBack = () => {
    setErrorMessage(null);
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const validateBeforeContinue = (): boolean => {
    if (step === 'audience' && !audience) {
      setErrorMessage('Please tell us if you are returning or new.');
      return false;
    }
    if (step === 'vault' && vaultOptIn === null) {
      setErrorMessage('Please choose whether you would like to join AWC Vault.');
      return false;
    }
    if (step === 'identity') {
      if (!donorEmail.includes('@')) {
        setErrorMessage('A valid email is required for your tax receipt.');
        return false;
      }
      if (!isAnonymous && !donorName.trim()) {
        setErrorMessage('Please enter your name, or choose to give anonymously.');
        return false;
      }
      if (vaultOptIn && !donorPhone.trim()) {
        setErrorMessage('A phone number helps our team follow up about AWC Vault.');
        return false;
      }
    }
    if (step === 'amount' && principalAmount <= 0) {
      setErrorMessage('Enter a gift amount greater than $0.');
      return false;
    }
    if (step === 'review' && !acknowledged) {
      setErrorMessage('Please acknowledge that you are authorizing this gift.');
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (!validateBeforeContinue()) return;

    if (step === 'identity' && vaultOptIn && !vaultSubmitted) {
      try {
        const result = await submitVaultInterest({
          name: donorName.trim() || 'Guest',
          email: donorEmail.trim(),
          phone: donorPhone.trim(),
          address: donorAddress.trim(),
          source: 'awc_tithe_guided',
          notes: 'Opted in during Tithe guided giving onboarding',
        });
        setVaultSubmitted(true);
        setVaultSetupUrl(result.setupUrl);
        addNotification('success', 'Vault interest saved', result.message);
      } catch (err) {
        // Do not block giving
        addNotification(
          'warning',
          'Vault follow-up',
          err instanceof Error ? err.message : 'We could not reach Vault yet — you can still give.'
        );
      }
    }

    goNext();
  };

  const completeGift = async (overrides?: {
    paymentMethod?: PaymentMethod;
    stripePaymentIntentId?: string;
    plaidTransferId?: string;
    plaidInstitution?: string;
    plaidAccountMask?: string;
    awcDcbVoucher?: string;
    awcSynced?: boolean;
    cardBrand?: string;
    cardLast4?: string;
  }) => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const donation = await makeDonation({
        amount: principalAmount,
        feeCovered: coverFees,
        frequency,
        fundId: selectedFund.id,
        donorName: isAnonymous ? 'Anonymous' : donorName,
        donorEmail,
        donorAddress,
        paymentMethod: overrides?.paymentMethod || paymentMethod,
        isAnonymous,
        stripePaymentIntentId: overrides?.stripePaymentIntentId,
        plaidTransferId: overrides?.plaidTransferId,
        plaidInstitution: overrides?.plaidInstitution || plaidInstitution,
        plaidAccountMask: overrides?.plaidAccountMask || plaidAccountMask,
        awcDcbVoucher: overrides?.awcDcbVoucher,
        awcSynced: overrides?.awcSynced,
        cardBrand: overrides?.cardBrand,
        cardLast4: overrides?.cardLast4 || cardNumber.slice(-4),
      });
      setReceiptNumber(donation.receiptNumber);
      setStep('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gift could not be completed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulatorPay = async () => {
    if (paymentMethod === 'card' && cardNumber.replace(/\D/g, '').length < 4) {
      setErrorMessage('Enter a card number to continue in simulator mode.');
      return;
    }
    if (paymentMethod === 'plaid' && !plaidInstitution.trim()) {
      setErrorMessage('Enter your bank name to continue in simulator mode.');
      return;
    }
    await completeGift({
      paymentMethod,
      cardBrand: paymentMethod === 'plaid' ? plaidInstitution || 'Plaid Bank' : 'Visa',
      cardLast4: paymentMethod === 'plaid' ? plaidAccountMask.slice(-4) || '0000' : cardNumber.slice(-4),
      plaidInstitution: paymentMethod === 'plaid' ? plaidInstitution : undefined,
      plaidAccountMask: paymentMethod === 'plaid' ? plaidAccountMask : undefined,
    });
  };

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExitToClassic}
          className="text-xs font-medium text-slate-500 hover:text-[#4A0404] dark:hover:text-[#D4AF37]"
        >
          Use classic form
        </button>
        <span className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#D4AF37' }}>
          Guided Giving
        </span>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: '#4A0404' }}
        />
      </div>

      <div
        className="overflow-hidden rounded-2xl border shadow-lg"
        style={{ borderColor: 'rgba(212,175,55,0.35)', background: 'linear-gradient(180deg, #fff 0%, #faf7f2 100%)' }}
      >
        <div
          className="px-6 py-5 text-white"
          style={{ background: 'linear-gradient(135deg, #2A0202 0%, #4A0404 55%, #7A1414 100%)' }}
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: '#D4AF37' }}>
            <Heart className="h-3.5 w-3.5" />
            Anointed Worship Center
          </div>
          <h1 className="mt-2 font-serif-display text-2xl font-bold">AWC Tithe</h1>
        </div>

        <div className="p-6 sm:p-8 dark:bg-slate-900">
          {children}

          {errorMessage && (
            <p className="mt-4 text-xs text-red-600 dark:text-red-400" role="alert">
              {errorMessage}
            </p>
          )}

          {step !== 'welcome' && step !== 'pay' && step !== 'success' && (
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleContinue()}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: '#4A0404' }}
              >
                Continue
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (step === 'welcome') {
    return shell(
      <div className="space-y-6 text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(74,4,4,0.08)' }}
        >
          <BookOpen className="h-6 w-6" style={{ color: '#D4AF37' }} />
        </div>
        <div>
          <h2 className="font-serif-display text-xl font-bold text-slate-900 dark:text-white">
            Welcome — we are glad you are here
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            “Each of you should give what you have decided in your heart to give, not reluctantly or under
            compulsion, for God loves a cheerful giver.”
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: '#4A0404' }}>
            2 Corinthians 9:7
          </p>
        </div>
        <p className="text-xs text-slate-500">
          This short walkthrough will guide your gift securely. Card and bank details go only to Stripe or
          Plaid — never stored on AWC Tithe.
        </p>
        <button
          type="button"
          onClick={goNext}
          className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider text-white shadow-sm"
          style={{ backgroundColor: '#4A0404' }}
        >
          Begin
        </button>
      </div>
    );
  }

  if (step === 'audience') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Are you returning, or new to AWC?
        </h2>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setAudience('returning')}
            className={`rounded-xl border p-4 text-left transition-all ${
              audience === 'returning' ? 'border-[#D4AF37] bg-[#4A0404]/5' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Users className="h-4 w-4" style={{ color: '#D4AF37' }} />
              Returning member / regular giver
            </div>
            <p className="mt-1 text-xs text-slate-500">You already worship with Anointed Worship Center.</p>
          </button>
          <button
            type="button"
            onClick={() => setAudience('new')}
            className={`rounded-xl border p-4 text-left transition-all ${
              audience === 'new' ? 'border-[#D4AF37] bg-[#4A0404]/5' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4" style={{ color: '#D4AF37' }} />
              New to this church or site
            </div>
            <p className="mt-1 text-xs text-slate-500">First-time visitor or discovering AWC online.</p>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'vault') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Would you like to join AWC Vault?
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          AWC Vault is our church CMS — the home for people, events, family tools, and staying connected with
          Anointed Worship Center. Joining helps our pastors and team welcome you beyond this gift.
        </p>
        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Stay updated on services, prayer nights, and events
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Connect with church family tools in one place
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Your giving receipts still live in AWC Tithe (private donor portal)
          </li>
        </ul>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setVaultOptIn(true)}
            className={`rounded-xl border py-3 text-sm font-semibold ${
              vaultOptIn === true ? 'border-[#D4AF37] text-[#4A0404]' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            Yes, add me
          </button>
          <button
            type="button"
            onClick={() => setVaultOptIn(false)}
            className={`rounded-xl border py-3 text-sm font-semibold ${
              vaultOptIn === false ? 'border-[#D4AF37] text-[#4A0404]' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            Just give today
          </button>
        </div>
      </div>
    );
  }

  if (step === 'frequency') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          How often would you like to give?
        </h2>
        <div className="grid gap-2">
          {FREQUENCIES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFrequency(f.id)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${
                frequency === f.id ? 'border-[#D4AF37] bg-[#4A0404]/5' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{f.label}</span>
              <span className="text-xs text-slate-500">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'identity') {
    return shell(
      <div className="space-y-4">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Your contact for receipts
        </h2>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Full name
          </label>
          <input
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Your full legal name"
            disabled={isAnonymous}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Email
          </label>
          <input
            type="email"
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="you@example.com"
            required
          />
        </div>
        {vaultOptIn && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Phone (for Vault follow-up)
            </label>
            <input
              type="tel"
              value={donorPhone}
              onChange={(e) => setDonorPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="(555) 555-5555"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Mailing address (optional)
          </label>
          <input
            value={donorAddress}
            onChange={(e) => setDonorAddress(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Street, City, State, ZIP"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded border-slate-300"
          />
          Keep my name anonymous in congregation listings (receipt still emailed to you)
        </label>
      </div>
    );
  }

  if (step === 'payMethod') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          How will you give?
        </h2>
        <p className="text-xs text-slate-500">Card (Stripe) and Bank (Plaid) are equal options — choose what is easiest.</p>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setPaymentMethod('card')}
            className={`rounded-xl border p-4 text-left ${
              paymentMethod === 'card' ? 'border-[#D4AF37] bg-[#4A0404]/5' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <CreditCard className="h-4 w-4" style={{ color: '#D4AF37' }} />
              Credit / debit card
            </div>
            <p className="mt-1 text-xs text-slate-500">Secured by Stripe. Settles to the church DCU account.</p>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('plaid')}
            className={`rounded-xl border p-4 text-left ${
              paymentMethod === 'plaid' ? 'border-[#D4AF37] bg-[#4A0404]/5' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Landmark className="h-4 w-4" style={{ color: '#D4AF37' }} />
              Checking / savings (Plaid)
            </div>
            <p className="mt-1 text-xs text-slate-500">Link your bank securely. ACH to DCU via Plaid.</p>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'amount') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Gift amount &amp; ministry fund
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setPresetAmount(n);
                setCustomAmountStr('');
              }}
              className={`rounded-lg border py-2.5 text-sm font-semibold ${
                presetAmount === n ? 'border-[#D4AF37] text-[#4A0404]' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              ${n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPresetAmount('custom')}
            className={`rounded-lg border py-2.5 text-sm font-semibold ${
              presetAmount === 'custom' ? 'border-[#D4AF37] text-[#4A0404]' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            Custom
          </button>
        </div>
        {presetAmount === 'custom' && (
          <input
            type="number"
            min={1}
            step="0.01"
            value={customAmountStr}
            onChange={(e) => setCustomAmountStr(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Amount in USD"
          />
        )}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Designate to
          </label>
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={coverFees}
            onChange={(e) => setCoverFees(e.target.checked)}
            className="rounded border-slate-300"
          />
          Cover processing fees (+${feeAmount.toFixed(2)}) so 100% of ${principalAmount.toFixed(2)} reaches ministry
        </label>
      </div>
    );
  }

  if (step === 'review') {
    return shell(
      <div className="space-y-5">
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Review &amp; acknowledge
        </h2>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50 space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Frequency</span>
            <span className="font-medium capitalize">{frequency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Fund</span>
            <span className="font-medium text-right max-w-[60%]">{selectedFund?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Method</span>
            <span className="font-medium">{paymentMethod === 'card' ? 'Card (Stripe)' : 'Bank (Plaid)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Gift</span>
            <span className="font-mono font-semibold">${principalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Fees covered</span>
            <span className="font-mono">${feeAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <span className="font-semibold">Total today</span>
            <span className="font-mono font-bold" style={{ color: '#4A0404' }}>
              ${totalCharged.toFixed(2)}
            </span>
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            I authorize Anointed Worship Center to charge{' '}
            <strong>${totalCharged.toFixed(2)}</strong>
            {frequency !== 'one-time' ? ` on a ${frequency} schedule` : ' today'} toward{' '}
            {selectedFund?.name}. I understand this gift is a voluntary contribution.
          </span>
        </label>
      </div>
    );
  }

  if (step === 'pay') {
    return shell(
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-mono font-semibold" style={{ color: '#4A0404' }}>
            ${totalCharged.toFixed(2)}
          </span>
        </div>
        <h2 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">
          Complete your gift
        </h2>

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
            onError={(msg) => setErrorMessage(msg)}
            onSuccess={async (result) => {
              await completeGift({
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
          <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs text-slate-500">Simulator mode — Stripe keys not configured yet.</p>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="Card number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
                placeholder="MM/YY"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <input
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value)}
                placeholder="CVC"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleSimulatorPay()}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: '#4A0404' }}
            >
              <Lock className="h-4 w-4" />
              {isProcessing ? 'Processing…' : `Give $${totalCharged.toFixed(2)}`}
            </button>
          </div>
        )}

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
            onError={(msg) => setErrorMessage(msg)}
            onSuccess={async (result) => {
              setPlaidInstitution(result.institutionName);
              setPlaidAccountMask(result.accountMask);
              await completeGift({
                paymentMethod: 'plaid',
                plaidTransferId: result.transferId,
                plaidInstitution: result.institutionName,
                plaidAccountMask: result.accountMask,
                awcDcbVoucher: result.voucherNumber,
                awcSynced: result.awcSynced,
                cardBrand: result.institutionName,
                cardLast4: result.accountMask,
              });
            }}
          />
        )}

        {paymentMethod === 'plaid' && !plaidLive && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs text-slate-500">Simulator mode — Plaid keys not configured yet.</p>
            <input
              value={plaidInstitution}
              onChange={(e) => setPlaidInstitution(e.target.value)}
              placeholder="Bank name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              value={plaidAccountMask}
              onChange={(e) => setPlaidAccountMask(e.target.value)}
              placeholder="Account ending in"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleSimulatorPay()}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: '#4A0404' }}
            >
              <Lock className="h-4 w-4" />
              {isProcessing ? 'Processing…' : `Give $${totalCharged.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  // success
  return shell(
    <div className="space-y-5 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}
      >
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <h2 className="font-serif-display text-xl font-bold text-slate-900 dark:text-white">
        Thank you for your faithfulness
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Your {frequency === 'one-time' ? 'gift' : `${frequency} gift`} of ${principalAmount.toFixed(2)} toward{' '}
        {selectedFund?.name} has been recorded
        {receiptNumber ? (
          <>
            {' '}
            (receipt <span className="font-mono font-semibold">{receiptNumber}</span>)
          </>
        ) : null}
        .
      </p>
      {vaultOptIn && (
        <p className="text-xs text-slate-500">
          Our team will follow up about AWC Vault
          {vaultSetupUrl ? (
            <>
              {' '}
              ·{' '}
              <a href={vaultSetupUrl} className="underline" style={{ color: '#4A0404' }} target="_blank" rel="noreferrer">
                Learn more
              </a>
            </>
          ) : null}
          .
        </p>
      )}
      <div className="flex flex-col gap-2">
        {onViewMyGiving && donorEmail && (
          <button
            type="button"
            onClick={() => onViewMyGiving(donorEmail)}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ backgroundColor: '#4A0404' }}
          >
            View my giving
          </button>
        )}
        <button
          type="button"
          onClick={onExitToClassic}
          className="w-full rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Back to Give page
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
        <Building2 className="h-3 w-3" />
        Recorded on AWC Tithe · synced for AWC DCB finance review
      </div>
    </div>
  );
};
