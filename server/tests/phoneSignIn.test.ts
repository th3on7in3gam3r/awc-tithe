/**
 * My Giving phone sign-in: link a phone while signed in, sign in by texted
 * code, anti-enumeration, blocked plugin routes, rate limits — against a fake
 * Twilio Verify.
 *
 * Run: npx tsx server/tests/phoneSignIn.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = 'phone-sign-in-test-secret-at-least-32-characters';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_AUTH_TOKEN = 'test_token';
process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
process.env.RATE_LIMIT_SMS_PHONE_PER_HOUR = '3';
process.env.RATE_LIMIT_SMS_IP_PER_HOUR = '50';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

async function main() {
  const verify = await import('../sms/verify');
  const { normalizeUsPhone, maskE164, setVerifyFetchForTests } = verify;

  // --- Phone number rules ---------------------------------------------------
  check('formats a US number', normalizeUsPhone('(508) 555-1234') === '+15085551234');
  check('accepts leading 1', normalizeUsPhone('1-617-555-0199') === '+16175550199');
  check('accepts E.164', normalizeUsPhone('+15085551234') === '+15085551234');
  check('rejects short', normalizeUsPhone('555-1234') === null);
  check('rejects international', normalizeUsPhone('+447911123456') === null);
  check('rejects toll-free', normalizeUsPhone('855-297-1920') === null);
  check('rejects premium 900', normalizeUsPhone('900-555-1234') === null);
  check('rejects bad area code', normalizeUsPhone('108-555-1234') === null);
  check('rejects N11', normalizeUsPhone('411-555-1234') === null);
  check('mask', maskE164('+15085551234') === '(•••) •••-1234');

  // --- Fake Twilio Verify -----------------------------------------------------
  const sent: string[] = [];
  const pending = new Set<string>();
  setVerifyFetchForTests((async (url: string | URL | Request, init?: RequestInit) => {
    const form = new URLSearchParams(String(init?.body || ''));
    const to = form.get('To') || '';
    const auth = String((init?.headers as Record<string, string>)?.Authorization || '');
    if (auth !== `Basic ${Buffer.from('ACtest:test_token').toString('base64')}`) {
      return new Response(JSON.stringify({ code: 20003 }), { status: 401 });
    }
    if (String(url).endsWith('/Services/VAtest/Verifications')) {
      sent.push(to);
      pending.add(to);
      return new Response(JSON.stringify({ status: 'pending' }), { status: 201 });
    }
    if (String(url).endsWith('/Services/VAtest/VerificationCheck')) {
      if (!pending.has(to)) return new Response(JSON.stringify({ code: 20404 }), { status: 404 });
      if (form.get('Code') !== '123456') return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      pending.delete(to);
      return new Response(JSON.stringify({ status: 'approved' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch);

  // --- App (same mounting order as server/index.ts) ---------------------------
  const express = (await import('express')).default;
  const { toNodeHandler } = await import('better-auth/node');
  const { auth } = await import('../auth/betterAuth');
  const { phoneRouteGuard } = await import('../auth/phoneRouteGuard');
  const donorRoutes = (await import('../routes/donor')).default;

  const app = express();
  app.use('/api/auth', phoneRouteGuard);
  const authHandler = toNodeHandler(auth);
  app.all('/api/auth', authHandler);
  app.all('/api/auth/*', authHandler);
  app.use(express.json());
  app.use('/api/donor', donorRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no server');
  const base = `http://127.0.0.1:${address.port}`;
  const origin = { Origin: 'http://127.0.0.1:3000' };

  async function post(path: string, body: unknown, cookie?: string) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...origin, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, json, cookie: cookieFrom(res) };
  }
  async function get(path: string, cookie?: string) {
    const res = await fetch(`${base}${path}`, { headers: { ...origin, ...(cookie ? { Cookie: cookie } : {}) } });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }
  function cookieFrom(res: Response): string {
    const raw = res.headers.getSetCookie?.() || [];
    return raw.map((c) => c.split(';')[0]).join('; ');
  }

  async function emailSignIn(email: string): Promise<string> {
    const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
    const res = await post('/api/auth/sign-in/email-otp', { email, otp });
    if (res.status !== 200 || !res.cookie) throw new Error(`email sign-in failed ${res.status} ${JSON.stringify(res.json)}`);
    return res.cookie;
  }

  const PHONE = '+15085551234';
  try {
    const status = await get('/api/donor/phone');
    check('phone sign-in enabled', status.json.enabled === true, status.json);
    check('signed out → no linked phone', status.json.linkedPhone === null, status.json);

    // Plugin routes that could send texts or bypass our limits are closed
    check('plugin send-otp blocked', (await post('/api/auth/phone-number/send-otp', { phoneNumber: PHONE })).status === 404);
    check('plugin password sign-in blocked', (await post('/api/auth/sign-in/phone-number', { phoneNumber: PHONE, password: 'x' })).status === 404);
    check('plugin reset blocked', (await post('/api/auth/phone-number/request-password-reset', { phoneNumber: PHONE })).status === 404);

    // Unknown phone: same answer, but no text is sent (no cost, no enumeration)
    const unknown = await post('/api/donor/phone/request-code', { phone: '508-555-1234', purpose: 'sign-in' });
    check('unknown phone → uniform 200', unknown.status === 200 && unknown.json.ok === true, unknown);
    check('unknown phone → no text sent', sent.length === 0, sent);
    check('invalid phone → 400', (await post('/api/donor/phone/request-code', { phone: '12345' })).status === 400);
    const unknownVerify = await post('/api/auth/phone-number/verify', { phoneNumber: PHONE, code: '123456' });
    check('unknown phone cannot sign in', unknownVerify.status !== 200 || !unknownVerify.cookie, unknownVerify);

    // Link requires sign-in
    check('link needs sign-in', (await post('/api/donor/phone/request-code', { phone: PHONE, purpose: 'link' })).status === 401);

    const cookie = await emailSignIn('member@example.com');
    const link = await post('/api/donor/phone/request-code', { phone: '(508) 555-1234', purpose: 'link' }, cookie);
    check('link → code sent', link.status === 200 && sent.at(-1) === PHONE, { link, sent });

    const wrong = await post('/api/auth/phone-number/verify', { phoneNumber: PHONE, code: '000000', updatePhoneNumber: true, disableSession: true }, cookie);
    check('wrong code rejected', wrong.status >= 400, wrong);
    const linked = await post('/api/auth/phone-number/verify', { phoneNumber: PHONE, code: '123456', updatePhoneNumber: true, disableSession: true }, cookie);
    check('right code links phone', linked.status === 200 && linked.json.status === true, linked);

    const after = await get('/api/donor/phone', cookie);
    check('linked phone shown masked', after.json.linkedPhone === '(•••) •••-1234', after.json);

    // Another account cannot take the same phone
    const other = await emailSignIn('other@example.com');
    const taken = await post('/api/donor/phone/request-code', { phone: PHONE, purpose: 'link' }, other);
    check('phone in use → 409', taken.status === 409, taken);

    // Sign in by text while signed out
    const before = sent.length;
    const req = await post('/api/donor/phone/request-code', { phone: '508.555.1234', purpose: 'sign-in' });
    check('linked phone → code sent', req.status === 200 && sent.length === before + 1, { req, sent });
    const signIn = await post('/api/auth/phone-number/verify', { phoneNumber: PHONE, code: '123456' });
    check('text code signs in', signIn.status === 200 && Boolean(signIn.cookie), signIn);
    const me = await get('/api/donor/me', signIn.cookie);
    check('signed in as the linked email', (me.json.user as { email?: string })?.email === 'member@example.com', me.json);
    const replay = await post('/api/auth/phone-number/verify', { phoneNumber: PHONE, code: '123456' });
    check('code cannot be reused', replay.status >= 400 || !replay.cookie, replay);
    const badFormat = await post('/api/auth/phone-number/verify', { phoneNumber: '5085551234', code: '123456' });
    check('non-E.164 phone rejected', badFormat.status >= 400, badFormat);

    // Per-phone hourly limit (3): the unknown-phone try, link and sign-in used all 3
    const n = sent.length;
    const limited = await post('/api/donor/phone/request-code', { phone: PHONE, purpose: 'sign-in' });
    check('fourth request in an hour sends nothing', sent.length === n, sent);
    const linkLimited = await post('/api/donor/phone/request-code', { phone: PHONE, purpose: 'link' }, cookie);
    check('rate-limited link → 429', linkLimited.status === 429, linkLimited);
    check('held back still looks the same', limited.status === 200 && limited.json.ok === true, limited);

    // Turn off text sign-in
    check('remove phone', (await post('/api/donor/phone/remove', {}, cookie)).status === 200);
    const removed = await get('/api/donor/phone', cookie);
    check('phone removed', removed.json.linkedPhone === null, removed.json);
    check('remove needs sign-in', (await post('/api/donor/phone/remove', {})).status === 401);
  } finally {
    server.close();
    setVerifyFetchForTests(null);
  }

  if (failed > 0) {
    console.error(`\n${failed} phone sign-in check(s) failed.`);
    process.exit(1);
  }
  console.log('\nPhone sign-in checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
