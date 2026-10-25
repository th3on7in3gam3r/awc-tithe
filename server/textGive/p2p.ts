/**
 * Cash App, Venmo and Zelle can't be charged by the church — the giver taps
 * Send in their own app. A text gift with one of these creates the same
 * manual-gift record as the giving page (memo code), so Finance can match the
 * payment, and the reply carries a link that opens the app with the amount
 * filled in (Cash App, Venmo) or the details to send (Zelle).
 */
import { env, publicPaymentOptions } from '../config';
import { alertFinance, createManualGift } from '../manualGifts/store';
import type { TextGiveMethod, TextGiver } from './store';
import type { FundRecord } from '../funds/store';
import { TEXT_GIVE_FUND_ID } from './stripe';

export const P2P_LABEL: Record<string, string> = {
  cash_app: 'Cash App',
  venmo: 'Venmo',
  zelle: 'Zelle',
};

/** Which person-to-person methods the church has set up (same as the giving page). */
export function availableP2P(): TextGiveMethod[] {
  const o = publicPaymentOptions();
  const out: TextGiveMethod[] = [];
  if (o.cashApp.enabled) out.push('cash_app');
  if (o.venmo.enabled) out.push('venmo');
  if (o.zelle.enabled) out.push('zelle');
  return out;
}

export type P2PInstructions = {
  method: TextGiveMethod;
  label: string;
  amount: string;
  memo: string;
  /** Opens the app with the amount filled in, when the app supports it. */
  link: string | null;
  /** Who to send to (cashtag, Venmo @, Zelle email/phone). */
  recipient: string;
  recipientName: string;
};

export function p2pInstructions(method: TextGiveMethod, cents: number, memo: string): P2PInstructions | null {
  const o = publicPaymentOptions();
  const amount = (cents / 100).toFixed(2);
  const name = env.churchName;
  if (method === 'cash_app' && o.cashApp.enabled) {
    const tag = o.cashApp.cashtag;
    return {
      method,
      label: 'Cash App',
      amount,
      memo,
      link: tag ? `https://cash.app/${tag}/${amount}` : null,
      recipient: tag || o.cashApp.recipient,
      recipientName: o.cashApp.recipientName || name,
    };
  }
  if (method === 'venmo' && o.venmo.enabled) {
    const q = new URLSearchParams({ txn: 'pay', audience: 'private', recipients: o.venmo.handle, amount, note: memo });
    return {
      method,
      label: 'Venmo',
      amount,
      memo,
      link: `https://venmo.com/?${q.toString()}`,
      recipient: `@${o.venmo.handle}`,
      recipientName: name,
    };
  }
  if (method === 'zelle' && o.zelle.enabled) {
    return {
      method,
      label: 'Zelle',
      amount,
      memo,
      link: null,
      recipient: o.zelle.recipient,
      recipientName: o.zelle.recipientName,
    };
  }
  return null;
}

export function p2pSmsText(i: P2PInstructions, fundName?: string): string {
  const money = `$${Number(i.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const forFund = fundName ? ` for ${fundName}` : '';
  if (i.link) {
    return `Thank you! Tap to send ${money}${forFund} with ${i.label}: ${i.link} Please put ${i.memo} in the note. (Using your ${i.label}. Text CHANGE to switch.)`;
  }
  return `Thank you! In your bank app, send ${money}${forFund} by ${i.label} to ${i.recipient} (${i.recipientName}) with memo ${i.memo}. (Using your ${i.label}. Text CHANGE to switch.)`;
}

/** Records the gift for Finance and returns the reply text. */
export async function p2pGiftReply(giver: TextGiver, cents: number, fund?: FundRecord): Promise<string | null> {
  const created = await createManualGift({
    provider: giver.method as 'cash_app' | 'venmo' | 'zelle',
    amount: cents / 100,
    fundId: fund?.id || TEXT_GIVE_FUND_ID,
    donorName: giver.donorName,
    donorEmail: giver.donorEmail,
    isAnonymous: false,
  });
  if (!created.ok) {
    console.warn('[text-give] manual gift not created:', created.error);
    return null;
  }
  alertFinance(created.value.gift, 'text_started');
  const i = p2pInstructions(giver.method, cents, created.value.gift.memoCode);
  return i ? p2pSmsText(i, fund?.name) : null;
}
