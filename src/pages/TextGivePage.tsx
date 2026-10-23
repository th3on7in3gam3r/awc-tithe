import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CheckCircle2, Lock, MessageSquare } from 'lucide-react';
import { stripeAppearance } from '../components/StripeCheckout';

/**
 * One-time setup for text-an-amount giving, opened from the link we text back.
 * The member enters name, email and card once; after that, texting an amount
 * (like 50) to (855) 297-1920 gives with the saved card.
 */

type LinkInfo = {
  mode: 'give' | 'card';
  amountCents: number;
  phoneHint: string;
  fundName: string;
  feeCents: number;
  publishableKey: string | null;
  instantMaxCents: number;
};

const GIVING_NUMBER = '(855) 297-1920';

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
  return data as T;
}

const shell = 'min-h-screen bg-[#F7F4EF] dark:bg-slate-950 px-4 py-8';
const card = 'mx-auto max-w-md rounded-3xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6 sm:p-8 shadow-sm';
const input =
  'w-full rounded-xl border border-[#E8E2D9] bg-white px-4 py-3.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4A0404]/30';
const bigButton =
  'w-full rounded-2xl py-4 text-lg font-bold text-white shadow-sm disabled:opacity-50 flex items-center justify-center gap-2';

function CardStep({
  token,
  info,
  kind,
  onDone,
}: {
  token: string;
  info: LinkInfo;
  kind: 'payment' | 'setup';
  onDone: (intentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const returnUrl = `${window.location.origin}/text-give?t=${encodeURIComponent(token)}`;
    const result =
      kind === 'payment'
        ? await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' })
        : await stripe.confirmSetup({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
    if (result.error) {
      setError(result.error.message || 'Your card could not be confirmed.');
      setBusy(false);
      return;
    }
    const intentId =
      'paymentIntent' in result && result.paymentIntent
        ? result.paymentIntent.id
        : 'setupIntent' in result && result.setupIntent
          ? result.setupIntent.id
          : '';
    onDone(intentId);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy || !stripe} className={bigButton} style={{ backgroundColor: '#4A0404' }}>
        <Lock className="h-5 w-5" />
        {busy ? 'Please wait…' : kind === 'payment' ? `Give ${money(info.amountCents)} & save card` : 'Save card'}
      </button>
    </form>
  );
}

export default function TextGivePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get('t') || '';
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [coverFees, setCoverFees] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ kind: 'payment' | 'setup'; clientSecret: string } | null>(null);
  const [done, setDone] = useState<{ card: string; phoneHint: string } | null>(null);

  const stripePromise = useMemo(() => (info?.publishableKey ? loadStripe(info.publishableKey) : null), [info?.publishableKey]);

  const complete = async (intentId: string) => {
    try {
      const res = await post<{ card: string; phoneHint: string }>('/api/text-give/complete', { t: token, intentId });
      setDone(res);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'We could not save your card.');
    }
  };

  useEffect(() => {
    // Back from a bank's card check (3-D Secure): finish without asking again.
    const returned = params.get('payment_intent') || params.get('setup_intent');
    (async () => {
      const res = await fetch(`/api/text-give/link?t=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.message || 'This link has expired. Text an amount (like 50) to get a new one.');
        return;
      }
      setInfo(data as LinkInfo);
      if (returned) await complete(returned);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setFormError(null);
    try {
      const res = await post<{ kind: 'payment' | 'setup'; clientSecret: string }>('/api/text-give/start', {
        t: token,
        name,
        email,
        coverFees,
      });
      setIntent(res);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setStarting(false);
    }
  };

  if (done) {
    return (
      <div className={shell}>
        <div className={`${card} text-center space-y-4`}>
          <CheckCircle2 className="mx-auto h-14 w-14" style={{ color: '#2F6B3A' }} />
          <h1 className="font-serif-display text-2xl font-semibold text-slate-900 dark:text-white">
            {info?.mode === 'give' ? 'Thank you for your gift!' : 'Your card is saved'}
          </h1>
          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            Text giving is ready for {done.phoneHint} using {done.card}.
          </p>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-[#E8E2D9] dark:border-slate-700 p-5 text-left space-y-2">
            <p className="text-lg font-bold text-[#4A0404] dark:text-[#E9C979]">Next time, just text an amount</p>
            <p className="text-base text-slate-700 dark:text-slate-300">
              Text <span className="font-bold">50</span> to <span className="font-bold whitespace-nowrap">{GIVING_NUMBER}</span> to give $50.
              We'll text you a thank-you, and email your receipt.
            </p>
            <p className="text-sm text-slate-500">Text CHANGE to use a different card, or UNLINK to stop text giving.</p>
          </div>
          <p className="text-sm text-slate-500">You can close this page.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={shell}>
        <div className={`${card} text-center space-y-4`}>
          <MessageSquare className="mx-auto h-12 w-12 text-[#4A0404]" />
          <h1 className="font-serif-display text-2xl font-semibold text-slate-900 dark:text-white">Link expired</h1>
          <p className="text-base text-slate-700 dark:text-slate-300">{loadError}</p>
          <Link to="/" className="inline-block text-sm font-semibold text-[#4A0404] underline">Go to the giving page</Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className={shell}>
        <p className="text-center text-sm text-slate-500" role="status">Loading…</p>
      </div>
    );
  }

  const giving = info.mode === 'give';

  return (
    <div className={shell}>
      <div className={`${card} space-y-6`}>
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Anointed Worship Center</p>
          <h1 className="font-serif-display text-3xl font-semibold text-slate-900 dark:text-white">
            {giving ? `Give ${money(info.amountCents)}` : 'Save a card for text giving'}
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            {giving
              ? `to ${info.fundName}. Your card is saved so next time you can just text an amount from ${info.phoneHint}.`
              : `This card will be used when you text an amount from ${info.phoneHint}.`}
          </p>
        </div>

        {!intent ? (
          <form onSubmit={start} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your name</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email (for receipts)</span>
              <input
                className={input}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-[#E8E2D9] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-[#4A0404]"
                checked={coverFees}
                onChange={(e) => setCoverFees(e.target.checked)}
              />
              <span className="text-base text-slate-700 dark:text-slate-300">
                Add the card fee so the church receives my full gift
                {giving ? ` (+${money(info.feeCents)} today)` : ''}. I'll keep this choice for text gifts.
              </span>
            </label>
            {formError ? <p className="text-sm text-red-700" role="alert">{formError}</p> : null}
            <button type="submit" disabled={starting} className={bigButton} style={{ backgroundColor: '#4A0404' }}>
              {starting ? 'Please wait…' : 'Continue to card'}
            </button>
          </form>
        ) : stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret, appearance: stripeAppearance() }}>
            <CardStep token={token} info={info} kind={intent.kind} onDone={(id) => void complete(id)} />
            {formError ? <p className="mt-3 text-sm text-red-700" role="alert">{formError}</p> : null}
          </Elements>
        ) : (
          <p className="text-sm text-red-700">Card giving is not available right now.</p>
        )}

        <p className="text-xs text-slate-500 leading-relaxed">
          By saving your card, you allow Anointed Worship Center to charge it when you text an amount from{' '}
          {info.phoneHint} to {GIVING_NUMBER}. Gifts over {money(info.instantMaxCents)} ask you to reply OK first. Text UNLINK anytime to stop.
          Cards are stored securely by Stripe, never by the church.{' '}
          <Link to="/privacy" className="underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
