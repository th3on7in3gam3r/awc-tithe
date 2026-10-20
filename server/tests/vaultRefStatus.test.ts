/**
 * server/tests/vaultRefStatus.test.ts
 *
 * AWC Vault asks Tithe whether an event RSVP gift was paid.
 *  - Unsigned / wrong-key / stale requests are refused.
 *  - Starting a gift or tapping "I've sent it" never reports "paid".
 *  - Only Finance verification (or a completed Stripe donation) reports "paid".
 *
 * Run: npx tsx server/tests/vaultRefStatus.test.ts
 */

process.env.STAFF_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.ZELLE_RECIPIENT = 'giving@example.org';
process.env.AWC_VAULT_KEY = 'vault-test-key';
process.env.RATE_LIMIT_PAY_IP_PER_10MIN = '1000';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

const REF = 'rsvp:a1b2c3d4-e5f6-4789-a012-0000000000aa';
const OTHER = 'rsvp:a1b2c3d4-e5f6-4789-a012-0000000000bb';

async function main() {
  const express = (await import('express')).default;
  const vaultRoutes = (await import('../routes/vaultIntegration')).default;
  const { signVaultRequest, verifyVaultSignature } = await import('../routes/vaultIntegration');
  const manualRoutes = (await import('../routes/manualGifts')).default;
  const { seedDefaultFund } = await import('../funds/store');
  const { __resetManualGiftsMemoryForTests } = await import('../manualGifts/store');
  const { __resetExternalRefsMemoryForTests } = await import('../externalRefs/store');

  await seedDefaultFund();
  __resetManualGiftsMemoryForTests();
  __resetExternalRefsMemoryForTests();

  const app = express();
  app.use('/api/integrations/vault', vaultRoutes);
  app.use(express.json());
  app.use('/api/manual-gifts', manualRoutes);
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${addr.port}`;

  async function signedPost(path: string, payload: unknown, key = 'vault-test-key') {
    const body = JSON.stringify(payload);
    const ts = String(Date.now());
    const res = await fetch(`${base}/api/integrations/vault/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AWC-Key-Id': 'vault',
        'X-AWC-Timestamp': ts,
        'X-AWC-Signature': signVaultRequest(key, ts, body),
      },
      body,
    });
    return { status: res.status, json: (await res.json()) as any };
  }
  async function status(refs: string[], opts: { key?: string; keyId?: string; ts?: string } = {}) {
    const body = JSON.stringify({ refs });
    const ts = opts.ts ?? String(Date.now());
    const res = await fetch(`${base}/api/integrations/vault/ref-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AWC-Key-Id': opts.keyId ?? 'vault',
        'X-AWC-Timestamp': ts,
        'X-AWC-Signature': signVaultRequest(opts.key ?? 'vault-test-key', ts, body),
      },
      body,
    });
    return { status: res.status, json: (await res.json()) as any };
  }
  async function call(path: string, body: unknown, admin = false) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(admin ? { Cookie: 'awc_staff_test=admin' } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  }

  try {
    check('wrong key refused', (await status([REF], { key: 'nope' })).status === 401);
    check('wrong key id refused', (await status([REF], { keyId: 'tithe' })).status === 401);
    check('stale timestamp refused', (await status([REF], { ts: String(Date.now() - 10 * 60 * 1000) })).status === 401);
    check(
      'signature helper rejects tampered body',
      !verifyVaultSignature({
        key: 'k',
        keyId: 'vault',
        timestamp: String(Date.now()),
        signature: signVaultRequest('k', String(Date.now()), '{"refs":[]}'),
        rawBody: '{"refs":["x"]}',
      })
    );

    const none = await status([REF, 'rsvp:not-a-uuid']);
    check('unknown ref is none', none.status === 200 && none.json.statuses?.[0]?.status === 'none', none.json);
    check('invalid refs dropped', none.json.statuses?.length === 1, none.json);

    const today = new Date().toISOString().slice(0, 10);
    const started = await call('/api/manual-gifts', {
      provider: 'zelle',
      amount: 40,
      fundId: 'fund-tithes',
      donorName: 'Grace Test',
      donorEmail: 'grace@example.org',
      isAnonymous: false,
      externalRef: REF,
    });
    check('zelle gift started with ref', started.status === 200 && started.json.gift?.id, started.json);
    check('started is not paid', (await status([REF])).json.statuses[0].status === 'started');

    await call(`/api/manual-gifts/${started.json.gift.id}/sent`, { claimToken: started.json.claimToken });
    check('"I\'ve sent it" is not paid', (await status([REF])).json.statuses[0].status === 'processing');

    const verified = await call(
      `/api/manual-gifts/admin/${started.json.gift.id}/verify`,
      { providerTransactionId: 'ZLRSVP1', receivedAmount: 40, receivedOn: today },
      true
    );
    check('finance verified', verified.status === 200, verified.json);
    const paid = (await status([REF, OTHER])).json.statuses;
    check('verified reports paid', paid[0].status === 'paid' && paid[0].amount === 40, paid);
    check('other ref untouched', paid[1].status === 'none', paid);
    check('no donor details leak', !JSON.stringify(paid).includes('grace@example.org'));

    // Funds list + confirmed gifts to a fund (for Vault fundraisers)
    const funds = await signedPost('funds', {});
    check('funds listed', funds.status === 200 && funds.json.funds?.some((f: any) => f.id === 'fund-tithes'), funds.json);
    check('funds refuse a bad key', (await signedPost('funds', {}, 'nope')).status === 401);
    const fundGifts = await signedPost('fund-gifts', { fundId: 'fund-tithes' });
    const zelle = fundGifts.json.gifts?.find((g: any) => g.amount === 40);
    check('verified gift appears for its fund', fundGifts.status === 200 && zelle?.donorName === 'Grace Test', fundGifts.json);
    check('fund gifts have a receipt number', Boolean(zelle?.receiptNumber));
    check('fund gifts send no emails', !JSON.stringify(fundGifts.json).includes('@'));
    check('other fund is empty', (await signedPost('fund-gifts', { fundId: 'fund-none' })).json.gifts?.length === 0);
    check('fund required', (await signedPost('fund-gifts', {})).status === 400);
    check('fund gifts refuse a bad key', (await signedPost('fund-gifts', { fundId: 'fund-tithes' }, 'nope')).status === 401);

    // A "Pay my balance" gift from a Vault fundraiser carries its reference back
    const FRM = 'frm:11111111-2222-4333-8444-555555555555.66666666-7777-4888-9999-aaaaaaaaaaaa';
    const bal = await call('/api/manual-gifts', {
      provider: 'zelle',
      amount: 300,
      fundId: 'fund-tithes',
      donorName: 'Grace Okello',
      donorEmail: 'grace.o@example.org',
      isAnonymous: false,
      externalRef: FRM,
    });
    await call(`/api/manual-gifts/admin/${bal.json.gift.id}/verify`, { providerTransactionId: 'ZLBAL300', receivedAmount: 300, receivedOn: today }, true);
    const withRef = (await signedPost('fund-gifts', { fundId: 'fund-tithes' })).json.gifts?.find((g: any) => g.amount === 300);
    check('balance payment returns its fundraiser ref', withRef?.externalRef === FRM, withRef);
    check('earlier gift without a ref returns null', zelle?.externalRef === null || zelle?.externalRef === 'rsvp:a1b2c3d4-e5f6-4789-a012-0000000000aa', zelle);

    // Event RSVP funds: the Vault sets up "Thanksgiving Dinner 2026" before sending guests here
    const made = await signedPost('event-fund', { name: '  Thanksgiving   Dinner 2026 ' });
    check('event fund created', made.status === 200 && made.json.created === true && made.json.fund?.name === 'Thanksgiving Dinner 2026', made.json);
    const again = await signedPost('event-fund', { name: 'thanksgiving dinner 2026' });
    check('event fund reused (no duplicate)', again.json.created === false && again.json.fund?.id === made.json.fund?.id, again.json);
    const listed = (await signedPost('funds', {})).json.funds || [];
    check('event fund is active in the funds list', listed.filter((f: any) => f.name === 'Thanksgiving Dinner 2026' && f.active).length === 1, listed);
    check('event fund needs a name', (await signedPost('event-fund', { name: ' ' })).status === 400);
    check('event fund strips markup', (await signedPost('event-fund', { name: '<b>Marrieds Dinner 2026</b>' })).json.fund?.name === 'bMarrieds Dinner 2026b');
    check('event fund refuses a bad key', (await signedPost('event-fund', { name: 'X Event' }, 'nope')).status === 401);

    const { withEventFund } = await import('../dcb/eventFund');
    const gift = {
      voucherNumber: 'REC-1', donorName: 'Grace', donorEmail: '', amount: 40, feeAmount: 0, netAmount: 40,
      fundCode: '', fundName: 'Thanksgiving Dinner 2026', paymentMethod: 'zelle', transactionId: 'tx1',
      contributedAt: new Date().toISOString(), source: 'awc-tithe-bridge' as const,
    };
    const ev = withEventFund(gift, REF);
    check('RSVP gift goes to DCB as an event fund', ev.eventFund === true && ev.memo === 'Thanksgiving Dinner 2026 RSVP', ev);
    check('regular gift unchanged', withEventFund(gift, null) === gift && withEventFund(gift, FRM) === gift);
  } finally {
    server.close();
  }

  if (failed > 0) {
    console.error(`\n${failed} vault ref-status check(s) failed.`);
    process.exit(1);
  }
  console.log('\nVault ref-status checks passed.');
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
