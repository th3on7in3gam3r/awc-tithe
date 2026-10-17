import React, { useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, ExternalLink } from 'lucide-react';
import { markManualGiftSent, type DonorManualGift, type PaymentOptions } from '../lib/api';

interface ManualGiftHandoffProps {
  gift: DonorManualGift;
  claimToken: string;
  paymentOptions: PaymentOptions;
  donorEmail: string;
  onBack: () => void;
  onViewMyGiving?: () => void;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function CopyRow({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch {
        // nothing else to try
      }
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-3 rounded-xl bg-awc-sand px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="sr-only">{label}: </span>
        <span
          className={`block break-all text-awc-ink ${mono ? 'font-mono text-xl font-semibold tracking-[0.12em]' : 'text-[15px] font-semibold'}`}
        >
          {value}
        </span>
        {hint ? <span className="block text-xs text-awc-muted">{hint}</span> : null}
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-awc-primary px-4 text-[13px] font-semibold text-awc-primary transition-colors hover:bg-awc-primary hover:text-awc-on-primary"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-awc-line bg-awc-paper p-4 sm:p-5">
      <span className="w-5 shrink-0 font-serif-display text-2xl font-semibold leading-none text-awc-accent" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="text-[15px] font-semibold text-awc-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

export const ManualGiftHandoff: React.FC<ManualGiftHandoffProps> = ({
  gift,
  claimToken,
  paymentOptions,
  donorEmail,
  onBack,
  onViewMyGiving,
}) => {
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(gift.status === 'submitted');
  const [error, setError] = useState<string | null>(null);

  const isZelle = gift.provider === 'zelle';
  const isCashApp = gift.provider === 'cash_app';
  const providerName = isZelle ? 'Zelle' : isCashApp ? 'Cash App' : 'Venmo';
  const cashApp = paymentOptions.cashApp;
  const cashAppLink = cashApp?.cashtag
    ? `https://cash.app/${encodeURIComponent(cashApp.cashtag)}/${gift.amount.toFixed(2)}`
    : null;
  const venmoHandle = paymentOptions.venmo.handle;
  const venmoLink = `https://venmo.com/${encodeURIComponent(venmoHandle)}?txn=pay&amount=${gift.amount.toFixed(2)}&note=${encodeURIComponent(gift.memoCode)}`;

  const handleSent = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await markManualGiftSent({ id: gift.id, claimToken, donorReference: reference.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-6" role="status">
        <div className="flex items-start gap-4 rounded-2xl border border-awc-warn-line bg-awc-warn-bg p-5">
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-awc-warn" aria-hidden="true" />
          <div className="space-y-1.5 text-awc-warn">
            <p className="text-base font-semibold">Thank you. Your gift is pending confirmation.</p>
            <p className="text-[15px] leading-relaxed">
              Our Finance team will match your {providerName} payment using code{' '}
              <span className="font-mono font-semibold tracking-wider">{gift.memoCode}</span>. Once it's confirmed,
              usually within 2 business days, your receipt goes to {donorEmail}.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-awc-muted">
          Haven't sent it yet? You can still send {money(gift.amount)} with the code above. Nothing is recorded as
          received until Finance confirms the payment.
        </p>
        {onViewMyGiving ? (
          <button
            type="button"
            onClick={onViewMyGiving}
            className="inline-flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-awc-primary px-6 text-[15px] font-semibold text-awc-primary transition-colors hover:bg-awc-primary hover:text-awc-on-primary"
          >
            Go to My giving
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-awc-muted transition-colors hover:text-awc-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Change gift
        </button>
        <span className="text-sm text-awc-muted">{gift.fundName}</span>
      </div>

      <div className="text-center">
        <p className="text-sm text-awc-muted">Your gift with {providerName}</p>
        <p className="font-serif-display text-6xl leading-none text-awc-ink tabular-nums">{money(gift.amount)}</p>
      </div>

      <ol className="space-y-3">
        {isZelle ? (
          <>
            <Step n={1} title="Open Zelle in your bank's app">
              <p className="text-[13px] text-awc-muted">Any bank that offers Zelle works.</p>
            </Step>
            <Step n={2} title="Send to the church">
              <CopyRow
                label="Zelle recipient"
                value={paymentOptions.zelle.recipient}
                hint={`Shows as ${paymentOptions.zelle.recipientName}`}
              />
            </Step>
          </>
        ) : isCashApp && cashApp ? (
          <>
            <Step n={1} title="Open Cash App and tap Pay">
              {cashAppLink ? (
                <a
                  href={cashAppLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-awc-primary px-5 text-[15px] font-semibold text-awc-on-primary transition-opacity hover:opacity-90"
                >
                  Open Cash App
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : (
                <p className="text-[13px] text-awc-muted">Enter {money(gift.amount)}, then tap Pay.</p>
              )}
            </Step>
            <Step n={2} title="Send to the church">
              <CopyRow label="Cash App recipient" value={cashApp.recipient} hint="Enter this in the To field" />
            </Step>
          </>
        ) : (
          <Step n={1} title={`Pay @${venmoHandle} in Venmo`}>
            <a
              href={venmoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-awc-primary px-5 text-[15px] font-semibold text-awc-on-primary transition-opacity hover:opacity-90"
            >
              Open Venmo
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="text-[13px] text-awc-muted">
              Opens the church's business profile with the amount and code filled in. Check both before you pay.
            </p>
          </Step>
        )}
        <Step n={isZelle || isCashApp ? 3 : 2} title={isCashApp ? 'Put this code in the "For" note' : 'Put this code in the memo'}>
          <CopyRow label="memo code" value={gift.memoCode} mono />
          <p className="text-[13px] text-awc-muted">This is how Finance matches your gift to you.</p>
        </Step>
      </ol>

      <div className="space-y-2">
        <label htmlFor="manual-ref" className="block text-sm font-semibold text-awc-ink">
          {providerName} confirmation number{' '}
          <span className="font-normal text-awc-muted">(optional)</span>
        </label>
        <input
          id="manual-ref"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={80}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Helps Finance confirm it faster"
          className="w-full min-h-12 rounded-xl border-[1.5px] border-awc-line bg-awc-paper px-4 text-[15px] text-awc-ink outline-none placeholder:text-awc-muted/70 focus:border-awc-accent"
        />
      </div>

      {error ? (
        <p className="rounded-xl bg-awc-bad-bg px-4 py-3 text-sm text-awc-bad" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void handleSent()}
          disabled={submitting}
          className="w-full min-h-[60px] rounded-full bg-awc-primary text-[17px] font-semibold text-awc-on-primary transition-[transform,box-shadow,opacity] hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(59,10,13,0.28)] disabled:opacity-60"
        >
          {submitting ? 'Saving…' : "I've sent it"}
        </button>
        <p className="text-center text-[13px] leading-relaxed text-awc-muted">
          This tells Finance to look for your gift. It shows as pending until they confirm the payment arrived, then
          your receipt is emailed.
        </p>
      </div>
    </div>
  );
};
