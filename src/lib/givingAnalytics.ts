/**
 * Dashboard numbers computed only from the real ledger. No sample data:
 * an empty ledger gives zeros and empty lists.
 */
import type { Donation, Donor, PaymentMethod } from '../types';

export interface MonthPoint {
  /** e.g. "Oct 26" */
  month: string;
  total: number;
  recurring: number;
  givers: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function completedGifts(donations: Donation[]): Donation[] {
  return donations.filter((d) => d.status === 'completed');
}

/** Completed giving in the calendar year of `now`. */
export function givingYearToDate(donations: Donation[], now = new Date()): number {
  const year = now.getFullYear();
  return round2(
    completedGifts(donations)
      .filter((d) => new Date(d.timestamp).getFullYear() === year)
      .reduce((s, d) => s + d.amount, 0)
  );
}

/** The last `count` calendar months, oldest first, ending with the month of `now`. */
export function monthlyGiving(donations: Donation[], now = new Date(), count = 12): MonthPoint[] {
  const points: Array<MonthPoint & { key: string; emails: Set<string> }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      total: 0,
      recurring: 0,
      givers: 0,
      emails: new Set(),
    });
  }
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const gift of completedGifts(donations)) {
    const t = new Date(gift.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const point = byKey.get(`${t.getFullYear()}-${t.getMonth()}`);
    if (!point) continue;
    point.total += gift.amount;
    if (gift.frequency !== 'one-time') point.recurring += gift.amount;
    point.emails.add((gift.donorEmail || gift.donorId || gift.id).toLowerCase());
  }
  return points.map(({ month, total, recurring, emails }) => ({
    month,
    total: round2(total),
    recurring: round2(recurring),
    givers: emails.size,
  }));
}

const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  'bi-weekly': 26 / 12,
  monthly: 1,
  annually: 1 / 12,
};

/** Monthly equivalent of every active recurring gift. */
export function recurringMonthlyRunRate(donors: Donor[]): number {
  return round2(
    donors
      .filter((d) => d.recurringActive && d.recurringAmount)
      .reduce((s, d) => s + (d.recurringAmount || 0) * (PER_MONTH[d.recurringFrequency || 'monthly'] ?? 1), 0)
  );
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  ach: 'Bank (ACH)',
  apple_pay: 'Apple Pay / Google Pay',
  cash_app: 'Cash App',
  zelle: 'Zelle',
  venmo: 'Venmo',
  check: 'Check',
  cash: 'Cash',
};

export interface ChannelShare {
  method: PaymentMethod;
  label: string;
  amount: number;
  count: number;
  percent: number;
}

/** Completed giving by payment method, largest first. */
export function channelBreakdown(donations: Donation[]): ChannelShare[] {
  const gifts = completedGifts(donations);
  const total = gifts.reduce((s, d) => s + d.amount, 0);
  const map = new Map<PaymentMethod, { amount: number; count: number }>();
  for (const g of gifts) {
    const row = map.get(g.paymentMethod) || { amount: 0, count: 0 };
    row.amount += g.amount;
    row.count += 1;
    map.set(g.paymentMethod, row);
  }
  return [...map.entries()]
    .map(([method, v]) => ({
      method,
      label: METHOD_LABELS[method] || method,
      amount: round2(v.amount),
      count: v.count,
      percent: total > 0 ? Math.round((v.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type CohortKey = 'recurring' | 'repeat' | 'first-time';

export interface Cohort {
  key: CohortKey;
  name: string;
  description: string;
  count: number;
  totalAmount: number;
  percent: number;
}

/** Group real donors: active recurring, gave more than once, gave once. */
export function donorCohorts(donors: Donor[]): Cohort[] {
  const base: Record<CohortKey, Omit<Cohort, 'count' | 'totalAmount' | 'percent'>> = {
    recurring: { key: 'recurring', name: 'Recurring givers', description: 'Have an active weekly, monthly or yearly gift.' },
    repeat: { key: 'repeat', name: 'Repeat givers', description: 'Have given more than once, without a recurring gift.' },
    'first-time': { key: 'first-time', name: 'First-time givers', description: 'Have given once so far.' },
  };
  const tally: Record<CohortKey, { count: number; total: number }> = {
    recurring: { count: 0, total: 0 },
    repeat: { count: 0, total: 0 },
    'first-time': { count: 0, total: 0 },
  };
  const real = donors.filter((d) => d.totalGiftsCount > 0 || d.recurringActive);
  for (const d of real) {
    const key: CohortKey = d.recurringActive ? 'recurring' : d.totalGiftsCount > 1 ? 'repeat' : 'first-time';
    tally[key].count += 1;
    tally[key].total += d.lifetimeGiving;
  }
  return (Object.keys(base) as CohortKey[]).map((k) => ({
    ...base[k],
    count: tally[k].count,
    totalAmount: round2(tally[k].total),
    percent: real.length > 0 ? Math.round((tally[k].count / real.length) * 100) : 0,
  }));
}
