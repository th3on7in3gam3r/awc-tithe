import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config';

export const STAFF_SESSION_COOKIE = 'awc_staff_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  return (
    process.env.STAFF_SESSION_SECRET?.trim()
    || env.staffAccessCode
    || 'awc-tithe-dev-session'
  );
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url');
}

export function createStaffSessionToken(role = 'staff'): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payloadB64 = Buffer.from(JSON.stringify({ role, exp }), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyStaffSessionToken(token: string | undefined): boolean {
  if (!token || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function readStaffSession(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[STAFF_SESSION_COOKIE];
}

export function setStaffSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.append(
    'Set-Cookie',
    `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  );
}

export function clearStaffSessionCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    `${STAFF_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

/** Require valid staff session cookie (after /api/staff/verify). */
export function requireStaffSession(req: Request, res: Response, next: NextFunction): void {
  if (verifyStaffSessionToken(readStaffSession(req))) {
    next();
    return;
  }
  res.status(401).json({
    ok: false,
    error: 'STAFF_AUTH_REQUIRED',
    message: 'Unlock Staff Portal (invite + authenticator) before this action.',
  });
}
