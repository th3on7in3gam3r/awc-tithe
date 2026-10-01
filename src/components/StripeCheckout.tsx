import React, { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import { confirmStripeAndSync, createStripePaymentIntent } from '../lib/api';

interface StripeCheckoutProps {
  amount: number;
  feeAmount: number;
  donorName: string;
  donorEmail: string;
  fundId: string;
  fundCode: string;
  fundName: string;
  frequency: string;
  isAnonymous?: boolean;
  publishableKey: string;
  onSuccess: (result: {
    paymentIntentId: string;
    voucherNumber: string;
    awcSynced: boolean;
  }) => void;
  onError: (message: string) => void;
  onCancelSimulatorHint?: () => void;
}

function StripePaymentForm({
  onSuccess,
  onError,
  isReady,
}: {
  onSuccess: StripeCheckoutProps['onSuccess'];
  onError: StripeCheckoutProps['onError'];
  isReady: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (error) {
        onError(error.message || 'Card payment failed.');
        return;
      }
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        onError('Payment was not completed. Please try again.');
        return;
      }
      const synced = await confirmStripeAndSync(paymentIntent.id);
      onSuccess({
        paymentIntentId: synced.paymentIntentId,
        voucherNumber: synced.voucherNumber,
        awcSynced: synced.awcSynced,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Stripe confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        disabled={!isReady || !stripe || submitting}
        onClick={handlePay}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-church-burgundy hover:bg-church-burgundy-light disabled:opacity-60 text-white font-semibold py-3 px-4 transition-colors"
      >
        <Lock className="h-4 w-4" />
        {submitting ? 'Processing secure payment…' : 'Pay with Stripe'}
      </button>
    </div>
  );
}

export const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  amount,
  feeAmount,
  donorName,
  donorEmail,
  fundId,
  fundCode,
  fundName,
  frequency,
  isAnonymous = false,
  publishableKey,
  onSuccess,
  onError,
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
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
        const total = Number((amount + feeAmount).toFixed(2));
        const intent = await createStripePaymentIntent({
          amount: total,
          feeAmount,
          donorName,
          donorEmail,
          fundId,
          fundCode,
          fundName,
          frequency,
          isAnonymous,
        });
        if (!cancelled) setClientSecret(intent.clientSecret);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Could not start Stripe payment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, feeAmount, donorName, donorEmail, fundId, fundCode, fundName, frequency, isAnonymous, onError]);

  if (loading || !clientSecret || !stripePromise) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500">
        Preparing secure Stripe checkout…
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <StripePaymentForm onSuccess={onSuccess} onError={onError} isReady={!loading} />
    </Elements>
  );
};
