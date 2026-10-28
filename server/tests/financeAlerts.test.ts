/**
 * Finance email list: admin only, add/remove, and alerts reach the people on it.
 * Run: npx tsx server/tests/financeAlerts.test.ts
 */
process.env.STAFF_TEST_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.FINANCE_ALERT_EMAILS = '';

async function main() {
  const express = (await import('express')).default;
  const routes = (await import('../routes/financeAlerts')).default;
  const { __resetStaffRoleMemoryForTests } = await import('../auth/staffRoles');
  const { __resetFinanceAlertsForTests } = await import('../financeAlerts/store');
  const { financeAlertRecipients } = await import('../email/sendP2pGiftAlert');
  __resetStaffRoleMemoryForTests();
  __resetFinanceAlertsForTests();

  const app = express();
  app.use(express.json());
  app.use('/api/finance-alerts', routes);

  let failed = 0;
  const check = (c: boolean, m: string) => (c ? console.log(`OK ${m}`) : (console.error(`FAIL ${m}`), failed++));
  async function call(path: string, init?: RequestInit) {
    const server = await new Promise<import('http').Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    try {
      return await fetch(`http://127.0.0.1:${addr.port}${path}`, init);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
  const as = (role: string) => ({ Cookie: `awc_staff_test=${encodeURIComponent(role)}`, 'Content-Type': 'application/json' });

  check((await call('/api/finance-alerts')).status === 401, 'logged out → 401');
  check((await call('/api/finance-alerts', { headers: as('staff') })).status === 403, 'staff → 403');
  check(
    (await call('/api/finance-alerts', { method: 'POST', headers: as('staff'), body: JSON.stringify({ email: 'x@y.com' }) }))
      .status === 403,
    'staff cannot add → 403'
  );
  check(
    (await call('/api/finance-alerts', { method: 'POST', headers: as('admin'), body: JSON.stringify({ email: 'nope' }) }))
      .status === 400,
    'bad email → 400'
  );
  const add = await call('/api/finance-alerts', {
    method: 'POST',
    headers: as('admin'),
    body: JSON.stringify({ email: ' FirstLady@Example.com ', name: 'First Lady' }),
  });
  check(add.status === 201, 'admin adds → 201');
  const list = (await (await call('/api/finance-alerts', { headers: as('admin') })).json()) as {
    recipients: Array<{ email: string; name: string }>;
  };
  check(list.recipients.some((r) => r.email === 'firstlady@example.com' && r.name === 'First Lady'), 'listed, lowercased');
  check((await financeAlertRecipients()).includes('firstlady@example.com'), 'alerts go to the added person');

  check(
    (await call('/api/finance-alerts/firstlady%40example.com', { method: 'DELETE', headers: as('admin') })).status === 200,
    'admin removes → 200'
  );
  check(!(await financeAlertRecipients()).includes('firstlady@example.com'), 'removed person no longer gets alerts');

  if (failed) {
    console.error(`\n${failed} finance email check(s) failed.`);
    process.exit(1);
  }
  console.log('\nFinance email list checks passed.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
