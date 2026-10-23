/**
 * Staff Portal sign-in codes by text (Twilio Verify).
 *
 * Signed out:
 *   POST /api/staff-phone/request-code { email }       texts a code to that staff
 *        member's confirmed number; same answer whether or not one exists
 *   POST /api/staff-phone/verify       { email, code } Twilio approves → the normal
 *        Staff Portal email-code sign-in runs on the server (same session, same
 *        authenticator step afterwards for admins who use one)
 *
 * Signed in (and past the authenticator step, when on):
 *   GET  /api/staff-phone/me
 *   POST /api/staff-phone/link/start   { phone }   texts a confirmation code
 *   POST /api/staff-phone/link/confirm { code }    saves the number
 *   POST /api/staff-phone/remove
 */
import { Router, type Request, type Response } from 'express';
import { staffAuth } from '../auth/staffAuth';
import { emailEligibleForStaffOtp } from '../auth/staffRoles';
import { getStaffSessionOrNull, requireStaffSession } from '../auth/staffGate';
import * as phones from '../auth/staffPhone';
import { checkRateLimit, clientIp, sha256Hex } from '../middleware/rateLimit';
import { env } from '../config';
import { checkPhoneCode, maskE164, normalizeUsPhone, phoneSignInEnabled, sendPhoneCode } from '../sms/verify';
import { writeActivityAudit } from '../audit/activity';

const router = Router();
const HOUR = 60 * 60 * 1000;
const perPerson = { windowMs: HOUR, max: env.rateLimitSmsPhonePerHour };
const perIp = { windowMs: HOUR, max: env.rateLimitSmsIpPerHour };
const perDay = { windowMs: 24 * HOUR, max: env.smsCodeDailyCap };

const UNIFORM = {
  ok: true,
  message: 'If your staff account has a mobile number for codes, a 6-digit code is on its way by text.',
};

function cleanEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().slice(0, 200);
}

/** Room for one more text, or false (per person, per device, church-wide per day). */
async function textAllowed(key: string, req: Request): Promise<boolean> {
  const [a, b] = await Promise.all([
    checkRateLimit(`sms:staff:${sha256Hex(key)}`, perPerson),
    checkRateLimit(`sms:ip:${clientIp(req)}`, perIp),
  ]);
  if (!a.allowed || !b.allowed) return false;
  return (await checkRateLimit('sms:day:all', perDay)).allowed;
}

// ---- signed out: sign in by text ------------------------------------------

router.post('/request-code', async (req: Request, res: Response) => {
  if (!phoneSignInEnabled()) return res.status(503).json({ ok: false, message: 'Text codes are not available right now.' });
  const email = cleanEmail(req.body?.email);
  const started = Date.now();
  try {
    if (email.includes('@') && (await emailEligibleForStaffOtp(email))) {
      const row = await phones.getVerifiedPhoneForEmail(email);
      if (row && (await textAllowed(email, req))) await sendPhoneCode(row.phone);
    }
  } catch (err) {
    console.warn('[staff-phone] request-code', err instanceof Error ? err.message : err);
  }
  const elapsed = Date.now() - started;
  if (elapsed < 150) await new Promise((r) => setTimeout(r, 150 - elapsed));
  return res.json(UNIFORM);
});

router.post('/verify', async (req: Request, res: Response) => {
  if (!phoneSignInEnabled()) return res.status(503).json({ ok: false, message: 'Text codes are not available right now.' });
  const email = cleanEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  const bad = () => res.status(401).json({ ok: false, message: 'That code did not work. Check it, or request a new one.' });
  if (!email.includes('@') || code.length !== 6) return bad();
  const tries = await checkRateLimit(`staff-sms-verify:${sha256Hex(email)}`, { windowMs: HOUR, max: 10 });
  if (!tries.allowed) return res.status(429).json({ ok: false, message: 'Too many tries. Wait an hour, or use your email code.' });

  if (!(await emailEligibleForStaffOtp(email))) return bad();
  const row = await phones.getVerifiedPhoneForEmail(email);
  if (!row || !(await checkPhoneCode(row.phone, code))) return bad();

  try {
    // Twilio approved the text code → run the same email-code sign-in the portal
    // uses (server-issued code), so sessions and the authenticator step behave
    // exactly as with an emailed code.
    const otp = await staffAuth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
    const response = await staffAuth.api.signInEmailOTP({
      body: { email, otp },
      headers: new Headers({ 'user-agent': String(req.headers['user-agent'] || '') }),
      asResponse: true,
    });
    const cookies =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
      (response.headers.get('set-cookie') ? [response.headers.get('set-cookie') as string] : []);
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    const body = await response.json().catch(() => ({}));
    return res.status(response.status).json(body);
  } catch (err) {
    console.error('[staff-phone] sign-in failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ ok: false, message: 'Could not sign you in. Please use your email code.' });
  }
});

// ---- signed in: add / remove your number ------------------------------------

function requireFullySignedIn(req: Request, res: Response, next: () => void) {
  requireStaffSession(req, res, () => {
    const staff = getStaffSessionOrNull(req);
    if (staff?.twoFactorEnabled && !staff.mfaVerified) {
      res.status(403).json({ ok: false, error: 'TWO_FACTOR_VERIFICATION_REQUIRED', message: 'Enter your authenticator code first.' });
      return;
    }
    next();
  });
}

router.get('/me', requireFullySignedIn, async (req: Request, res: Response) => {
  const staff = getStaffSessionOrNull(req)!;
  const row = await phones.getStaffPhone(staff.userId);
  return res.json({
    ok: true,
    enabled: phoneSignInEnabled(),
    phone: row?.phone && row.verifiedAt ? maskE164(row.phone) : null,
  });
});

router.post('/link/start', requireFullySignedIn, async (req: Request, res: Response) => {
  if (!phoneSignInEnabled()) return res.status(503).json({ ok: false, message: 'Text codes are not set up yet.' });
  const staff = getStaffSessionOrNull(req)!;
  const phone = normalizeUsPhone(req.body?.phone);
  if (!phone) return res.status(400).json({ ok: false, message: 'Enter a 10-digit US mobile number.' });
  if (await phones.phoneUsedByOtherStaff(phone, staff.userId)) {
    return res.status(409).json({ ok: false, message: 'That number is already used by another staff account.' });
  }
  if (!(await textAllowed(staff.email, req))) {
    return res.status(429).json({ ok: false, message: 'Too many codes requested. Wait an hour, then try again.' });
  }
  try {
    await phones.setPendingStaffPhone(staff.userId, staff.email, phone);
    await sendPhoneCode(phone);
    return res.json({ ok: true, phone: maskE164(phone) });
  } catch (err) {
    console.warn('[staff-phone] link start', err instanceof Error ? err.message : err);
    return res.status(502).json({ ok: false, message: 'We could not send a text right now. Try again shortly.' });
  }
});

router.post('/link/confirm', requireFullySignedIn, async (req: Request, res: Response) => {
  const staff = getStaffSessionOrNull(req)!;
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  const row = await phones.getStaffPhone(staff.userId);
  if (!row?.pendingPhone) return res.status(400).json({ ok: false, message: 'Request a new code first.' });
  if (code.length !== 6 || !(await checkPhoneCode(row.pendingPhone, code))) {
    return res.status(401).json({ ok: false, message: 'That code did not work. Check it, or request a new one.' });
  }
  const phone = await phones.confirmStaffPhone(staff.userId);
  await writeActivityAudit({
    actorId: staff.userId,
    actorLabel: staff.label,
    actorRole: staff.role,
    action: 'staff_sms_sign_in_enabled',
    resource: 'staff_account',
    details: `Sign-in codes by text to ${maskE164(phone)}`,
    ipAddress: clientIp(req),
  }).catch(() => null);
  return res.json({ ok: true, phone: maskE164(phone) });
});

router.post('/remove', requireFullySignedIn, async (req: Request, res: Response) => {
  const staff = getStaffSessionOrNull(req)!;
  await phones.removeStaffPhone(staff.userId);
  await writeActivityAudit({
    actorId: staff.userId,
    actorLabel: staff.label,
    actorRole: staff.role,
    action: 'staff_sms_sign_in_disabled',
    resource: 'staff_account',
    details: 'Sign-in codes by text turned off',
    ipAddress: clientIp(req),
  }).catch(() => null);
  return res.json({ ok: true });
});

export default router;
