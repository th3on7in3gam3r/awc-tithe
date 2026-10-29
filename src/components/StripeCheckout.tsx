import React, { useEffect, useState } from 'react';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import { createStripePaymentIntent, pollStripePaymentStatus, updateStripePaymentIntent } from '../lib/api';

interface StripeCheckoutProps {
  amount: number;
  coverFees?: boolean;
  donorName: string;
  donorEmail: string;
  fundId: string;
  fundCode: string;
  fundName: string;
  frequency: string;
  isAnonymous?: boolean;
  publishableKey: string;
  turnstileToken?: string | null;
  onProcessing: (result: { paymentIntentId: string; status: string; receiptNumber?: string }) => void;
  onError: (message: string) => void;
  onMethodChange?: (method: string) => void;
  /** Tab to open first in the Payment Element (card, us_bank_account, cashapp). */
  preferredMethod?: string;
  /** Where redirect-based methods (Cash App Pay on a phone, some bank flows) come back to. */
  returnUrl: string;
  /** Button text, e.g. "Give $103.20 monthly". */
  submitLabel: string;
  /** AWC Vault RSVP reference (rsvp:<uuid>) when the donor came from an event signup. */
  externalRef?: string | null;
  /** The RSVP's event fund name (server uses it for RSVP gifts). */
  eventFund?: string | null;
  /** Where the donor came from ("sms" for text-to-give). */
  giftSource?: string | null;
}

const METHOD_ORDER = ['card', 'apple_pay', 'google_pay', 'us_bank_account', 'cashapp'];

export function stripeAppearance(): Appearance {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return {
    theme: dark ? 'night' : 'stripe',
    variables: dark
      ? {
          colorPrimary: '#E9C979',
          colorBackground: '#1E1412',
          colorText: '#F4ECE2',
          colorTextSecondary: '#BCA99F',
          colorDanger: '#F2A99E',
          borderRadius: '12px',
          fontFamily: '"Instrument Sans", system-ui, sans-serif',
        }
      : {
          colorPrimary: '#5A1218',
          colorBackground: '#FFFDF8',
          colorText: '#1F1412',
          colorTextSecondary: '#6B5A55',
          colorDanger: '#7A1E14',
          borderRadius: '12px',
          fontFamily: '"Instrument Sans", system-ui, sans-serif',
        },
  };
}

function StripePaymentForm({
  paymentIntentId,
  coverFees,
  onProcessing,
  onError,
  onMethodChange,
  preferredMethod,
  returnUrl,
  submitLabel,
}: {
  paymentIntentId: string;
  coverFees: boolean;
  onProcessing: StripeCheckoutProps['onProcessing'];
  onError: StripeCheckoutProps['onError'];
  onMethodChange?: (method: string) => void;
  preferredMethod?: string;
  returnUrl: string;
  submitLabel: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [methodType, setMethodType] = useState(preferredMethod || 'card');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await updateStripePaymentIntent({
          paymentIntentId,
          coverFees,
          paymentMethodType: methodType,
        });
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Could not update the gift total.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coverFees, methodType, paymentIntentId, onError]);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      await updateStripePaymentIntent({
        paymentIntentId,
        coverFees,
        paymentMethodType: methodType,
      });
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: returnUrl },
      });
      if (error) {
        onError(error.message || 'Payment failed.');
        return;
      }
      const id = paymentIntent?.id || paymentIntentId;
      setConfirmed(true);
      onProcessing({ paymentIntentId: id, status: 'processing' });
      void pollStripePaymentStatus(id)
        .then((status) =>
          onProcessing({
            paymentIntentId: id,
            status: status.status,
            receiptNumber: status.receiptNumber,
          })
        )
        .catch((err) =>
          onError(err instanceof Error ? err.message : 'Could not check payment status.')
        );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Stripe confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const order = preferredMethod
    ? [preferredMethod, ...METHOD_ORDER.filter((m) => m !== preferredMethod)]
    : METHOD_ORDER;

  return (
    <div className="space-y-5">
      <PaymentElement
        options={{ layout: 'tabs', paymentMethodOrder: order }}
        onChange={(event) => {
          const type = event.value?.type;
          if (type && type !== methodType) {
            setMethodType(type);
            onMethodChange?.(type);
          }
        }}
      />
      <button
        type="button"
        disabled={!stripe || submitting || confirmed}
        onClick={handlePay}
        className="w-full min-h-[60px] inline-flex items-center justify-center gap-2.5 rounded-full bg-awc-primary text-awc-on-primary text-[17px] font-semibold tracking-[0.01em] transition-[transform,box-shadow,opacity] hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(59,10,13,0.28)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-awc-gold-soft"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        {submitting ? 'Processing…' : confirmed ? 'Gift submitted' : submitLabel}
      </button>
    </div>
  );
}

export const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  amount,
  coverFees = false,
  donorName,
  donorEmail,
  fundId,
  fundCode,
  fundName,
  frequency,
  isAnonymous = false,
  publishableKey,
  turnstileToken = null,
  onProcessing,
  onError,
  onMethodChange,
  preferredMethod,
  returnUrl,
  submitLabel,
  externalRef = null,
  eventFund = null,
  giftSource = null,
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setStripePromise(loadStripe(publishableKey));
  }, [publishableKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setClientSecret(null);
      try {
        const intent = await createStripePaymentIntent({
          amount,
          coverFees,
          donorName,
          donorEmail,
          fundId,
          fundCode,
          fundName,
          frequency,
          isAnonymous,
          turnstileToken,
          paymentMethodType: preferredMethod,
          externalRef,
          eventFund,
          giftSource,
        });
        if (!cancelled) {
          setClientSecret(intent.clientSecret);
          setPaymentIntentId(intent.paymentIntentId);
        }
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Could not start checkout.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, donorEmail, donorName, fundCode, fundId, fundName, frequency, isAnonymous, turnstileToken, preferredMethod, externalRef, eventFund, giftSource, onError]);

  if (loading || !clientSecret || !paymentIntentId || !stripePromise) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-awc-line text-sm text-awc-muted" role="status">
        Preparing secure checkout…
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: stripeAppearance(),
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap' }],
      }}
    >
      <StripePaymentForm
        paymentIntentId={paymentIntentId}
        coverFees={coverFees}
        onProcessing={onProcessing}
        onError={onError}
        onMethodChange={onMethodChange}
        preferredMethod={preferredMethod}
        returnUrl={returnUrl}
        submitLabel={submitLabel}
      />
    </Elements>
  );
};
