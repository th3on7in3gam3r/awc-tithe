/**
 * Stripe side of text-an-amount giving. Every charge carries the same metadata
 * as a gift made on the giving page, so the existing webhook records it,
 * emails the receipt and sends it to the DCB — nothing new downstream.
 */
import type Stripe from 'stripe';
import { env, stripeStatus } from '../config';
import { createStripeClient } from '../stripe/client';
import { computeProcessingFee } from '../../shared/fees';
import { getFundById, type FundRecord } from '../funds/store';
import type { TextGiver } from './store';
import type { ChargeResult } from './service';

export const TEXT_GIVE_FUND_ID = 'fund-tithes';

export function getTextGiveStripe(): Stripe | null {
  return stripeStatus().configured ? createStripeClient(env.stripeSecretKey) : null;
}

export async function textGiveFund(): Promise<FundRecord> {
  return (
    (await getFundById(TEXT_GIVE_FUND_ID)) || {
      id: TEXT_GIVE_FUND_ID,
      name: 'Tithes & Offerings',
      description: '',
      active: true,
      sortOrder: 0,
      glCode: '',
    }
  );
}

/** Principal + optional processing fee (card or bank), in cents. */
export function textGiveTotals(principalCents: number, coverFees: boolean, method: string = 'card') {
  const fees = computeProcessingFee({ principal: principalCents / 100, method, coverFees });
  return {
    principalCents,
    feeCents: Math.round(fees.feeAmount * 100),
    totalCents: Math.round(fees.totalCharged * 100),
    fees,
  };
}

/** Gift metadata identical in shape to the giving page's one-time gifts. */
export function textGiveMetadata(opts: {
  fund: FundRecord;
  donorName: string;
  donorEmail: string;
  customerId: string;
  principal: number;
  feeAmount: number;
  coverFees: boolean;
  extra?: Record<string, string>;
}): Stripe.MetadataParam {
  return {
    product: 'awc_tithe',
    giftType: 'one-time',
    donorName: opts.donorName,
    donorEmail: opts.donorEmail,
    fundId: opts.fund.id,
    fundCode: opts.fund.glCode || '',
    fundName: opts.fund.name,
    principalAmount: String(opts.principal),
    feeAmount: String(opts.feeAmount),
    feeCovered: String(opts.coverFees),
    envelopeNumber: '',
    frequency: 'one-time',
    isAnonymous: 'false',
    stripeCustomerId: opts.customerId,
    externalRef: '',
    giftSource: 'sms',
    ...(opts.extra || {}),
  };
}

/**
 * Charges the saved card without the giver present. The idempotency key (from
 * the Twilio message id) means a retried webhook can never charge twice.
 */
export async function chargeSavedCard(
  giver: TextGiver,
  principalCents: number,
  idempotencyKey: string,
  stripe: Stripe | null = getTextGiveStripe()
): Promise<ChargeResult> {
  if (!stripe) return { ok: false, reason: 'error' };
  const fund = await textGiveFund();
  const t = textGiveTotals(principalCents, giver.coverFees, giver.method);
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: t.totalCents,
        currency: 'usd',
        customer: giver.stripeCustomerId,
        payment_method: giver.paymentMethodId,
        payment_method_types: [giver.method === 'us_bank_account' ? 'us_bank_account' : 'card'],
        off_session: true,
        confirm: true,
        receipt_email: giver.donorEmail || undefined,
        statement_descriptor_suffix: 'AWC TITHE',
        description: `Text gift from ${giver.phone.slice(0, -4).replace(/\d/g, '•')}${giver.phone.slice(-4)}`,
        metadata: textGiveMetadata({
          fund,
          donorName: giver.donorName,
          donorEmail: giver.donorEmail,
          customerId: giver.stripeCustomerId,
          principal: t.fees.principal,
          feeAmount: t.fees.feeAmount,
          coverFees: giver.coverFees,
        }),
      },
      { idempotencyKey }
    );
    if (pi.status === 'succeeded' || pi.status === 'processing') {
      return { ok: true, paymentIntentId: pi.id, principalCents, feeCents: t.feeCents };
    }
    return { ok: false, reason: 'needs_card' };
  } catch (err: any) {
    const type = String(err?.type || '');
    const code = String(err?.code || '');
    console.warn('[text-give] charge failed:', type, code, err?.decline_code || '');
    if (
      type === 'StripeCardError' ||
      ['authentication_required', 'card_declined', 'payment_method_not_available', 'bank_account_unusable'].includes(code)
    ) {
      return { ok: false, reason: 'needs_card' };
    }
    return { ok: false, reason: 'error' };
  }
}
