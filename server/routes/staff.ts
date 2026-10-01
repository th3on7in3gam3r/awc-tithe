import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config';

const router = Router();

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant-ish work, then fail
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/staff/verify
 * Body: { inviteCode: string, authenticatorCode?: string }
 * Requires STAFF_ACCESS_CODE (or STAFF_INVITE_CODE) on the server — never exposed to the client.
 */
router.post('/verify', (req, res) => {
  const expected =
    env.staffAccessCode ||
    '';

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

  // Second factor: any valid 6-digit authenticator code after invite succeeds
  if (!/^\d{6}$/.test(authenticatorCode)) {
    return res.status(400).json({
      ok: false,
      error: 'Enter the 6-digit authenticator code from your staff MFA device.',
    });
  }

  return res.json({
    ok: true,
    role: 'staff',
    message: 'Staff Portal access granted.',
  });
});

export default router;
