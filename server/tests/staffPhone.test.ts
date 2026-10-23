/**
 * Staff Portal sign-in codes by text: enrolling a number (signed in), signing
 * in by text through the real Staff Portal email-code sign-in, and the guards.
 *
 * Run: npx tsx server/tests/staffPhone.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.STAFF_TEST_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.BETTER_AUTH_SECRET = 'staff-phone-test-secret-at-least-32-characters';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_AUTH_TOKEN = 'test_token';
process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
process.env.RATE_LIMIT_SMS_PHONE_PER_HOUR = '5';
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
  const { setVerifyFetchForTests } = await import('../sms/verify');
  const sent: string[] = [];
  const pending = new Set<string>();
  setVerifyFetchForTests((async (url: string | URL | Request, init?: RequestInit) => {
    const form = new URLSearchParams(String(init?.body || ''));
    const to = form.get('To') || '';
    if (String(url).endsWith('/Verifications')) {
      sent.push(to);
      pending.add(to);
      return new Response(JSON.stringify({ status: 'pending' }), { status: 201 });
    }
    if (!pending.has(to)) return new Response('{}', { status: 404 });
    if (form.get('Code') !== '123456') return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    pending.delete(to);
    return new Response(JSON.stringify({ status: 'approved' }), { status: 200 });
  }) as typeof fetch);

  const express = (await import('express')).default;
  const { default: staffPhoneRoutes } = await import('../routes/staffPhone');
  const { staffAuth } = await import('../auth/staffAuth');
  const roles = await import('../auth/staffRoles');

  const app = express();
  app.use(express.json());
  app.use('/api/staff-phone', staffPhoneRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api/staff-phone`;

  async function call(path: string, body?: unknown, identity?: string) {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3000',
        ...(identity ? { Cookie: `awc_staff_test=${identity}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any>, cookies };
  }

  const PHONE = '+15085556666';
  try {
    // --- Adding a number (signed in) -------------------------------------------
    check('needs a staff sign-in', (await call('/me')).status === 401);
    check('admin must finish the authenticator step first', (await call('/me', undefined, 'admin-mfa-pending')).status === 403);
    const me = await call('/me', undefined, 'staff');
    check('staff sees text codes available, no number yet', me.json.enabled === true && me.json.phone === null, me.json);

    const start = await call('/link/start', { phone: '(508) 555-6666' }, 'staff');
    check('code texted to the new number', start.status === 200 && sent.at(-1) === PHONE, start.json);
    check('wrong code does not save it', (await call('/link/confirm', { code: '000000' }, 'staff')).status === 401);
    const confirm = await call('/link/confirm', { code: '123456' }, 'staff');
    check('right code saves it', confirm.status === 200 && confirm.json.phone === '(•••) •••-6666', confirm.json);
    check('number shows masked', (await call('/me', undefined, 'staff')).json.phone === '(•••) •••-6666');
    const taken = await call('/link/start', { phone: PHONE }, 'admin');
    check('another staff account cannot use the same number', taken.status === 409, taken.json);
    check('toll-free / bad numbers refused', (await call('/link/start', { phone: '855-297-1920' }, 'staff')).status === 400);

    // --- Signing in by text ------------------------------------------------------
    // staff@example.com becomes sign-in eligible through a pending invite.
    await roles.createStaffInvite({ email: 'staff@example.com', role: 'staff', invitedBy: null, ipAddress: '127.0.0.1', actorLabel: 'test' });

    const n = sent.length;
    const unknown = await call('/request-code', { email: 'nobody@example.com' });
    check('unknown email → same answer, no text', unknown.status === 200 && unknown.json.ok && sent.length === n, unknown.json);
    const req = await call('/request-code', { email: 'Staff@Example.com' });
    check('staff email → code texted to their number', req.status === 200 && sent.length === n + 1 && sent.at(-1) === PHONE, req.json);

    check('wrong code → no sign-in', (await call('/verify', { email: 'staff@example.com', code: '999999' })).status === 401);
    const ok = await call('/verify', { email: 'staff@example.com', code: '123456' });
    check('right code → signed in', ok.status === 200 && ok.cookies.some((c) => c.startsWith('awc-staff')), { status: ok.status, json: ok.json, cookies: ok.cookies });
    const cookieHeader = ok.cookies.map((c) => c.split(';')[0]).join('; ');
    const session = await staffAuth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) });
    check('session belongs to that staff email', session?.user?.email === 'staff@example.com', session?.user);
    check('code works once', (await call('/verify', { email: 'staff@example.com', code: '123456' })).status === 401);
    check('a number confirmed for one email cannot sign in another', (await call('/verify', { email: 'nobody@example.com', code: '123456' })).status === 401);

    // --- Turning it off ------------------------------------------------------------
    check('turn off', (await call('/remove', {}, 'staff')).status === 200);
    const m = sent.length;
    await call('/request-code', { email: 'staff@example.com' });
    check('after turning off, no text is sent', sent.length === m);
  } finally {
    server.close();
    setVerifyFetchForTests(null);
  }

  if (failed > 0) {
    console.error(`\n${failed} staff text-code check(s) failed.`);
    process.exit(1);
  }
  console.log('\nStaff Portal text-code checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
