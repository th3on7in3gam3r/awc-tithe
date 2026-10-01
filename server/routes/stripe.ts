import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { env, stripeStatus } from '../config';
import { buildVoucherNumber, postContributionToDcb, type DcbContributionPayload } from '../dcb/client';

const router = Router();

function getStripe(): Stripe | null {
  if (!stripeStatus().configured) return null;
  return new Stripe(env.stripeSecretKey);
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

/** Confirm a succeeded PaymentIntent client-side and sync to AWC DCB */
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

    const meta = pi.metadata || {};
    const amount = (pi.amount_received || pi.amount) / 100;
    const feeAmount = Number(meta.feeAmount || 0);
    const voucherNumber = buildVoucherNumber(pi.id);
    const payload: DcbContributionPayload = {
      bookId: env.awcDcbBookId,
      voucherNumber,
      donorName: meta.donorName || 'Anonymous',
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
    return res.json({
      paymentIntentId: pi.id,
      amount,
      dcb,
      voucherNumber: dcb.voucherId,
      awcSynced: dcb.ok,
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
    const meta = pi.metadata || {};
    const amount = (pi.amount_received || pi.amount) / 100;
    const feeAmount = Number(meta.feeAmount || 0);
    const voucherNumber = buildVoucherNumber(pi.id);
    await postContributionToDcb({
      bookId: env.awcDcbBookId,
      voucherNumber,
      donorName: meta.donorName || 'Anonymous',
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
    });
  }

  return res.json({ received: true });
});

export default router;
