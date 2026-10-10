/**
 * Prove admin-only giving goal / offline gift endpoints return 403 for non-admin staff
 * and 401 when logged out.
 *
 * Run: npx tsx server/tests/adminGoalsAuth.test.ts
 */
process.env.STAFF_TEST_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';

async function main() {
  const express = (await import('express')).default;
  const fundsRoutes = (await import('../routes/funds')).default;
  const statementsRoutes = (await import('../routes/statements')).default;
  const staffRoutes = (await import('../routes/staff')).default;
  const giftsRoutes = (await import('../routes/gifts')).default;
  const auditRoutes = (await import('../routes/audit')).default;
  const { __resetStaffRoleMemoryForTests } = await import('../auth/staffRoles');
  const { __resetFundsMemoryForTests, seedDefaultFund } = await import('../funds/store');

  __resetStaffRoleMemoryForTests();
  __resetFundsMemoryForTests();
  await seedDefaultFund();

  const app = express();
  app.use(express.json());
  app.use('/api/funds', fundsRoutes);
  app.use('/api/statements', statementsRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/gifts', giftsRoutes);
  app.use('/api/audit', auditRoutes);

  let failed = 0;
  const year = new Date().getFullYear();
  const adminPaths = [
    `/api/funds/admin/goals?year=${year}`,
    `/api/funds/admin/offline-gifts?year=${year}`,
    `/api/funds/admin`,
  ];

  async function listenFetch(path: string, init?: RequestInit): Promise<Response> {
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

  function cookieFor(role: 'admin' | 'staff' | 'donor' | 'admin-unenrolled' | 'admin-mfa-pending' | 'deactivated'): string {
    return `awc_staff_test=${encodeURIComponent(role)}`;
  }

  for (const p of adminPaths) {
    const res = await listenFetch(p);
    if (res.status !== 401) {
      console.error(`FAIL logged-out ${p}: expected 401 got ${res.status}`);
      failed++;
    } else {
      console.log(`OK logged-out ${p} → 401`);
    }
  }

  for (const p of adminPaths) {
    const res = await listenFetch(p, { headers: { Cookie: cookieFor('staff') } });
    if (res.status !== 403) {
      console.error(`FAIL staff ${p}: expected 403 got ${res.status}`);
      failed++;
    } else {
      console.log(`OK staff ${p} → 403`);
    }
  }

  {
    const res = await listenFetch(`/api/funds/admin/goals?year=${year}`, {
      headers: { Cookie: cookieFor('admin') },
    });
    if (res.status !== 200) {
      console.error(`FAIL admin goals: expected 200 got ${res.status}`);
      failed++;
    } else {
      const body = (await res.json()) as { progress?: unknown[] };
      if (!Array.isArray(body.progress)) {
        console.error('FAIL admin goals: missing progress array');
        failed++;
      } else {
        console.log('OK admin goals → 200 with progress');
      }
    }
  }

  {
    const res = await listenFetch('/api/funds');
    const body = (await res.json()) as { funds: Array<Record<string, unknown>> };
    const leaked = body.funds.some(
      (f) =>
        'goalAmount' in f ||
        'totalReceived' in f ||
        'percent' in f ||
        'donorCount' in f ||
        'averageGift' in f
    );
    if (res.status !== 200 || leaked) {
      console.error('FAIL public /api/funds leaked goal/progress fields', body);
      failed++;
    } else {
      console.log('OK public /api/funds has no goal/progress fields');
    }
  }

  {
    const res = await listenFetch('/api/statements/year-end/send', {
      method: 'POST',
      headers: { Cookie: cookieFor('staff'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    });
    if (res.status !== 403) {
      console.error(`FAIL staff year-end send: expected 403 got ${res.status}`);
      failed++;
    } else {
      console.log('OK staff year-end send → 403');
    }
  }

  {
    const res = await listenFetch('/api/staff/me', { headers: { Cookie: cookieFor('donor') } });
    if (res.status !== 403) {
      console.error(`FAIL donor /api/staff/me: expected 403 got ${res.status}`);
      failed++;
    } else {
      console.log('OK donor /api/staff/me → 403');
    }
  }

  {
    const res = await listenFetch(`/api/funds/admin`, {
      headers: { Cookie: cookieFor('admin-mfa-pending') },
    });
    const body = (await res.json()) as { error?: string };
    if (res.status !== 403 || body.error !== 'TWO_FACTOR_VERIFICATION_REQUIRED') {
      console.error(`FAIL admin email-only MFA: expected 403 TWO_FACTOR_VERIFICATION_REQUIRED got ${res.status} ${body.error}`);
      failed++;
    } else {
      console.log('OK admin without session TOTP → 403 TWO_FACTOR_VERIFICATION_REQUIRED');
    }
  }

  {
    const res = await listenFetch(`/api/statements/year-end/preview?year=${year}`, {
      headers: { Cookie: cookieFor('admin-mfa-pending') },
    });
    const body = (await res.json()) as { error?: string };
    if (res.status !== 403 || body.error !== 'TWO_FACTOR_VERIFICATION_REQUIRED') {
      console.error(`FAIL preview without TOTP: expected 403 got ${res.status} ${body.error}`);
      failed++;
    } else {
      console.log('OK year-end preview without TOTP → 403');
    }
  }

  {
    const res = await listenFetch(`/api/funds/admin/goals?year=${year}`, {
      headers: { Cookie: cookieFor('admin-unenrolled') },
    });
    if (res.status !== 403) {
      console.error(`FAIL unenrolled admin goals: expected 403 got ${res.status}`);
      failed++;
    } else {
      console.log('OK admin without 2FA → 403');
    }
  }

  {
    const res = await listenFetch('/api/staff/me', { headers: { Cookie: cookieFor('deactivated') } });
    if (res.status !== 403) {
      console.error(`FAIL deactivated /api/staff/me: expected 403 got ${res.status}`);
      failed++;
    } else {
      console.log('OK deactivated staff → 403');
    }
  }

  {
    const res = await listenFetch('/api/funds/admin/offline-gifts', {
      method: 'POST',
      headers: { Cookie: cookieFor('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fundId: 'fund-tithes',
        amount: 40,
        giftDate: `${year}-01-15`,
        note: 'cash',
        donorEmail: 'offline-donor@example.com',
        donorName: 'Offline Donor',
      }),
    });
    if (res.status !== 201) {
      console.error(`FAIL offline gift create: expected 201 got ${res.status} ${await res.text()}`);
      failed++;
    } else {
      const gift = (await res.json()) as { gift?: { enteredBy?: string } };
      if (!gift.gift?.enteredBy?.includes('admin@example.com')) {
        console.error('FAIL offline gift must store real staff email', gift);
        failed++;
      } else {
        console.log('OK offline gift stores staff actor');
      }
    }
    const preview = await listenFetch(`/api/statements/year-end/preview?year=${year}`, {
      headers: { Cookie: cookieFor('admin') },
    });
    const { buildYearStatements } = await import('../statements/yearEnd');
    const statements = await buildYearStatements(year);
    const row = statements.find((s) => s.donorEmail === 'offline-donor@example.com');
    if (preview.status !== 200 || !row || row.total < 40) {
      console.error('FAIL year-end must include offline gift', preview.status, row, statements.length);
      failed++;
    } else {
      console.log('OK year-end includes offline gift');
    }
    const audit = await listenFetch('/api/audit', { headers: { Cookie: cookieFor('admin') } });
    const auditBody = (await audit.json()) as { entries?: Array<{ action: string; actorLabel: string }> };
    if (!auditBody.entries?.some((e) => e.action === 'OFFLINE_GIFT_RECORDED' && e.actorLabel.includes('admin@example.com'))) {
      console.error('FAIL audit missing OFFLINE_GIFT_RECORDED', auditBody);
      failed++;
    } else {
      console.log('OK offline gift audit entry');
    }
    const { listOfflineGiftsByEmail } = await import('../funds/store');
    const myGiving = await listOfflineGiftsByEmail('offline-donor@example.com');
    if (!myGiving.some((g) => g.amount === 40 && (g.enteredBy || '').includes('admin@example.com'))) {
      console.error('FAIL My Giving must include offline gift', myGiving);
      failed++;
    } else {
      console.log('OK My Giving includes linked offline gift');
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll admin-goals auth checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
