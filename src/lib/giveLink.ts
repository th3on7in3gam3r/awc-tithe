/**
 * Links from AWC Connect and anointedworshipcenter.com can pre-fill the
 * giving form, e.g. /?method=zelle&amount=50&from=connect
 *
 * Only pre-fills choices; the donor still reviews and confirms everything.
 */
import type { DonationFrequency } from '../types';

export type GiveLinkMethod = 'card' | 'us_bank_account' | 'zelle' | 'venmo' | 'cash_app';

export interface GiveLink {
  method?: GiveLinkMethod;
  amount?: number;
  frequency?: DonationFrequency;
}

const METHOD_ALIASES: Record<string, GiveLinkMethod> = {
  card: 'card',
  bank: 'us_bank_account',
  ach: 'us_bank_account',
  zelle: 'zelle',
  venmo: 'venmo',
  cashapp: 'cash_app',
  cash_app: 'cash_app',
};

const FREQUENCIES: DonationFrequency[] = ['one-time', 'weekly', 'bi-weekly', 'monthly', 'annually'];

/** Query keys this module reads, so the page can tidy the address bar afterwards. */
export const GIVE_LINK_KEYS = ['method', 'amount', 'frequency', 'from'];

export function parseGiveLink(search: string): GiveLink {
  const params = new URLSearchParams(search);
  const out: GiveLink = {};
  const method = METHOD_ALIASES[(params.get('method') || '').trim().toLowerCase()];
  if (method) out.method = method;
  const amount = Number(params.get('amount'));
  if (Number.isFinite(amount) && amount >= 1 && amount <= 100000) {
    out.amount = Math.round(amount * 100) / 100;
  }
  const frequency = (params.get('frequency') || '').trim().toLowerCase() as DonationFrequency;
  if (FREQUENCIES.includes(frequency)) out.frequency = frequency;
  return out;
}

/** The current address without the give-link keys (other params are kept). */
export function stripGiveLink(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  GIVE_LINK_KEYS.forEach((k) => params.delete(k));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
