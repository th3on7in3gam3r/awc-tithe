/**
 * Pending-gift reminder: email content and the 9 AM Eastern daily schedule.
 * Run: npx tsx server/tests/pendingReminder.test.ts
 */
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';

async function main() {
  const { buildPendingReminder } = await import('../email/sendPendingGiftsReminder');
  const { easternDayAndHour } = await import('../financeAlerts/dailyReminder');
  let failed = 0;
  const check = (c: boolean, m: string) => (c ? console.log(`OK ${m}`) : (console.error(`FAIL ${m}`), failed++));
  const base = {
    fundId: 'fund-tithes', fundName: 'Tithes & Offerings', fundCode: '', donorEmail: 'x@y.com', donorReference: '',
    providerTransactionId: null, receivedAmount: null, receivedOn: null, verifiedBy: null, verifiedAt: null,
    rejectionReason: null, donationId: null, submittedAt: null, externalRef: null,
  };
  const now = Date.parse('2026-10-28T13:00:00Z');
  const gifts = [
    { ...base, id: 'b', memoCode: 'AWC-BBBB', provider: 'zelle', status: 'submitted', amount: 200, donorName: 'Kamya <b>', isAnonymous: false, createdAt: '2026-10-26T23:44:00Z' },
    { ...base, id: 'a', memoCode: 'AWC-AAAA', provider: 'cash_app', status: 'initiated', amount: 50.5, donorName: 'Ann', isAnonymous: true, createdAt: '2026-10-24T17:58:00Z' },
  ] as any[];
  const msg = buildPendingReminder(gifts, 'daily', now);
  check(msg.subject === 'AWC Tithe: 2 gifts waiting to be checked ($250.50)', 'subject has count and total');
  check(msg.text.indexOf('AWC-AAAA') < msg.text.indexOf('AWC-BBBB'), 'oldest gift first');
  check(/Waiting 3 days/.test(msg.text), 'shows days waiting');
  check(/asked to stay anonymous/.test(msg.text), 'flags anonymous givers');
  check(/may not have sent yet/.test(msg.text) && /Says sent/.test(msg.text), 'shows started vs sent');
  check(!msg.html.includes('<b>') && msg.html.includes('&lt;b&gt;'), 'names are HTML-escaped');
  check(/Daily reminder/.test(msg.text), 'daily wording');
  check(/^This gift is waiting/.test(buildPendingReminder([gifts[0]], 'manual', now).text), 'singular wording');

  const morning = easternDayAndHour(new Date('2026-10-28T13:05:00Z')); // 9:05 AM EDT
  check(morning.day === '2026-10-28' && morning.hour === 9, '9:05 AM Eastern detected (EDT)');
  const winter = easternDayAndHour(new Date('2026-12-07T13:30:00Z')); // 8:30 AM EST
  check(winter.day === '2026-12-07' && winter.hour === 8, 'standard time handled (EST)');
  const lateNight = easternDayAndHour(new Date('2026-10-29T03:30:00Z')); // 11:30 PM Oct 28 EDT
  check(lateNight.day === '2026-10-28' && lateNight.hour === 23, 'uses the Eastern calendar day');

  if (failed) {
    console.error(`\n${failed} reminder check(s) failed.`);
    process.exit(1);
  }
  console.log('\nPending reminder checks passed.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
