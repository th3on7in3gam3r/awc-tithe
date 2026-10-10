process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.RESEND_API_KEY = '';
process.env.BETTER_AUTH_SECRET = 'webhook-test-secret-with-at-least-32-chars';
process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_test';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_webhook_test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_webhook_test_secret';

import type Stripe from 'stripe';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeEvent(
  id: string,
  type: string,
  object: Record<string, unknown>
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

async function main(): Promise<void> {
  const [{ failNextWebhookProcessing, handleStripeEvent }, { getGiftByTransactionId, listAllGifts }] =
    await Promise.all([
      import('../stripe/handleWebhook'),
      import('../gifts/store'),
    ]);

  let chargeMethod: string | null = null;
  const subscriptions: Record<string, Record<string, unknown>> = {};
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => ({
        id,
        latest_charge: chargeMethod
          ? { payment_method_details: { type: chargeMethod } }
          : null,
      }),
    },
    invoices: {
      retrieve: async (id: string, _opts?: unknown) => ({
        id,
        payments: { data: [] },
      }),
    },
    subscriptions: {
      retrieve: async (id: string) => subscriptions[id] || { id, metadata: {}, items: { data: [] } },
    },
  } as unknown as Stripe;

  const pendingPi = {
    id: 'pi_webhook_test_ach',
    amount: 10080,
    amount_received: 0,
    currency: 'usd',
    customer: 'cus_webhook_test',
    receipt_email: 'webhook-test@example.com',
    status: 'processing',
    metadata: {
      product: 'awc_tithe',
      giftType: 'one-time',
      principalAmount: '100',
      feeCovered: 'true',
      frequency: 'one-time',
      fundId: 'fund-tithes',
      fundCode: 'TITHE',
      fundName: 'Tithes & Offerings',
      donorName: 'Webhook Test Donor',
      donorEmail: 'webhook-test@example.com',
    },
  };

  await handleStripeEvent(
    stripe,
    makeEvent('evt_webhook_test_processing', 'payment_intent.processing', pendingPi)
  );
  let gift = await getGiftByTransactionId(pendingPi.id);
  assert(gift?.status === 'pending', 'processing event must write a pending gift');
  assert(gift.paymentMethod === 'card', 'pending event must not invent a bank charge method');

  chargeMethod = 'us_bank_account';
  const succeededPi = { ...pendingPi, amount_received: 10080, status: 'succeeded' };
  await handleStripeEvent(
    stripe,
    makeEvent('evt_webhook_test_succeeded', 'payment_intent.succeeded', succeededPi)
  );
  gift = await getGiftByTransactionId(pendingPi.id);
  assert(gift?.status === 'completed', 'succeeded event must complete the pending gift');
  assert(gift.paymentMethod === 'us_bank_account', 'completed gift must store the charge method');
  assert(gift.feeAmount === 0.8, 'bank fee must be recalculated from the completed charge method');

  const replay = await handleStripeEvent(
    stripe,
    makeEvent('evt_webhook_test_succeeded', 'payment_intent.succeeded', succeededPi)
  );
  assert(replay.duplicate, 'replaying the same Stripe event id must be recognized');
  const ledger = await listAllGifts(100);
  assert(
    ledger.donations.filter((donation) => donation.transactionId === pendingPi.id).length === 1,
    'replayed webhook must not create duplicate donation rows'
  );
  const donor = ledger.donors.find((entry) => entry.email === 'webhook-test@example.com');
  assert(donor?.totalGiftsCount === 1, 'donor gift count must reflect one completed donation');
  assert(donor.lifetimeGiving === 100, 'donor lifetime giving must count the principal once');

  await handleStripeEvent(
    stripe,
    makeEvent('evt_webhook_test_refunded', 'charge.refunded', {
      id: 'ch_webhook_test',
      payment_intent: pendingPi.id,
    })
  );
  const refundedLedger = await listAllGifts(100);
  const refundedDonor = refundedLedger.donors.find(
    (entry) => entry.email === 'webhook-test@example.com'
  );
  assert(refundedDonor?.totalGiftsCount === 0, 'refund must remove the gift from donor completed totals');
  assert(refundedDonor.lifetimeGiving === 0, 'refund must refresh donor lifetime giving');

  const failedPi = {
    ...pendingPi,
    id: 'pi_webhook_test_failed',
    amount_received: 0,
    status: 'processing',
  };
  await handleStripeEvent(
    stripe,
    makeEvent('evt_webhook_test_failed_processing', 'payment_intent.processing', failedPi)
  );
  await handleStripeEvent(
    stripe,
    makeEvent(
      'evt_webhook_test_payment_failed',
      'payment_intent.payment_failed',
      { ...failedPi, status: 'requires_payment_method' }
    )
  );
  const failedGift = await getGiftByTransactionId(failedPi.id);
  assert(failedGift?.status === 'failed', 'payment_failed event must mark pending gift failed');

  const subMeta = {
    product: 'awc_tithe',
    giftType: 'subscription',
    principalAmount: '50',
    feeCovered: 'true',
    frequency: 'monthly',
    fundId: 'fund-tithes',
    fundCode: 'TITHE',
    fundName: 'Tithes & Offerings',
    donorName: 'Recurring Donor',
    donorEmail: 'recurring@example.com',
  };
  subscriptions.sub_basil = {
    id: 'sub_basil',
    metadata: subMeta,
    items: { data: [{ current_period_end: 1_800_000_000 }] },
  };

  function basilInvoice(id: string, piId: string) {
    return {
      id,
      amount_paid: 5080,
      amount_due: 5080,
      customer: 'cus_recurring',
      customer_email: 'recurring@example.com',
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: 'sub_basil',
          metadata: subMeta,
        },
      },
      payments: {
        data: [
          {
            payment: { type: 'payment_intent', payment_intent: piId },
          },
        ],
      },
    };
  }

  chargeMethod = 'card';
  await handleStripeEvent(
    stripe,
    makeEvent('evt_invoice_first', 'invoice.paid', basilInvoice('in_first', 'pi_sub_first'))
  );
  await handleStripeEvent(
    stripe,
    makeEvent('evt_invoice_renewal', 'invoice.paid', basilInvoice('in_renewal', 'pi_sub_renewal'))
  );
  const firstInvoice = await getGiftByTransactionId('in_first');
  const renewalInvoice = await getGiftByTransactionId('in_renewal');
  assert(firstInvoice?.frequency === 'monthly', 'first invoice gift must use subscription frequency');
  assert(firstInvoice.fundCode === 'TITHE', 'first invoice gift must use subscription fund');
  assert(firstInvoice.nextBillingDate, 'first invoice gift must store item current_period_end');
  assert(renewalInvoice?.status === 'completed', 'renewal invoice.paid must write a second gift');
  const recurringRows = (await listAllGifts(100)).donations.filter(
    (d) => d.donorEmail === 'recurring@example.com'
  );
  assert(recurringRows.length === 2, 'two invoice.paid events must write two gifts');

  await handleStripeEvent(
    stripe,
    makeEvent('evt_invoice_failed', 'invoice.payment_failed', basilInvoice('in_failed', 'pi_sub_failed'))
  );
  const failedInvoice = await getGiftByTransactionId('in_failed');
  assert(failedInvoice?.status === 'failed', 'invoice.payment_failed must write a failed subscription gift');

  const beforeIgnore = (await listAllGifts(200)).donations.length;
  await handleStripeEvent(
    stripe,
    makeEvent('evt_renewal_pi_no_meta', 'payment_intent.succeeded', {
      id: 'pi_renewal_bare',
      amount: 5080,
      amount_received: 5080,
      metadata: {},
    })
  );
  const afterIgnore = (await listAllGifts(200)).donations.length;
  assert(afterIgnore === beforeIgnore, 'renewal PaymentIntent without giftType must be ignored');

  const refundPi = {
    ...pendingPi,
    id: 'pi_partial_refund_target',
    amount_received: 10080,
    status: 'succeeded',
    metadata: { ...pendingPi.metadata, donorEmail: 'partial-refund@example.com' },
  };
  await handleStripeEvent(
    stripe,
    makeEvent('evt_refund_target_ok', 'payment_intent.succeeded', refundPi)
  );
  await handleStripeEvent(
    stripe,
    makeEvent('evt_partial_refund', 'charge.refunded', {
      id: 'ch_partial',
      amount: 10080,
      amount_refunded: 2500,
      payment_intent: refundPi.id,
    })
  );
  const partial = await getGiftByTransactionId(refundPi.id);
  assert(partial?.status === 'completed', 'partial refund must keep completed status');
  assert(partial.refundedAmount === 25, 'partial refund must store refunded_amount');

  await handleStripeEvent(
    stripe,
    makeEvent('evt_full_refund', 'charge.refunded', {
      id: 'ch_full',
      amount: 10080,
      amount_refunded: 10080,
      payment_intent: refundPi.id,
    })
  );
  const full = await getGiftByTransactionId(refundPi.id);
  assert(full?.status === 'refunded', 'full refund must mark the gift refunded');

  const [{ stripeWebhookHandler }, expressModule, StripeModule] = await Promise.all([
    import('../routes/stripe'),
    import('express'),
    import('stripe'),
  ]);
  const express = expressModule.default;
  const routeStripe = new StripeModule.default('sk_test_webhook_test');
  const routeEvent = {
    id: 'evt_webhook_http_retry',
    object: 'event',
    type: 'customer.subscription.deleted',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'sub_webhook_http_retry' } },
  };
  const payload = JSON.stringify(routeEvent);
  const signature = routeStripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const routeApp = express();
  routeApp.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhookHandler
  );
  const server = await new Promise<import('http').Server>((resolve) => {
    const listening = routeApp.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Webhook test server did not bind a port.');
  try {
    const unsigned = await fetch(`http://127.0.0.1:${address.port}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    assert(unsigned.status === 400, 'unsigned webhook request must be rejected');
    failNextWebhookProcessing();
    const sendWebhook = () =>
      fetch(`http://127.0.0.1:${address.port}/api/stripe/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
        body: payload,
      });
    const firstAttempt = await sendWebhook();
    assert(firstAttempt.status === 500, 'processing exception must return HTTP 500');
    const retry = await sendWebhook();
    assert(retry.status === 200, 'retry after rollback must process successfully');
    const replay = await sendWebhook();
    assert(replay.status === 200, 'replaying a committed event must return HTTP 200');
    const replayBody = (await replay.json()) as { duplicate?: boolean };
    assert(replayBody.duplicate === true, 'committed webhook replay must be idempotent');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }

  console.log('Stripe webhook idempotency, payment-state, signature, and retry checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
