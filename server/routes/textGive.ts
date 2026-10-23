/**
 * One-time setup for text-an-amount giving (/text-give?t=…). The link was
 * texted to the giver's own phone, so it is the proof of that number.
 *
 * GET  /api/text-give/link?t=        → what the link is for (amount, phone hint)
 * POST /api/text-give/start          → Stripe client secret (card saved for later gifts)
 * POST /api/text-give/complete       → saves phone → card / bank once Stripe confirms
 * POST /api/text-give/choose-p2p     → saves Cash App / Venmo / Zelle as the way to give
 */
import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { env } from '../config';
import { payRateLimitMiddleware } from '../middleware/rateLimit';
import { ensureStripeCustomer } from './stripe';
import * as store from '../textGive/store';
import { getTextGiveStripe, textGiveFund, textGiveMetadata, textGiveTotals } from '../textGive/stripe';
import { availableP2P, P2P_LABEL, p2pInstructions } from '../textGive/p2p';
import { createManualGift } from '../manualGifts/store';
import { getFundById } from '../funds/store';

const router = Router();

/** The fund named in the text ("40 dinner"); falls back to Tithes & Offerings if it has closed. */
async function linkFund(fundId: string) {
  const fund = await getFundById(fundId);
  return fund && fund.active ? fund : textGiveFund();
}

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
  const fund = await linkFund(link.fundId);
  return res.json({
    ok: true,
    mode: link.amountCents > 0 ? 'give' : 'card',
    amountCents: link.amountCents,
    phoneHint: phoneHint(link.phone),
    fundName: fund.name,
    feeCents: textGiveTotals(link.amountCents, true).feeCents,
    bankFeeCents: textGiveTotals(link.amountCents, true, 'us_bank_account').feeCents,
    methods: ['card', 'us_bank_account', ...availableP2P()],
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
  const method = req.body?.method === 'us_bank_account' ? 'us_bank_account' : 'card';
  if (name.length < 2) return res.status(400).json({ ok: false, message: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return res.status(400).json({ ok: false, message: 'Enter your email for gift receipts.' });
  }

  try {
    const customerId = await ensureStripeCustomer(stripe, email, name);
    if (!customerId) return res.status(400).json({ ok: false, message: 'Enter your email for gift receipts.' });
    const common = { textGiveLinkId: link.id, textGiveCoverFees: String(coverFees), textGiveMethod: method };
    const bankOptions =
      method === 'us_bank_account'
        ? { payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method' as const] } } } }
        : {};

    if (link.amountCents > 0) {
      const fund = await linkFund(link.fundId);
      const t = textGiveTotals(link.amountCents, coverFees, method);
      const pi = await stripe.paymentIntents.create({
        amount: t.totalCents,
        currency: 'usd',
        customer: customerId,
        payment_method_types: [method],
        ...bankOptions,
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
      payment_method_types: [method],
      ...bankOptions,
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
    const isBank = meta.textGiveMethod === 'us_bank_account' && pm.type === 'us_bank_account';
    const last4 = isBank ? pm.us_bank_account?.last4 || '' : pm.card?.last4 || '';
    const brand = isBank ? pm.us_bank_account?.bank_name || 'Bank' : pm.card?.brand || '';
    await store.saveGiver({
      phone: link.phone,
      method: isBank ? 'us_bank_account' : 'card',
      stripeCustomerId: customerId,
      paymentMethodId,
      cardBrand: brand,
      cardLast4: last4,
      donorName: String(meta.donorName || ''),
      donorEmail: String(meta.donorEmail || ''),
      coverFees: meta.textGiveCoverFees === 'true',
    });
    await store.useLink(link.id);
    return res.json({
      ok: true,
      phoneHint: phoneHint(link.phone),
      card: isBank
        ? `${brand} ••${last4}`
        : `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card'} ••${last4}`,
    });
  } catch (err) {
    console.error('[text-give] complete failed', err instanceof Error ? err.message : err);
    return res.status(502).json({ ok: false, message: 'We could not save your card. Please try again.' });
  }
});

router.post('/choose-p2p', payRateLimitMiddleware, async (req: Request, res: Response) => {
  const link = await store.findOpenLink(String(req.body?.t || ''));
  if (!link) return res.status(404).json(EXPIRED);
  const method = String(req.body?.method || '');
  if (!availableP2P().includes(method as store.TextGiveMethod)) {
    return res.status(400).json({ ok: false, message: 'Choose how you want to give.' });
  }
  const name = String(req.body?.name || '').replace(/[<>]/g, '').trim().slice(0, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (name.length < 2) return res.status(400).json({ ok: false, message: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return res.status(400).json({ ok: false, message: 'Enter your email for gift receipts.' });
  }
  if (!(await store.useLink(link.id))) return res.status(404).json(EXPIRED);

  // Keep a saved card/bank on file (if any) so switching back is one tap later.
  const previous = await store.getGiver(link.phone);
  await store.saveGiver({
    phone: link.phone,
    method: method as store.TextGiveMethod,
    stripeCustomerId: previous?.stripeCustomerId || '',
    paymentMethodId: previous?.paymentMethodId || '',
    cardBrand: previous?.cardBrand || '',
    cardLast4: previous?.cardLast4 || '',
    donorName: name,
    donorEmail: email,
    coverFees: false,
  });

  let instructions = null;
  if (link.amountCents > 0) {
    const created = await createManualGift({
      provider: method as 'cash_app' | 'venmo' | 'zelle',
      amount: link.amountCents / 100,
      fundId: (await linkFund(link.fundId)).id,
      donorName: name,
      donorEmail: email,
      isAnonymous: false,
    });
    if (created.ok) instructions = p2pInstructions(method as store.TextGiveMethod, link.amountCents, created.value.gift.memoCode);
  }
  return res.json({
    ok: true,
    phoneHint: phoneHint(link.phone),
    method,
    label: P2P_LABEL[method] || method,
    instructions,
  });
});

export default router;
