/**
 * server/tests/p2pAlert.test.ts
 *
 * Finance is emailed when a Zelle / Venmo / Cash App gift needs checking:
 * once when the giver taps "I've sent it", and when a text-to-give one starts.
 *
 * Run: npx tsx server/tests/p2pAlert.test.ts
 */

process.env.STAFF_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';
process.env.RESEND_API_KEY = '';
process.env.CASHAPP_RECIPIENT = '$awcgiveplus';
process.env.FINANCE_ALERT_EMAILS = 'finance@example.org, bad-address, Pastor@Example.org';
process.env.PUBLIC_APP_URL = 'https://awc-tithe.example.com/';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

async function main() {
  const alert = await import('../email/sendP2pGiftAlert');
  const { seedDefaultFund } = await import('../funds/store');
  const store = await import('../manualGifts/store');

  const sent = alert.buildP2pAlert(
    { memoCode: 'AWC-64GV', provider: 'cash_app', amount: 100, fundName: 'Tithes & Offerings', donorName: 'Sarah N.', isAnonymous: false, donorReference: '' },
    'marked_sent'
  );
  check('subject names method, giver, amount and memo', sent.subject === 'Check Cash App: Sarah N. says they sent $100.00 (AWC-64GV)', sent.subject);
  check('email links straight to Verify', sent.html.includes('https://awc-tithe.example.com/?staff=verify'), sent.html);
  check('explains it is not counted until verified', /isn't counted, receipted, or sent to DCB/.test(sent.text));

  const text = alert.buildP2pAlert(
    { memoCode: 'AWC-AB12', provider: 'zelle', amount: 25, fundName: 'Missions', donorName: 'Eve <b>M</b>', isAnonymous: true },
    'text_started'
  );
  check('text-to-give alert says they may not have paid yet', /started a \$25\.00 gift by text/.test(text.subject) && /may not have paid yet/.test(text.text));
  check('anonymous givers flagged', /anonymously/.test(text.text));
  check('names are escaped in HTML', !text.html.includes('<b>M</b>') && text.html.includes('&lt;b&gt;'));

  check('extra Finance emails parsed, bad ones dropped', JSON.stringify(alert.financeAlertExtraEmails()) === JSON.stringify(['finance@example.org', 'pastor@example.org']));
  const recipients = await alert.financeAlertRecipients();
  check('recipients include FINANCE_ALERT_EMAILS', recipients.includes('finance@example.org') && recipients.includes('pastor@example.org'), recipients);

  // Fires once on the first "I've sent it", not on repeats.
  await seedDefaultFund();
  store.__resetManualGiftsMemoryForTests();
  const logs: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  try {
    const created = await store.createManualGift({
      provider: 'cash_app', amount: 100, fundId: 'fund-tithes', donorName: 'Sarah N.', donorEmail: 'sarah@example.org', isAnonymous: false,
    });
    if (!created.ok) throw new Error('create failed');
    const { gift, claimToken } = created.value as any;
    const flush = () => new Promise((r) => setTimeout(r, 50));
    await flush();
    check('starting a gift on the website does not alert', !logs.some((l) => l.includes('p2p alert')), logs);
    await store.markManualGiftSubmitted({ id: gift.id, claimToken });
    await flush();
    await store.markManualGiftSubmitted({ id: gift.id, claimToken, donorReference: '#C123' });
    await flush();
    const alerts = logs.filter((l) => l.includes('p2p alert'));
    check('"I\'ve sent it" alerts Finance exactly once', alerts.length === 1, alerts);
    check('alert mentions the memo code', alerts[0]?.includes(gift.memoCode), alerts);
  } finally {
    console.info = orig;
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nFinance alert checks passed.');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
