import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config';
import { verifyTotp } from '../auth/totp';
import {
  clearStaffSessionCookie,
  createStaffSessionToken,
  setStaffSessionCookie,
  verifyStaffSessionToken,
  readStaffSession,
} from '../auth/session';

const router = Router();

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/staff/verify
 * Body: { inviteCode: string, authenticatorCode?: string }
 * Sets httpOnly session cookie on success.
 */
router.post('/verify', (req, res) => {
  const expected = env.staffAccessCode || '';

  if (!expected) {
    return res.status(503).json({
      ok: false,
      error:
        'Staff Portal is locked. Church stewardship has not configured an invite/access code yet (STAFF_ACCESS_CODE).',
    });
  }

  const inviteCode = String(req.body?.inviteCode ?? '').trim();
  const authenticatorCode = String(req.body?.authenticatorCode ?? '').trim();

  if (!inviteCode) {
    return res.status(400).json({
      ok: false,
      error: 'Enter the staff invite or access code provided by church leadership.',
    });
  }

  if (!timingSafeEqualString(inviteCode, expected)) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid invite or access code. Members cannot enter Staff Portal without an authorized invite.',
    });
  }

  if (!/^\d{6}$/.test(authenticatorCode)) {
    return res.status(400).json({
      ok: false,
      error: 'Enter the 6-digit authenticator code from your staff MFA device.',
    });
  }

  if (env.staffTotpSecret) {
    if (!verifyTotp(env.staffTotpSecret, authenticatorCode)) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid authenticator code. Check your authenticator app and try again.',
      });
    }
  }

  const token = createStaffSessionToken('staff');
  setStaffSessionCookie(res, token);

  return res.json({
    ok: true,
    role: 'staff',
    message: 'Staff Portal access granted.',
    totpEnforced: Boolean(env.staffTotpSecret),
  });
});

/** GET /api/staff/session — check cookie without secrets */
router.get('/session', (req, res) => {
  const ok = verifyStaffSessionToken(readStaffSession(req));
  return res.json({ ok, authenticated: ok });
});

/** POST /api/staff/logout — clear session cookie */
router.post('/logout', (_req, res) => {
  clearStaffSessionCookie(res);
  return res.json({ ok: true });
});

export default router;
