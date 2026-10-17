/**
 * server/tests/manualGifts.test.ts
 *
 * Zelle / Venmo / Cash App gifts: a donor can never complete a gift, only
 * Finance can, and one provider transaction ID can be used once.
 *
 * Run: npx tsx server/tests/manualGifts.test.ts
 */

process.env.STAFF_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-only-secret-not-used-in-production-000';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.ZELLE_RECIPIENT = 'giving@example.org';
process.env.VENMO_HANDLE = '@anointedworshipcenter';
process.env.CASHAPP_RECIPIENT = '508-454-3599';
process.env.RATE_LIMIT_PAY_IP_PER_10MIN = '1000';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`OK  ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

async function main() {
  const express = (await import('express')).default;
  const manualRoutes = (await import('../routes/manualGifts')).default;
  const { seedDefaultFund } = await import('../funds/store');
  const { getGiftByTransactionId } = await import('../gifts/store');
  const { listManualGiftsForDonor, __resetManualGiftsMemoryForTests, generateMemoCode, normalizeProviderReference } =
    await import('../manualGifts/store');
  const { publicPaymentOptions } = await import('../config');

  await seedDefaultFund();
  __resetManualGiftsMemoryForTests();

  const app = express();
  app.use(express.json());
  app.use('/api/manual-gifts', manualRoutes);
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${addr.port}`;

  const cookie = (role: 'admin' | 'staff') => `awc_staff_test=${role}`;
  async function call(path: string, body?: unknown, role?: 'admin' | 'staff', method = 'POST') {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(role ? { Cookie: cookie(role) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { status: res.status, json };
  }

  const today = new Date().toISOString().slice(0, 10);
  const donor = { donorName: 'Ruth Boaz', donorEmail: 'Ruth@Example.org', fundId: 'fund-tithes' };

  try {
    // --- helpers
    check('memo code format', /^AWC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(generateMemoCode()));
    check('reference normalised', normalizeProviderReference('  ab 12 cd ') === 'ab12cd');
    check('reference too short rejected', normalizeProviderReference('a1') === null);
    check('reference with markup rejected', normalizeProviderReference('<script>') === null);
    const opts = publicPaymentOptions();
    check('venmo handle strips @', opts.venmo.handle === 'anointedworshipcenter' && opts.venmo.enabled);
    check('zelle enabled from env', opts.zelle.enabled && opts.zelle.recipient === 'giving@example.org');
    check('cash app enabled from env', opts.cashApp.enabled && opts.cashApp.recipient === '508-454-3599');
    check('phone number is not treated as a $cashtag link', opts.cashApp.cashtag === null);
    {
      const { env } = await import('../config');
      const saved = env.cashAppRecipient;
      env.cashAppRecipient = '$awcgiveplus';
      env.cashAppRecipientName = 'Anointed Worship Center';
      const tagged = publicPaymentOptions().cashApp;
      check('$cashtag enables the Open Cash App link', tagged.cashtag === '$awcgiveplus', tagged);
      check('Cash App account name is passed to donors', tagged.recipientName === 'Anointed Worship Center', tagged);
      env.cashAppRecipient = saved;
      env.cashAppRecipientName = '';
    }

    // --- donor create
    const bad = await call('/api/manual-gifts', { ...donor, provider: 'paypal', amount: 50 });
    check('unknown provider rejected', bad.status === 400, bad);
    const tooLow = await call('/api/manual-gifts', { ...donor, provider: 'zelle', amount: 1 });
    check('below minimum rejected', tooLow.status === 400, tooLow);
    const noEmail = await call('/api/manual-gifts', { ...donor, donorEmail: 'nope', provider: 'zelle', amount: 50 });
    check('email required', noEmail.status === 400 && noEmail.json.error === 'EMAIL_REQUIRED', noEmail);

    const created = await call('/api/manual-gifts', { ...donor, provider: 'zelle', amount: 100, status: 'verified' });
    check('donor can start a Zelle gift', created.status === 200 && created.json.gift?.memoCode, created);
    check('new gift is initiated, not verified', created.json.gift?.status === 'initiated', created.json);
    const giftId: string = created.json.gift.id;
    const cashGift = await call('/api/manual-gifts', { ...donor, provider: 'cash_app', amount: 20 });
    check('donor can start a Cash App gift', cashGift.status === 200 && cashGift.json.gift?.provider === 'cash_app', cashGift);

    const token: string = created.json.claimToken;

    // --- donor "I've sent it"
    const wrongToken = await call(`/api/manual-gifts/${giftId}/sent`, { claimToken: 'x'.repeat(32) });
    check('wrong claim token → 404', wrongToken.status === 404, wrongToken);
    const sent = await call(`/api/manual-gifts/${giftId}/sent`, { claimToken: token, donorReference: 'ZL12345', status: 'verified' });
    check('"I sent it" → submitted only', sent.status === 200 && sent.json.gift?.status === 'submitted', sent);
    check('no donation exists before Finance verifies', !(await getGiftByTransactionId('zelle_ZL12345')));
    const donorList = await listManualGiftsForDonor('ruth@example.org');
    check('donor history shows the pending gift', donorList.length === 1 && donorList[0].status === 'submitted', donorList);
    const { emailHasPriorGifts } = await import('../gifts/privacy');
    check('Zelle-only donor can get a My giving sign-in code', await emailHasPriorGifts('RUTH@example.org'));
    check('unknown email still gets no code', !(await emailHasPriorGifts('stranger@example.org')));

    // --- access control
    const anonList = await call('/api/manual-gifts/admin', undefined, undefined, 'GET');
    check('anonymous cannot list', anonList.status === 401 || anonList.status === 403, anonList.status);
    const staffList = await call('/api/manual-gifts/admin', undefined, 'staff', 'GET');
    check('staff can list open gifts', staffList.status === 200 && staffList.json.gifts?.length === 2, staffList);
    check('admin list masks email', !String(staffList.json.gifts?.[0]?.donorEmailMasked).includes('ruth@'), staffList.json);
    const staffVerify = await call(`/api/manual-gifts/admin/${giftId}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 100, receivedOn: today }, 'staff');
    check('non-admin staff cannot verify', staffVerify.status === 403, staffVerify);
    const anonVerify = await call(`/api/manual-gifts/admin/${giftId}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 100, receivedOn: today });
    check('anonymous cannot verify', anonVerify.status === 401 || anonVerify.status === 403, anonVerify.status);

    // --- verification input checks
    const noRef = await call(`/api/manual-gifts/admin/${giftId}/verify`, { receivedAmount: 100, receivedOn: today }, 'admin');
    check('verify needs a transaction ID', noRef.status === 400 && noRef.json.error === 'REFERENCE_REQUIRED', noRef);
    const future = await call(`/api/manual-gifts/admin/${giftId}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 100, receivedOn: '2999-01-01' }, 'admin');
    check('verify rejects a future date', future.status === 400 && future.json.error === 'INVALID_DATE', future);

    // --- verify
    const ok = await call(`/api/manual-gifts/admin/${giftId}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 95, receivedOn: today }, 'admin');
    check('admin verifies', ok.status === 200 && ok.json.gift?.status === 'verified', ok);
    const donation = await getGiftByTransactionId('zelle_ZL999');
    check('verified → completed donation', donation?.status === 'completed', donation);
    check('donation uses amount actually received', donation?.amount === 95, donation?.amount);
    check('donation records Zelle as the method', donation?.paymentMethod === 'zelle', donation?.paymentMethod);
    check('verified gift leaves donor pending list', (await listManualGiftsForDonor('ruth@example.org')).length === 0);

    const again = await call(`/api/manual-gifts/admin/${giftId}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 95, receivedOn: today }, 'admin');
    check('cannot verify twice', again.status === 409 && again.json.error === 'ALREADY_VERIFIED', again);

    // --- duplicate reference on a different gift (case-insensitive)
    const second = await call('/api/manual-gifts', { ...donor, provider: 'zelle', amount: 40 });
    const dup = await call(`/api/manual-gifts/admin/${second.json.gift.id}/verify`, { providerTransactionId: 'zl999', receivedAmount: 40, receivedOn: today }, 'admin');
    check('same Zelle ID cannot be used twice', dup.status === 409 && dup.json.error === 'DUPLICATE_REFERENCE', dup);

    // Same ID on a different provider is a different payment
    const venmo = await call('/api/manual-gifts', { ...donor, provider: 'venmo', amount: 40 });
    const venmoOk = await call(`/api/manual-gifts/admin/${venmo.json.gift.id}/verify`, { providerTransactionId: 'ZL999', receivedAmount: 40, receivedOn: today }, 'admin');
    check('same ID on another provider is allowed', venmoOk.status === 200, venmoOk);

    // --- reject
    const noReason = await call(`/api/manual-gifts/admin/${second.json.gift.id}/reject`, { reason: '' }, 'admin');
    check('reject needs a reason', noReason.status === 400, noReason);
    const rejected = await call(`/api/manual-gifts/admin/${second.json.gift.id}/reject`, { reason: 'No matching payment after 7 days' }, 'admin');
    check('admin rejects', rejected.status === 200 && rejected.json.gift?.status === 'rejected', rejected);
    const verifyRejected = await call(`/api/manual-gifts/admin/${second.json.gift.id}/verify`, { providerTransactionId: 'ZL777', receivedAmount: 40, receivedOn: today }, 'admin');
    check('rejected gift cannot be verified', verifyRejected.status === 409, verifyRejected);
    const rejectVerified = await call(`/api/manual-gifts/admin/${giftId}/reject`, { reason: 'mistake here' }, 'admin');
    check('verified gift cannot be rejected', rejectVerified.status === 409, rejectVerified);

    // --- Finance records a payment that skipped the site
    const recorded = await call('/api/manual-gifts/admin/record', {
      provider: 'cash_app', fundId: 'fund-tithes', donorName: 'Lydia', donorEmail: 'lydia@example.org',
      providerTransactionId: '#D-ABC123', receivedAmount: 25, receivedOn: today,
    }, 'admin');
    check('record a Cash App payment', recorded.status === 200 && recorded.json.gift?.status === 'verified', recorded);
    const recordedDup = await call('/api/manual-gifts/admin/record', {
      provider: 'cash_app', fundId: 'fund-tithes', donorName: 'Lydia', donorEmail: 'lydia@example.org',
      providerTransactionId: '#d-abc123', receivedAmount: 25, receivedOn: today,
    }, 'admin');
    check('recording the same payment twice is refused', recordedDup.status === 409, recordedDup);
    const open = await call('/api/manual-gifts/admin?filter=all', undefined, 'admin', 'GET');
    const lydia = (open.json.gifts || []).filter((g: { donorName: string }) => g.donorName === 'Lydia');
    check('refused duplicate leaves no orphan row', lydia.length === 1, lydia);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }

  if (failed > 0) {
    console.error(`\n${failed} manual gift check(s) failed.`);
    process.exit(1);
  }
  console.log('\nManual gift (Zelle/Venmo/Cash App) checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
