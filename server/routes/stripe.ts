import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { env, stripeStatus } from '../config';
import { createStripeClient, paymentIntentIdFromClientSecret } from '../stripe/client';
import {
  findDonorByEmail,
  getGiftByTransactionId,
  setDonorStripeCustomerId,
} from '../gifts/store';
import { handleStripeEvent } from '../stripe/handleWebhook';
import { piBelongsToSession, rememberPaymentIntent } from '../stripe/piCookie';
import { payRateLimitMiddleware } from '../middleware/rateLimit';
import { requireTurnstile, validateMinGiftAmount } from '../middleware/turnstile';
import { computeProcessingFee } from '../../shared/fees';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/betterAuth';

const router = Router();

function getStripe(): Stripe | null {
  if (!stripeStatus().configured) return null;
  return createStripeClient(env.stripeSecretKey);
}

function metaFlagAnonymous(meta: Stripe.Metadata): boolean {
  const raw = String(meta.isAnonymous || meta.anonymous || '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function metaFlagCovered(meta: Stripe.Metadata): boolean {
  const raw = String(meta.feeCovered || '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function recurringCadence(frequency: string): {
  interval: 'week' | 'month' | 'year';
  interval_count: number;
} {
  if (frequency === 'weekly') return { interval: 'week', interval_count: 1 };
  if (frequency === 'bi-weekly') return { interval: 'week', interval_count: 2 };
  if (frequency === 'annually') return { interval: 'year', interval_count: 1 };
  return { interval: 'month', interval_count: 1 };
}

async function ensureStripeCustomer(
  stripe: Stripe,
  email: string,
  name: string
): Promise<string | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return undefined;

  const existingDonor = await findDonorByEmail(normalized);
  if (existingDonor?.stripeCustomerId) {
    return existingDonor.stripeCustomerId;
  }

  const listed = await stripe.customers.list({ email: normalized, limit: 1 });
  if (listed.data[0]?.id) {
    await setDonorStripeCustomerId(normalized, listed.data[0].id);
    return listed.data[0].id;
  }

  const created = await stripe.customers.create({
    email: normalized,
    name: name || undefined,
    metadata: { product: 'awc_tithe' },
  });
  await setDonorStripeCustomerId(normalized, created.id);
  return created.id;
}

router.post(
  '/create-payment-intent',
  payRateLimitMiddleware,
  requireTurnstile,
  async (req: Request, res: Response) => {
    const status = stripeStatus();
    if (!status.configured) {
      return res.status(503).json({
        error: 'INTEGRATION_NOT_CONFIGURED',
        integration: 'stripe',
        message: 'Set STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET to enable Stripe giving.',
      });
    }

    const stripe = getStripe()!;
    const {
      amount,
      donorName,
      donorEmail,
      fundId,
      fundCode,
      fundName,
      envelopeNumber,
      frequency = 'one-time',
      isAnonymous = false,
      coverFees = false,
    } = req.body as Record<string, unknown>;

    const principal = Number(amount);
    const minGift = validateMinGiftAmount(principal);
    if (!minGift.ok) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: `Amount must be at least $${(minGift.minCents / 100).toFixed(2)}.`,
        minGiftCents: minGift.minCents,
      });
    }

    const cover = parseBoolean(coverFees);
    const fees = computeProcessingFee({
      principal,
      method: 'card',
      coverFees: cover,
    });
    const amountCents = Math.round(fees.totalCharged * 100);
    const email = String(donorEmail || '').trim();
    const name = String(donorName || '').trim();

    try {
      const customerId = email ? await ensureStripeCustomer(stripe, email, name) : undefined;

      const frequencyName = String(frequency || 'one-time');
      if (frequencyName !== 'one-time') {
        if (!customerId) {
          return res.status(400).json({ error: 'EMAIL_REQUIRED', message: 'A valid email is required for recurring gifts.' });
        }
        const recurring = recurringCadence(frequencyName);
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: String(fundName || 'Gift') },
                unit_amount: amountCents,
                recurring,
              },
            },
          ],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription',
            payment_method_types: ['card', 'us_bank_account'],
            payment_method_options: {
              us_bank_account: {
                financial_connections: { permissions: ['payment_method'] },
              },
            },
          },
          expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payments.data.payment'],
          metadata: {
            product: 'awc_tithe',
            giftType: 'subscription',
            donorName: name,
            donorEmail: email,
            fundId: String(fundId || ''),
            fundCode: String(fundCode || ''),
            fundName: String(fundName || ''),
            principalAmount: String(fees.principal),
            feeAmount: String(fees.feeAmount),
            feeCovered: String(cover),
            frequency: frequencyName,
            isAnonymous: String(parseBoolean(isAnonymous)),
          },
        });
        const invoice = subscription.latest_invoice;
        const invoiceObj = invoice && typeof invoice === 'object' ? invoice : null;
        const clientSecret = invoiceObj?.confirmation_secret?.client_secret || '';
        if (!clientSecret) {
          return res.status(500).json({ error: 'SUBSCRIPTION_INTENT_MISSING' });
        }
        let paymentIntentId = paymentIntentIdFromClientSecret(clientSecret);
        for (const payment of invoiceObj?.payments?.data || []) {
          if (payment.payment?.type !== 'payment_intent') continue;
          const pi = payment.payment.payment_intent;
          if (typeof pi === 'string') paymentIntentId = pi;
          else if (pi && typeof pi === 'object' && 'id' in pi) paymentIntentId = String(pi.id);
        }
        if (paymentIntentId) rememberPaymentIntent(req, res, paymentIntentId);
        return res.json({
          clientSecret,
          paymentIntentId: paymentIntentId || subscription.id,
          subscriptionId: subscription.id,
          mode: status.mode,
          principalAmount: fees.principal,
          feeAmount: fees.feeAmount,
          totalCharged: fees.totalCharged,
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        payment_method_options: {
          us_bank_account: {
            financial_connections: { permissions: ['payment_method'] },
          },
        },
        receipt_email: email || undefined,
        metadata: {
          product: 'awc_tithe',
          giftType: 'one-time',
          donorName: name,
          donorEmail: email,
          fundId: String(fundId || ''),
          fundCode: String(fundCode || ''),
          fundName: String(fundName || ''),
          principalAmount: String(fees.principal),
          feeAmount: String(fees.feeAmount),
          feeCovered: String(cover),
          envelopeNumber: String(envelopeNumber || ''),
          frequency: String(frequency || 'one-time'),
          isAnonymous: String(parseBoolean(isAnonymous)),
          stripeCustomerId: customerId || '',
        },
        statement_descriptor_suffix: 'AWC TITHE',
      });

      rememberPaymentIntent(req, res, paymentIntent.id);
      return res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        mode: status.mode,
        principalAmount: fees.principal,
        feeAmount: fees.feeAmount,
        totalCharged: fees.totalCharged,
      });
    } catch (err) {
      console.error('[stripe] create-payment-intent', err);
      return res.status(500).json({
        error: 'STRIPE_ERROR',
        message: 'Failed to create PaymentIntent',
      });
    }
  }
);

router.post('/update-payment-intent', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'INTEGRATION_NOT_CONFIGURED' });
  const { paymentIntentId, coverFees, paymentMethodType } = req.body as {
    paymentIntentId?: string;
    coverFees?: boolean;
    paymentMethodType?: string;
  };
  if (!paymentIntentId || !piBelongsToSession(req, paymentIntentId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const methodType = String(paymentMethodType || 'card');
  if (methodType !== 'card' && methodType !== 'us_bank_account') {
    return res.status(400).json({ error: 'UNSUPPORTED_PAYMENT_METHOD' });
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'requires_payment_method' && pi.status !== 'requires_confirmation' && pi.status !== 'requires_action') {
      return res.status(409).json({ error: 'PAYMENT_INTENT_LOCKED', status: pi.status });
    }
    const principal = Number(pi.metadata?.principalAmount || 0);
    const fees = computeProcessingFee({
      principal,
      method: methodType,
      coverFees: parseBoolean(coverFees),
    });
    const subscriptionId = String(pi.metadata?.subscriptionId || '');
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionFeeChanged =
        Number(subscription.metadata?.feeAmount || 0) !== fees.feeAmount ||
        String(subscription.metadata?.feeCovered || '') !== String(parseBoolean(coverFees)) ||
        String(subscription.metadata?.paymentMethodType || 'card') !== methodType;
      if (subscriptionFeeChanged) {
        const item = subscription.items.data[0];
        if (!item) throw new Error(`Subscription ${subscriptionId} has no price item.`);
        await stripe.subscriptions.update(subscriptionId, {
          items: [
            {
              id: item.id,
              price_data: {
                currency: 'usd',
                product_data: { name: pi.metadata?.fundName || 'Gift' },
                unit_amount: Math.round(fees.totalCharged * 100),
                recurring: recurringCadence(pi.metadata?.frequency || 'monthly'),
              },
            },
          ],
          proration_behavior: 'none',
          metadata: {
            ...subscription.metadata,
            feeAmount: String(fees.feeAmount),
            feeCovered: String(parseBoolean(coverFees)),
            paymentMethodType: methodType,
          },
        });
      }
    }
    const updated = await stripe.paymentIntents.update(paymentIntentId, {
      amount: Math.round(fees.totalCharged * 100),
      metadata: {
        ...pi.metadata,
        feeAmount: String(fees.feeAmount),
        feeCovered: String(parseBoolean(coverFees)),
        paymentMethodType: methodType,
      },
    });
    return res.json({
      ok: true,
      paymentIntentId: updated.id,
      principalAmount: fees.principal,
      feeAmount: fees.feeAmount,
      totalCharged: fees.totalCharged,
    });
  } catch (err) {
    console.error('[stripe] update-payment-intent', err);
    return res.status(500).json({ error: 'STRIPE_ERROR' });
  }
});

router.get('/payment-status/:paymentIntentId', async (req: Request, res: Response) => {
  const paymentIntentId = String(req.params.paymentIntentId || '');
  if (!piBelongsToSession(req, paymentIntentId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const gift = await getGiftByTransactionId(paymentIntentId);
  if (!gift) return res.json({ status: 'processing' });
  return res.json({
    status: gift.status === 'completed' ? 'completed' : gift.status === 'failed' || gift.status === 'refunded' ? 'failed' : 'pending',
    receiptNumber: gift.status === 'completed' ? gift.receiptNumber : undefined,
  });
});

/**
 * POST /api/stripe/customer-portal
 * Donor-session only. Opens Stripe Customer Portal for that donor's own customer id.
 */
router.post('/customer-portal', async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Sign in to My Giving to manage recurring gifts.',
      });
    }

    const status = stripeStatus();
    if (!status.configured) {
      return res.status(503).json({ ok: false, error: 'INTEGRATION_NOT_CONFIGURED' });
    }

    const donor = await findDonorByEmail(email);
    if (!donor?.stripeCustomerId) {
      return res.status(404).json({
        ok: false,
        error: 'NO_STRIPE_CUSTOMER',
        message: 'No Stripe customer is linked to this giving profile yet.',
      });
    }

    const stripe = getStripe()!;
    const returnUrl = `${env.publicAppUrl.replace(/\/$/, '')}/`;
    const portal = await stripe.billingPortal.sessions.create({
      customer: donor.stripeCustomerId,
      return_url: returnUrl,
    });

    return res.json({ ok: true, url: portal.url });
  } catch (err) {
    console.error('[stripe] customer-portal', err);
    return res.status(500).json({
      ok: false,
      error: 'PORTAL_FAILED',
      message: 'Could not open billing portal',
    });
  }
});

/**
 * Stripe webhook handler — must be mounted with express.raw BEFORE express.json.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!env.stripeSecretKey) {
    res.status(503).json({ error: 'STRIPE_SECRET_KEY_REQUIRED' });
    return;
  }
  const stripe = createStripeClient(env.stripeSecretKey);
  let event: Stripe.Event;

  const secret = env.stripeWebhookSecret;
  if (!secret) {
    res.status(503).json({
      error: 'WEBHOOK_SECRET_REQUIRED',
      message: 'STRIPE_WEBHOOK_SECRET must be configured before webhook events can be processed.',
    });
    return;
  }
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      res.status(400).send('Missing stripe-signature');
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      console.error('[stripe] webhook expected raw Buffer body');
      res.status(400).send('Webhook Error: raw body required');
      return;
    }
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (err) {
    console.error('[stripe] webhook signature', err);
    res.status(400).send('Webhook Error: invalid');
    return;
  }

  try {
    const result = await handleStripeEvent(stripe, event);
    res.json({ received: true, duplicate: result.duplicate });
  } catch (err) {
    console.error('[stripe] webhook persist', err);
    res.status(500).json({ error: 'WEBHOOK_PROCESS_FAILED' });
  }
}

export default router;
