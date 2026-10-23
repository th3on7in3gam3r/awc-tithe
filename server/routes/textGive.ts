/**
 * One-time setup for text-an-amount giving (/text-give?t=…). The link was
 * texted to the giver's own phone, so it is the proof of that number.
 *
 * GET  /api/text-give/link?t=        → what the link is for (amount, phone hint)
 * POST /api/text-give/start          → Stripe client secret (card saved for later gifts)
 * POST /api/text-give/complete       → saves phone → card once Stripe confirms
 */
import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { env } from '../config';
import { payRateLimitMiddleware } from '../middleware/rateLimit';
import { ensureStripeCustomer } from './stripe';
import * as store from '../textGive/store';
import { getTextGiveStripe, textGiveFund, textGiveMetadata, textGiveTotals } from '../textGive/stripe';

const router = Router();

function phoneHint(phone: string): string {
  return `(•••) •••-${phone.slice(-4)}`;
}

const EXPIRED = {
  ok: false,
  error: 'LINK_EXPIRED',
  message: 'This link has expired or was already used. Text an amount (like 50) to get a new one.',
};

router.get('/link', async (req: Request, res: Response) => {
  const link = await store.findOpenLink(String(req.query.t || ''));
  if (!link) return res.status(404).json(EXPIRED);
  const fund = await textGiveFund();
  return res.json({
    ok: true,
    mode: link.amountCents > 0 ? 'give' : 'card',
    amountCents: link.amountCents,
    phoneHint: phoneHint(link.phone),
    fundName: fund.name,
    feeCents: textGiveTotals(link.amountCents, true).feeCents,
    publishableKey: env.stripePublishableKey || null,
    instantMaxCents: env.textGiveInstantMaxCents,
  });
});

router.post('/start', payRateLimitMiddleware, async (req: Request, res: Response) => {
  const stripe = getTextGiveStripe();
  if (!stripe) return res.status(503).json({ ok: false, message: 'Card giving is not available right now.' });
  const link = await store.findOpenLink(String(req.body?.t || ''));
  if (!link) return res.status(404).json(EXPIRED);

  const name = String(req.body?.name || '').replace(/[<>]/g, '').trim().slice(0, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const coverFees = req.body?.coverFees === true || req.body?.coverFees === 'true';
  if (name.length < 2) return res.status(400).json({ ok: false, message: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return res.status(400).json({ ok: false, message: 'Enter your email for gift receipts.' });
  }

  try {
    const customerId = await ensureStripeCustomer(stripe, email, name);
    if (!customerId) return res.status(400).json({ ok: false, message: 'Enter your email for gift receipts.' });
    const common = { textGiveLinkId: link.id, textGiveCoverFees: String(coverFees) };

    if (link.amountCents > 0) {
      const fund = await textGiveFund();
      const t = textGiveTotals(link.amountCents, coverFees);
      const pi = await stripe.paymentIntents.create({
        amount: t.totalCents,
        currency: 'usd',
        customer: customerId,
        payment_method_types: ['card'],
        setup_future_usage: 'off_session',
        receipt_email: email,
        statement_descriptor_suffix: 'AWC TITHE',
        metadata: textGiveMetadata({
          fund,
          donorName: name,
          donorEmail: email,
          customerId,
          principal: t.fees.principal,
          feeAmount: t.fees.feeAmount,
          coverFees,
          extra: common,
        }),
      });
      return res.json({ ok: true, kind: 'payment', clientSecret: pi.client_secret, totalCents: t.totalCents, feeCents: t.feeCents });
    }

    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { product: 'awc_tithe', ...common, donorName: name, donorEmail: email },
    });
    return res.json({ ok: true, kind: 'setup', clientSecret: si.client_secret });
  } catch (err) {
    console.error('[text-give] start failed', err instanceof Error ? err.message : err);
    return res.status(502).json({ ok: false, message: 'We could not start card setup. Please try again.' });
  }
});

router.post('/complete', async (req: Request, res: Response) => {
  const stripe = getTextGiveStripe();
  if (!stripe) return res.status(503).json({ ok: false, message: 'Card giving is not available right now.' });
  const link = await store.findOpenLink(String(req.body?.t || ''));
  if (!link) return res.status(404).json(EXPIRED);
  const intentId = String(req.body?.intentId || '');

  try {
    let meta: Stripe.Metadata;
    let customerId: string;
    let paymentMethodId: string;
    if (intentId.startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(intentId);
      if (pi.status !== 'succeeded' && pi.status !== 'processing') {
        return res.status(409).json({ ok: false, message: 'Your card has not been confirmed yet.' });
      }
      meta = pi.metadata;
      customerId = String(pi.customer || '');
      paymentMethodId = typeof pi.payment_method === 'string' ? pi.payment_method : String(pi.payment_method?.id || '');
    } else if (intentId.startsWith('seti_')) {
      const si = await stripe.setupIntents.retrieve(intentId);
      if (si.status !== 'succeeded') {
        return res.status(409).json({ ok: false, message: 'Your card has not been confirmed yet.' });
      }
      meta = si.metadata || {};
      customerId = String(si.customer || '');
      paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : String(si.payment_method?.id || '');
    } else {
      return res.status(400).json({ ok: false, message: 'That request was not valid.' });
    }

    // The intent must have been started from this exact link.
    if (meta.textGiveLinkId !== link.id || !customerId || !paymentMethodId) {
      return res.status(403).json({ ok: false, message: 'That request was not valid.' });
    }
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    await store.saveGiver({
      phone: link.phone,
      stripeCustomerId: customerId,
      paymentMethodId,
      cardBrand: pm.card?.brand || '',
      cardLast4: pm.card?.last4 || '',
      donorName: String(meta.donorName || ''),
      donorEmail: String(meta.donorEmail || ''),
      coverFees: meta.textGiveCoverFees === 'true',
    });
    await store.useLink(link.id);
    return res.json({
      ok: true,
      phoneHint: phoneHint(link.phone),
      card: `${pm.card?.brand ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1) : 'Card'} ••${pm.card?.last4 || ''}`,
    });
  } catch (err) {
    console.error('[text-give] complete failed', err instanceof Error ? err.message : err);
    return res.status(502).json({ ok: false, message: 'We could not save your card. Please try again.' });
  }
});

export default router;
