/**
 * Funds tab: delete only empty funds, never Tithes & Offerings, admin only.
 *
 * Run: npx tsx server/tests/fundDelete.test.ts
 */
process.env.STAFF_TEST_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';

async function main() {
  const express = (await import('express')).default;
  const fundsRoutes = (await import('../routes/funds')).default;
  const { __resetStaffRoleMemoryForTests } = await import('../auth/staffRoles');
  const { __resetFundsMemoryForTests, __addMemoryCompletedGiftForTests, seedDefaultFund, createFund, listAllFunds } =
    await import('../funds/store');

  __resetStaffRoleMemoryForTests();
  __resetFundsMemoryForTests();
  await seedDefaultFund();
  const empty = await createFund({ name: 'Empty Event Fund', isEvent: true });
  const used = await createFund({ name: 'Used Fund' });
  __addMemoryCompletedGiftForTests({ fundId: used.id, amount: 25, year: new Date().getFullYear() });

  const app = express();
  app.use(express.json());
  app.use('/api/funds', fundsRoutes);

  let failed = 0;
  const check = (cond: boolean, msg: string) => {
    if (cond) console.log(`OK ${msg}`);
    else {
      console.error(`FAIL ${msg}`);
      failed++;
    }
  };
  async function call(path: string, init?: RequestInit): Promise<Response> {
    const server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    try {
      return await fetch(`http://127.0.0.1:${addr.port}${path}`, init);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
  const as = (role: string) => ({ Cookie: `awc_staff_test=${encodeURIComponent(role)}` });

  check((await call(`/api/funds/admin/${empty.id}`, { method: 'DELETE' })).status === 401, 'logged out → 401');
  check(
    (await call(`/api/funds/admin/${empty.id}`, { method: 'DELETE', headers: as('staff') })).status === 403,
    'staff (not admin) → 403'
  );

  const list = await call('/api/funds/admin', { headers: as('admin') });
  const body = (await list.json()) as { funds: Array<{ id: string; usage?: { total: number } }> };
  check(body.funds.find((f) => f.id === used.id)?.usage?.total === 1, 'admin list shows usage for used fund');
  check(body.funds.find((f) => f.id === empty.id)?.usage?.total === 0, 'admin list shows 0 usage for empty fund');

  const tithes = await call('/api/funds/admin/fund-tithes', { method: 'DELETE', headers: as('admin') });
  check(tithes.status === 409, 'Tithes & Offerings cannot be deleted → 409');

  const inUse = await call(`/api/funds/admin/${used.id}`, { method: 'DELETE', headers: as('admin') });
  check(inUse.status === 409, 'fund with gifts cannot be deleted → 409');

  const ok = await call(`/api/funds/admin/${empty.id}`, { method: 'DELETE', headers: as('admin') });
  check(ok.status === 200, 'empty fund deleted → 200');

  const after = (await listAllFunds()).map((f) => f.id);
  check(!after.includes(empty.id), 'empty fund is gone');
  check(after.includes(used.id) && after.includes('fund-tithes'), 'other funds kept');

  const missing = await call(`/api/funds/admin/${empty.id}`, { method: 'DELETE', headers: as('admin') });
  check(missing.status === 404, 'deleting again → 404');

  if (failed) {
    console.error(`\n${failed} fund delete check(s) failed.`);
    process.exit(1);
  }
  console.log('\nFund delete checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
