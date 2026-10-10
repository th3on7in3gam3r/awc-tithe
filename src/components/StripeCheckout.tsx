import React, { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
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
}

function StripePaymentForm({
  paymentIntentId,
  coverFees,
  onProcessing,
  onError,
  onMethodChange,
}: {
  paymentIntentId: string;
  coverFees: boolean;
  onProcessing: StripeCheckoutProps['onProcessing'];
  onError: StripeCheckoutProps['onError'];
  onMethodChange?: (method: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [methodType, setMethodType] = useState('card');

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

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{ layout: 'tabs' }}
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
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-church-burgundy hover:bg-church-burgundy-light disabled:opacity-60 text-white font-semibold py-3 px-4 transition-colors"
      >
        <Lock className="h-4 w-4" />
        {submitting ? 'Processing…' : confirmed ? 'Gift submitted' : 'Give now'}
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
  }, [amount, donorEmail, donorName, fundCode, fundId, fundName, frequency, isAnonymous, turnstileToken, onError]);

  if (loading || !clientSecret || !paymentIntentId || !stripePromise) {
    return <p className="text-sm text-slate-600">Preparing secure checkout…</p>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentForm
        paymentIntentId={paymentIntentId}
        coverFees={coverFees}
        onProcessing={onProcessing}
        onError={onError}
        onMethodChange={onMethodChange}
      />
    </Elements>
  );
};
