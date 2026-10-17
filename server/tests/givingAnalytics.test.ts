/**
 * Dashboard numbers come only from the ledger: an empty ledger shows zeros,
 * never sample data.
 *
 * Run: npx tsx server/tests/givingAnalytics.test.ts
 */
import {
  channelBreakdown,
  donorCohorts,
  givingYearToDate,
  monthlyGiving,
  recurringMonthlyRunRate,
} from '../../src/lib/givingAnalytics';
import type { Donation, Donor } from '../../src/types';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

const now = new Date(2026, 9, 17); // Oct 17 2026

function gift(p: Partial<Donation>): Donation {
  return {
    id: Math.random().toString(36).slice(2),
    transactionId: 'tx',
    receiptNumber: 'R',
    donorId: 'd',
    donorName: 'A',
    donorEmail: 'a@example.org',
    amount: 10,
    feeCovered: false,
    feeAmount: 0,
    totalCharged: 10,
    frequency: 'one-time',
    fundId: 'fund-tithes',
    fundName: 'Tithes',
    paymentMethod: 'card',
    status: 'completed',
    isAnonymous: false,
    timestamp: new Date(2026, 9, 5).toISOString(),
    stripePaymentIntentId: '',
    encryptedToken: '',
    ...p,
  };
}

function donor(p: Partial<Donor>): Donor {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'A',
    email: 'a@example.org',
    phone: '',
    address: '',
    lifetimeGiving: 0,
    totalGiftsCount: 0,
    firstGiftDate: '',
    lastGiftDate: '',
    recurringActive: false,
    gdprConsent: true,
    gdprConsentDate: '',
    ...p,
  };
}

// --- empty ledger: no sample data
check('empty: YTD is 0', givingYearToDate([], now) === 0);
const emptyMonths = monthlyGiving([], now);
check('empty: 12 months, all zero', emptyMonths.length === 12 && emptyMonths.every((m) => m.total === 0 && m.givers === 0));
check('empty: run rate 0', recurringMonthlyRunRate([]) === 0);
check('empty: no channels', channelBreakdown([]).length === 0);
check('empty: cohorts all zero', donorCohorts([]).every((c) => c.count === 0 && c.percent === 0));
check('months end with the current month', emptyMonths[11].month === 'Oct 26' && emptyMonths[0].month === 'Nov 25');

// --- real gifts
const gifts = [
  gift({ amount: 100, paymentMethod: 'card' }),
  gift({ amount: 50, paymentMethod: 'zelle', donorEmail: 'b@example.org', frequency: 'monthly' }),
  gift({ amount: 999, status: 'pending' }),
  gift({ amount: 40, status: 'refunded' }),
  gift({ amount: 25, timestamp: new Date(2025, 11, 20).toISOString() }),
];
check('YTD counts only completed gifts this year', givingYearToDate(gifts, now) === 150, givingYearToDate(gifts, now));
const months = monthlyGiving(gifts, now);
check('October total and givers', months[11].total === 150 && months[11].givers === 2 && months[11].recurring === 50, months[11]);
check('December 2025 included', months[1].month === 'Dec 25' && months[1].total === 25, months[1]);
const ch = channelBreakdown(gifts);
check('channels exclude pending/refunded', ch.reduce((s, c) => s + c.amount, 0) === 175, ch);
check('largest channel first', ch[0].method === 'card' && ch[0].count === 2, ch);

check(
  'weekly gift converts to a monthly rate',
  recurringMonthlyRunRate([donor({ recurringActive: true, recurringAmount: 12, recurringFrequency: 'weekly' })]) === 52
);
const cohorts = donorCohorts([
  donor({ recurringActive: true, totalGiftsCount: 3, lifetimeGiving: 300 }),
  donor({ totalGiftsCount: 2, lifetimeGiving: 80 }),
  donor({ totalGiftsCount: 1, lifetimeGiving: 20 }),
  donor({ totalGiftsCount: 0 }),
]);
check('cohorts count only donors who gave', cohorts.reduce((s, c) => s + c.count, 0) === 3, cohorts);
check('recurring cohort', cohorts[0].count === 1 && cohorts[0].totalAmount === 300);

if (failed > 0) {
  console.error(`\n${failed} analytics check(s) failed.`);
  process.exit(1);
}
console.log('\nGiving analytics checks passed.');
