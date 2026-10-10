/**
 * server/stripe/handleWebhook.ts
 *
 * Stripe webhook processor.
 *
 * Design:
 *  - All DB writes happen inside a single pg transaction per event.
 *  - The dcb_outbox row is inserted INSIDE that transaction so delivery is
 *    guaranteed: if the donation write fails, the outbox row is rolled back too.
 *  - DCB is NEVER called directly from here — the outbox worker handles delivery.
 *  - Receipt emails are sent after the transaction commits (fire-and-forget;
 *    email failure does not roll back the gift).
 */

import type Stripe from 'stripe';
import type pg from 'pg';
import { getPgPool } from '../auth/pgPool';
import { memoryStoreAllowed } from '../config';
import { buildVoucherNumber } from '../dcb/client';
import { dcbDonorDisplayName } from '../dcb/displayName';
import { insertOutboxRow } from '../dcb/outbox';
import { sendGiftReceiptEmail } from '../email/sendReceipt';
import { sendGiftPaymentFailedEmail } from '../email/sendPaymentFailed';
import {
  applyGiftRefund,
  createGift,
  markSubscriptionInactive,
  type GiftFrequency,
  type GiftPaymentMethod,
} from '../gifts/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const memoryEvents = new Set<string>();
let failNextWebhookForTest = false;

export function failNextWebhookProcessing(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Webhook failure injection is available only in tests.');
  }
  failNextWebhookForTest = true;
}

function throwIfWebhookFailureRequested(): void {
  if (!failNextWebhookForTest) return;
  failNextWebhookForTest = false;
  throw new Error('WEBHOOK_PROCESSING_FORCED_FAILURE');
}

function flag(value: string | undefined): boolean {
  const raw = String(value || '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function frequencyOf(value: string | undefined): GiftFrequency {
  if (
    value === 'weekly' ||
    value === 'bi-weekly' ||
    value === 'monthly' ||
    value === 'annually'
  )
    return value;
  return 'one-time';
}

function methodOf(type: string | undefined): GiftPaymentMethod {
  if (type === 'us_bank_account' || type === 'ach') return 'us_bank_account';
  if (
    type === 'card' ||
    type === 'apple_pay' ||
    type === 'cash' ||
    type === 'check'
  )
    return type;
  return 'card';
}

async function chargeMethod(
  stripe: Stripe,
  pi: Stripe.PaymentIntent
): Promise<string> {
  const expanded = await stripe.paymentIntents.retrieve(pi.id, {
    expand: ['latest_charge'],
  });
  const charge = expanded.latest_charge;
  if (charge && typeof charge === 'object') {
    return charge.payment_method_details?.type || 'card';
  }
  return 'card';
}

function isOneTimeTithePi(pi: Stripe.PaymentIntent): boolean {
  const meta = pi.metadata || {};
  return meta.product === 'awc_tithe' && meta.giftType === 'one-time';
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (typeof sub === 'string') return sub;
  if (sub && typeof sub === 'object' && 'id' in sub) return String(sub.id);
  return undefined;
}

function invoiceSubscriptionMetadata(invoice: Stripe.Invoice): Stripe.Metadata {
  return invoice.parent?.subscription_details?.metadata || {};
}

function invoicePaymentIntentId(invoice: Stripe.Invoice): string | undefined {
  for (const payment of invoice.payments?.data || []) {
    if (payment.payment?.type !== 'payment_intent') continue;
    const pi = payment.payment.payment_intent;
    if (typeof pi === 'string') return pi;
    if (pi && typeof pi === 'object' && 'id' in pi) return String(pi.id);
  }
  return undefined;
}

function subscriptionPeriodEndIso(subscription: Stripe.Subscription | null): string | null {
  const end = subscription?.items?.data?.[0]?.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000).toISOString() : null;
}

function chargeInvoiceId(charge: Stripe.Charge): string | undefined {
  const invoice = (charge as Stripe.Charge & { invoice?: string | { id?: string } | null }).invoice;
  if (typeof invoice === 'string') return invoice;
  if (invoice && typeof invoice === 'object' && invoice.id) return invoice.id;
  return undefined;
}

// ---------------------------------------------------------------------------
// Gift writers — return the donation record so the caller can enqueue DCB
// ---------------------------------------------------------------------------

interface GiftWriteResult {
  donationId: string;
  receiptNumber: string;
  transactionId: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  feeAmount: number;
  fundCode: string;
  fundName: string;
  paymentMethod: string;
  contributedAt: string;
  status: 'pending' | 'completed' | 'failed';
  isAnonymous: boolean;
  inserted: boolean;
  becameCompleted: boolean;
  becameFailed: boolean;
}

async function writeOneTimeGift(
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
  status: 'pending' | 'completed' | 'failed',
  pgClient?: pg.PoolClient
): Promise<GiftWriteResult | null> {
  const meta = pi.metadata || {};
  const charged = (pi.amount_received || pi.amount || 0) / 100;
  const principal = Number(meta.principalAmount || charged);
  const feeCovered = flag(meta.feeCovered);
  const methodType = await chargeMethod(stripe, pi);
  const result = await createGift({
    amount: principal > 0 ? principal : charged,
    feeCovered,
    frequency: frequencyOf(meta.frequency),
    fundId: meta.fundId || 'fund-tithes',
    fundName: meta.fundName || 'Tithes & Offerings',
    fundCode: meta.fundCode || '',
    donorName: meta.donorName || 'Donor',
    donorEmail: meta.donorEmail || pi.receipt_email || '',
    paymentMethod: methodOf(methodType),
    isAnonymous: flag(meta.isAnonymous),
    stripePaymentIntentId: pi.id,
    transactionId: pi.id,
    status,
    stripeCustomerId:
      typeof pi.customer === 'string' ? pi.customer : pi.customer?.id,
    pgClient,
  });
  const { donation } = result;

  return {
    donationId: donation.id,
    receiptNumber: donation.receiptNumber,
    transactionId: pi.id,
    donorName: donation.donorName,
    donorEmail: donation.donorEmail,
    amount: donation.amount,
    feeAmount: donation.feeAmount,
    fundCode: donation.fundCode,
    fundName: donation.fundName,
    paymentMethod: donation.paymentMethod,
    contributedAt: donation.timestamp,
    status: donation.status,
    isAnonymous: donation.isAnonymous,
    inserted: result.inserted,
    becameCompleted: result.becameCompleted,
    becameFailed: result.becameFailed,
  };
}

async function writeInvoiceGift(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  status: 'completed' | 'failed',
  pgClient?: pg.PoolClient
): Promise<GiftWriteResult | null> {
  let fullInvoice = invoice;
  if (!fullInvoice.payments?.data?.length) {
    try {
      fullInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['payments.data.payment.payment_intent'],
      });
    } catch (err) {
      console.error('[webhook] invoice retrieve', err);
    }
  }
  const subscriptionId = invoiceSubscriptionId(fullInvoice);
  const subscription = subscriptionId
    ? await stripe.subscriptions.retrieve(subscriptionId)
    : null;
  const meta = {
    ...(subscription?.metadata || {}),
    ...invoiceSubscriptionMetadata(fullInvoice),
  };
  const principal = Number(
    meta.principalAmount ||
      (fullInvoice.amount_paid || fullInvoice.amount_due || 0) / 100
  );
  const piId = invoicePaymentIntentId(fullInvoice);
  let methodType = 'card';
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(piId, {
      expand: ['latest_charge'],
    });
    const charge = pi.latest_charge;
    if (
      charge &&
      typeof charge === 'object' &&
      charge.payment_method_details?.type
    ) {
      methodType = charge.payment_method_details.type;
    }
  }
  const periodEnd = subscriptionPeriodEndIso(subscription);

  const result = await createGift({
    amount: principal,
    feeCovered: flag(meta.feeCovered),
    frequency: frequencyOf(meta.frequency),
    fundId: meta.fundId || 'fund-tithes',
    fundName: meta.fundName || 'Tithes & Offerings',
    fundCode: meta.fundCode || '',
    donorName: meta.donorName || 'Donor',
    donorEmail: meta.donorEmail || invoice.customer_email || '',
    paymentMethod: methodOf(methodType),
    isAnonymous: flag(meta.isAnonymous),
    stripePaymentIntentId: piId,
    transactionId: invoice.id,
    status,
    stripeCustomerId:
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id,
    stripeSubscriptionId: subscriptionId,
    nextBillingDate: periodEnd,
    pgClient,
  });
  const { donation } = result;

  return {
    donationId: donation.id,
    receiptNumber: donation.receiptNumber,
    transactionId: invoice.id,
    donorName: donation.donorName,
    donorEmail: donation.donorEmail,
    amount: donation.amount,
    feeAmount: donation.feeAmount,
    fundCode: donation.fundCode,
    fundName: donation.fundName,
    paymentMethod: donation.paymentMethod,
    contributedAt: donation.timestamp,
    status: donation.status,
    isAnonymous: donation.isAnonymous,
    inserted: result.inserted,
    becameCompleted: result.becameCompleted,
    becameFailed: result.becameFailed,
  };
}

// ---------------------------------------------------------------------------
// Build the DCB outbox payload from a gift write result
// ---------------------------------------------------------------------------

function buildDcbPayload(gift: GiftWriteResult): Record<string, unknown> {
  const donorName = dcbDonorDisplayName({
    isAnonymous: gift.isAnonymous,
    donorName: gift.donorName,
  });
  return {
    voucherNumber: buildVoucherNumber(gift.receiptNumber),
    donorName,
    donorEmail: gift.donorEmail,
    amount: gift.amount,
    feeAmount: gift.feeAmount,
    netAmount: Math.max(0, gift.amount - gift.feeAmount),
    fundCode: gift.fundCode,
    fundName: gift.fundName,
    paymentMethod: gift.paymentMethod,
    /** Full Stripe PI or invoice ID — used as the Idempotency-Key by the client */
    transactionId: gift.transactionId,
    contributedAt: gift.contributedAt,
    source: 'awc-tithe-bridge',
  };
}

// ---------------------------------------------------------------------------
// applyEvent — processes one Stripe event, returns outbox info
// ---------------------------------------------------------------------------

interface ApplyResult {
  /**
   * Outbox rows to insert INSIDE the pg transaction.
   * Populated only when a completed donation is written.
   */
  outbox: Array<{
    donationId: string;
    eventType: 'contribution' | 'refund';
    payload: Record<string, unknown>;
    initialStatus?: 'pending' | 'needs_review';
  }>;
  /** Resolved after the transaction commits (fire-and-forget). */
  afterCommit: Array<() => Promise<void>>;
}

async function applyEvent(
  stripe: Stripe,
  event: Stripe.Event,
  pgClient?: pg.PoolClient
): Promise<ApplyResult> {
  const result: ApplyResult = { outbox: [], afterCommit: [] };

  // ---- one-time card: processing (pending ACH) ----
  if (event.type === 'payment_intent.processing') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (!isOneTimeTithePi(pi)) return result;
    await writeOneTimeGift(stripe, pi, 'pending', pgClient);
    return result;
  }

  // ---- one-time card: succeeded ----
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (!isOneTimeTithePi(pi)) return result;
    const gift = await writeOneTimeGift(stripe, pi, 'completed', pgClient);
    if (gift?.becameCompleted) {
      result.outbox.push({
        donationId: gift.donationId,
        eventType: 'contribution',
        payload: buildDcbPayload(gift),
      });
      result.afterCommit.push(() => sendGiftReceiptEmail(pi.id));
    }
    return result;
  }

  // ---- one-time: failed / canceled ----
  if (
    event.type === 'payment_intent.payment_failed' ||
    event.type === 'payment_intent.canceled'
  ) {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (!isOneTimeTithePi(pi)) return result;
    await writeOneTimeGift(stripe, pi, 'failed', pgClient);
    return result;
  }

  // ---- subscription invoice: paid ----
  if (event.type === 'invoice.paid') {
    const gift = await writeInvoiceGift(
      stripe,
      event.data.object as Stripe.Invoice,
      'completed',
      pgClient
    );
    if (gift?.becameCompleted) {
      result.outbox.push({
        donationId: gift.donationId,
        eventType: 'contribution',
        payload: buildDcbPayload(gift),
      });
      result.afterCommit.push(() =>
        sendGiftReceiptEmail(gift.transactionId)
      );
    }
    return result;
  }

  // ---- subscription invoice: failed ----
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const gift = await writeInvoiceGift(stripe, invoice, 'failed', pgClient);
    if (gift?.becameFailed) {
      result.afterCommit.push(() =>
        sendGiftPaymentFailedEmail({
          donorEmail: gift.donorEmail,
          donorName: gift.donorName,
        })
      );
    }
    return result;
  }

  // ---- subscription cancelled ----
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await markSubscriptionInactive(sub.id, pgClient);
    return result;
  }

  // ---- refund ----
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const piRef = charge.payment_intent;
    const piId = typeof piRef === 'string' ? piRef : piRef?.id;
    const refundCents =
      typeof charge.amount_refunded === 'number' ? charge.amount_refunded : charge.amount;
    const refundAmount = (refundCents || 0) / 100;
    const donation = await applyGiftRefund({
      stripePaymentIntentId: piId,
      invoiceId: chargeInvoiceId(charge),
      amountRefunded: refundAmount,
      pgClient,
    });
    if (donation) {
      result.outbox.push({
        donationId: donation.id,
        eventType: 'refund',
        payload: {
          voucherNumber: buildVoucherNumber(donation.receiptNumber),
          transactionId: donation.transactionId,
          refundedAt: new Date().toISOString(),
          refundAmount,
        },
        initialStatus: 'needs_review',
      });
    }
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// handleStripeEvent — public entry point
// ---------------------------------------------------------------------------

/**
 * Verify already happened upstream. Inserts the event id and dcb_outbox rows
 * inside a single transaction, then fires after-commit side effects.
 */
export async function handleStripeEvent(
  stripe: Stripe,
  event: Stripe.Event
): Promise<{ duplicate: boolean }> {
  const pool = getPgPool();
  const piObj = event.data?.object as {
    id?: string;
    payment_intent?: string | { id?: string };
  };
  const piId =
    event.type.startsWith('payment_intent.') && piObj?.id
      ? piObj.id
      : typeof piObj?.payment_intent === 'string'
        ? piObj.payment_intent
        : null;

  // ---- Memory mode (no DATABASE_URL) ----
  if (!pool) {
    if (!memoryStoreAllowed()) {
      throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
    }
    if (memoryEvents.has(event.id)) return { duplicate: true };
    throwIfWebhookFailureRequested();
    const applyResult = await applyEvent(stripe, event, undefined);
    memoryEvents.add(event.id);
    // Fire after-commit side-effects (best-effort in memory mode)
    for (const fn of applyResult.afterCommit) {
      fn().catch((err) => console.error('[webhook] after-commit', err));
    }
    return { duplicate: false };
  }

  // ---- Postgres transaction ----
  const client = await pool.connect();
  let afterCommitFns: Array<() => Promise<void>> = [];
  try {
    await client.query('BEGIN');

    // Insert idempotency row
    const inserted = await client.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, payment_intent_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.type, piId]
    );
    if ((inserted.rowCount ?? 0) === 0) {
      await client.query('COMMIT');
      return { duplicate: true };
    }

    // Process the event using the same connection so writes roll back together.
    throwIfWebhookFailureRequested();
    const applyResult = await applyEvent(stripe, event, client);

    // Insert outbox rows — INSIDE the same transaction
    for (const entry of applyResult.outbox) {
      await insertOutboxRow(
        client,
        entry.donationId,
        entry.eventType,
        entry.payload,
        entry.initialStatus ?? 'pending'
      );
    }

    afterCommitFns = applyResult.afterCommit;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Fire after-commit side-effects outside the transaction (fire-and-forget)
  for (const fn of afterCommitFns) {
    fn().catch((err) => console.error('[webhook] after-commit', err));
  }

  return { duplicate: false };
}
