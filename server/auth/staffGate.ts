import type { NextFunction, Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { isProduction } from '../config';
import { auth } from './betterAuth';
import { staffAuth } from './staffAuth';
import { clientIp } from '../middleware/rateLimit';
import {
  assertStaffSessionFresh,
  claimPendingStaffAccess,
  findStaffByUserId,
  revokeUserSessions,
  type StaffAccount,
} from './staffRoles';
import { deleteStaffSessionMfa, isStaffSessionMfaVerified } from './staffMfa';

export type StaffRequestContext = {
  role: StaffAccount['role'];
  accountId: string;
  label: string;
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
  mfaVerified: boolean;
  sessionId: string;
};

type StaffRequest = Request & { staff?: StaffRequestContext };

export async function donorSessionStaffFailure(
  req: Request
): Promise<{ status: number; error: string } | null> {
  if (process.env.STAFF_TEST_MODE === '1' && !isProduction()) {
    const identity = readCookie(req.headers.cookie, TEST_COOKIE);
    if (identity === 'donor') return { status: 403, error: 'NOT_STAFF' };
    if (identity === 'deactivated') return { status: 403, error: 'STAFF_DEACTIVATED' };
    return null;
  }
  const donorSession = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!donorSession?.user?.id) return null;
  const account = await findStaffByUserId(donorSession.user.id);
  if (!account) return { status: 403, error: 'NOT_STAFF' };
  if (account.status !== 'active') return { status: 403, error: 'STAFF_DEACTIVATED' };
  return null;
}

const TEST_COOKIE = 'awc_staff_test';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

function testContext(key: string | undefined): { status: number; error: string; staff?: StaffRequestContext } {
  if (!key) return { status: 401, error: 'STAFF_AUTH_REQUIRED' };
  if (key === 'donor') return { status: 403, error: 'NOT_STAFF' };
  if (key === 'deactivated') return { status: 403, error: 'STAFF_DEACTIVATED' };
  if (key === 'staff' || key === 'admin' || key === 'admin-unenrolled' || key === 'admin-mfa-pending') {
    const role = key === 'staff' ? 'staff' : 'admin';
    const enrolled = key === 'admin' || key === 'admin-mfa-pending';
    return {
      status: 200,
      error: '',
      staff: {
        role,
        accountId: `test-${key}`,
        label: `${key}@example.com`,
        userId: `user-${key}`,
        email: `${key}@example.com`,
        twoFactorEnabled: enrolled,
        mfaVerified: key === 'admin',
        sessionId: `session-${key}`,
      },
    };
  }
  return { status: 401, error: 'STAFF_AUTH_REQUIRED' };
}

async function loadStaff(req: Request): Promise<{ status: number; error: string; staff?: StaffRequestContext }> {
  if (process.env.STAFF_TEST_MODE === '1' && !isProduction()) {
    return testContext(readCookie(req.headers.cookie, TEST_COOKIE));
  }

  const session = await staffAuth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user?.id) {
    const donorFailure = await donorSessionStaffFailure(req);
    return donorFailure || { status: 401, error: 'STAFF_AUTH_REQUIRED' };
  }

  const createdAt = new Date(session.session.createdAt);
  const fresh = await assertStaffSessionFresh({
    sessionId: session.session.id,
    userId: session.user.id,
    createdAt,
  });
  if (fresh === 'expired') {
    await deleteStaffSessionMfa(session.session.id);
    await staffAuth.api.signOut({ headers: fromNodeHeaders(req.headers) });
    return { status: 401, error: 'STAFF_SESSION_EXPIRED' };
  }

  let account = await findStaffByUserId(session.user.id);
  if (!account) {
    account = await claimPendingStaffAccess({
      userId: session.user.id,
      email: session.user.email || '',
      ipAddress: clientIp(req),
    });
  }
  if (!account) return { status: 403, error: 'NOT_STAFF' };
  if (account.status !== 'active') {
    await revokeUserSessions(account.userId);
    return { status: 403, error: 'STAFF_DEACTIVATED' };
  }

  const twoFactorEnabled = Boolean((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
  const mfaVerified = twoFactorEnabled
    ? await isStaffSessionMfaVerified(session.session.id)
    : true;
  return {
    status: 200,
    error: '',
    staff: {
      role: account.role,
      accountId: account.id,
      label: account.email,
      userId: account.userId,
      email: account.email,
      twoFactorEnabled,
      mfaVerified,
      sessionId: session.session.id,
    },
  };
}

function deny(res: Response, status: number, error: string): void {
  const message =
    error === 'NOT_STAFF'
      ? 'This signed-in account is not an active staff account.'
      : error === 'STAFF_DEACTIVATED'
        ? 'This staff account is deactivated.'
        : error === 'TWO_FACTOR_ENROLLMENT_REQUIRED'
          ? 'Set up an authenticator app before using admin features.'
          : error === 'TWO_FACTOR_VERIFICATION_REQUIRED'
            ? 'Enter your authenticator code to continue.'
          : error === 'ADMIN_REQUIRED'
            ? 'This action requires an administrator role.'
            : 'Sign in to the Staff Portal.';
  res.status(status).json({ ok: false, error, message });
}

export function requireStaffSession(req: Request, res: Response, next: NextFunction): void {
  void loadStaff(req)
    .then((result) => {
      if (!result.staff) {
        deny(res, result.status, result.error);
        return;
      }
      if (
        result.staff.role === 'admin' &&
        !result.staff.twoFactorEnabled &&
        !(req.method === 'GET' && req.path === '/session')
      ) {
        deny(res, 403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
        return;
      }
      (req as StaffRequest).staff = result.staff;
      next();
    })
    .catch((err) => {
      console.error('[staff] session', err);
      res.status(500).json({ ok: false, error: 'STAFF_SESSION_FAILED' });
    });
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  requireStaffSession(req, res, () => {
    const staff = (req as StaffRequest).staff;
    if (staff?.role !== 'admin') {
      deny(res, 403, 'ADMIN_REQUIRED');
      return;
    }
    if (!staff.twoFactorEnabled) {
      deny(res, 403, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
      return;
    }
    if (!staff.mfaVerified) {
      deny(res, 403, 'TWO_FACTOR_VERIFICATION_REQUIRED');
      return;
    }
    next();
  });
}

export function getStaffSessionOrNull(req: Request): StaffRequestContext | null {
  return (req as StaffRequest).staff ?? null;
}
