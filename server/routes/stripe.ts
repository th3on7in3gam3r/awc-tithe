import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { env, stripeStatus } from '../config';
import { buildVoucherNumber, postContributionToDcb, type DcbContributionPayload } from '../dcb/client';
import { dcbDonorDisplayName } from '../dcb/displayName';
import { createGift } from '../gifts/store';

const router = Router();

function getStripe(): Stripe | null {
  if (!stripeStatus().configured) return null;
  return new Stripe(env.stripeSecretKey);
}

function metaFlagAnonymous(meta: Stripe.Metadata): boolean {
  const raw = String(meta.isAnonymous || meta.anonymous || '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function syncSucceededPaymentIntent(pi: Stripe.PaymentIntent) {
  const meta = pi.metadata || {};
  const amount = (pi.amount_received || pi.amount) / 100;
  const feeAmount = Number(meta.feeAmount || 0);
  const isAnonymous = metaFlagAnonymous(meta);
  const donorName = dcbDonorDisplayName({
    isAnonymous,
    donorName: meta.donorName,
  });
  const voucherNumber = buildVoucherNumber(pi.id);
  const payload: DcbContributionPayload = {
    bookId: env.awcDcbBookId,
    voucherNumber,
    donorName,
    donorEmail: meta.donorEmail || pi.receipt_email || '',
    envelopeNumber: meta.envelopeNumber || undefined,
    amount,
    feeAmount,
    netAmount: Number((amount - feeAmount).toFixed(2)),
    fundCode: meta.fundCode || '1001-OPS',
    fundName: meta.fundName || 'General Tithes & Offerings',
    paymentMethod: 'card',
    transactionId: pi.id,
    contributedAt: new Date().toISOString(),
  };

  const dcb = await postContributionToDcb(payload);

  const gift = await createGift({
    amount,
    feeCovered: feeAmount > 0,
    feeAmount,
    frequency: (meta.frequency as 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'annually') || 'one-time',
    fundId: meta.fundId || 'fund-tithes',
    fundName: meta.fundName || 'General Tithes & Offerings',
    fundCode: meta.fundCode || '1001-OPS',
    donorName: meta.donorName || donorName,
    donorEmail: meta.donorEmail || pi.receipt_email || '',
    paymentMethod: 'card',
    isAnonymous,
    stripePaymentIntentId: pi.id,
    transactionId: pi.id,
    awcDcbVoucher: dcb.voucherId,
    awcSynced: dcb.ok,
  });

  return { amount, dcb, voucherNumber: dcb.voucherId, gift };
}

router.post('/create-payment-intent', async (req: Request, res: Response) => {
  const status = stripeStatus();
  if (!status.configured) {
    return res.status(503).json({
      error: 'INTEGRATION_NOT_CONFIGURED',
      integration: 'stripe',
      message: 'Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to enable live card processing.',
    });
  }

  const stripe = getStripe()!;
  const {
    amount,
    currency = 'usd',
    donorName,
    donorEmail,
    fundId,
    fundCode,
    fundName,
    feeAmount = 0,
    envelopeNumber,
    frequency = 'one-time',
    isAnonymous = false,
  } = req.body as Record<string, unknown>;

  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be at least $0.50.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: String(currency),
      automatic_payment_methods: { enabled: true },
      receipt_email: typeof donorEmail === 'string' ? donorEmail : undefined,
      metadata: {
        product: 'awc_tithe',
        donorName: String(donorName || ''),
        donorEmail: String(donorEmail || ''),
        fundId: String(fundId || ''),
        fundCode: String(fundCode || ''),
        fundName: String(fundName || ''),
        feeAmount: String(feeAmount || 0),
        envelopeNumber: String(envelopeNumber || ''),
        frequency: String(frequency || 'one-time'),
        isAnonymous: String(Boolean(isAnonymous)),
      },
      statement_descriptor_suffix: 'AWC TITHE',
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      mode: status.mode,
    });
  } catch (err) {
    console.error('[stripe] create-payment-intent', err);
    return res.status(500).json({
      error: 'STRIPE_ERROR',
      message: err instanceof Error ? err.message : 'Failed to create PaymentIntent',
    });
  }
});

/** Confirm a succeeded PaymentIntent client-side and sync to AWC DCB + ledger */
router.post('/confirm-and-sync', async (req: Request, res: Response) => {
  const status = stripeStatus();
  if (!status.configured) {
    return res.status(503).json({
      error: 'INTEGRATION_NOT_CONFIGURED',
      integration: 'stripe',
    });
  }

  const stripe = getStripe()!;
  const { paymentIntentId } = req.body as { paymentIntentId?: string };
  if (!paymentIntentId) {
    return res.status(400).json({ error: 'MISSING_PAYMENT_INTENT' });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({
        error: 'PAYMENT_NOT_SUCCEEDED',
        status: pi.status,
      });
    }

    const synced = await syncSucceededPaymentIntent(pi);
    return res.json({
      paymentIntentId: pi.id,
      amount: synced.amount,
      dcb: synced.dcb,
      voucherNumber: synced.voucherNumber,
      awcSynced: synced.dcb.ok,
      donation: synced.gift.donation,
      donor: synced.gift.donor,
    });
  } catch (err) {
    console.error('[stripe] confirm-and-sync', err);
    return res.status(500).json({
      error: 'STRIPE_ERROR',
      message: err instanceof Error ? err.message : 'Confirm failed',
    });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  const status = stripeStatus();
  if (!status.configured) {
    return res.status(503).json({ error: 'INTEGRATION_NOT_CONFIGURED' });
  }

  const stripe = getStripe()!;
  let event: Stripe.Event;

  try {
    if (env.stripeWebhookSecret) {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return res.status(400).send('Missing stripe-signature');
      }
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      event = stripe.webhooks.constructEvent(rawBody || req.body, signature, env.stripeWebhookSecret);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    console.error('[stripe] webhook signature', err);
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'invalid'}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    try {
      await syncSucceededPaymentIntent(pi);
    } catch (err) {
      console.error('[stripe] webhook persist', err);
    }
  }

  return res.json({ received: true });
});

export default router;
