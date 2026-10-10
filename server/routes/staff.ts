import { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from '../config';
import { clientIp } from '../middleware/rateLimit';
import { writeActivityAudit } from '../audit/activity';
import { staffAuth } from '../auth/staffAuth';
import {
  donorSessionStaffFailure,
  getStaffSessionOrNull,
  requireAdminSession,
  requireStaffSession,
} from '../auth/staffGate';
import {
  acceptStaffInvite,
  createStaffInvite,
  deactivateStaffAccount,
  listStaffAccounts,
  resetStaffTwoFactor,
  updateStaffRole,
  type StaffRole,
} from '../auth/staffRoles';
import { sendStaffInviteEmail } from '../email/sendStaffInvite';

const router = Router();

function isRole(v: unknown): v is StaffRole {
  return v === 'admin' || v === 'staff';
}

function inviteUrl(token: string): string {
  return `${env.publicAppUrl.replace(/\/$/, '')}/?staffInvite=${encodeURIComponent(token)}`;
}

/** Current staff identity. Donors with a Better Auth session get 403. */
router.get('/session', requireStaffSession, (req, res) => {
  const session = getStaffSessionOrNull(req);
  if (!session) return res.status(401).json({ ok: false, authenticated: false });
  return res.json({
    ok: true,
    authenticated: true,
    role: session.role,
    accountId: session.accountId,
    label: session.email,
    email: session.email,
    userId: session.userId,
    twoFactorEnabled: session.twoFactorEnabled,
    needsEnrollment: session.role === 'admin' && !session.twoFactorEnabled,
    mfaRequired: session.role === 'admin' && session.twoFactorEnabled && !session.mfaVerified,
  });
});

router.post('/logout', async (req, res) => {
  try {
    const session = await staffAuth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user?.id) {
      const failure = await donorSessionStaffFailure(req);
      if (failure) {
        return res.status(failure.status).json({ ok: false, error: failure.error });
      }
    }
    const { deleteStaffSessionMfa } = await import('../auth/staffMfa');
    if (session?.session?.id) await deleteStaffSessionMfa(session.session.id);
    await staffAuth.api.signOut({ headers: fromNodeHeaders(req.headers) });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[staff] logout', err);
    return res.status(500).json({ ok: false, error: 'STAFF_LOGOUT_FAILED' });
  }
});

router.post('/invites/accept', async (req, res) => {
  try {
    const session = await staffAuth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const email = session?.user?.email?.trim().toLowerCase();
    if (!session?.user?.id) {
      const failure = await donorSessionStaffFailure(req);
      if (failure) {
        return res.status(failure.status).json({ ok: false, error: failure.error });
      }
    }
    if (!email || !session?.user?.id) {
      return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
    }
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ ok: false, error: 'INVITE_REQUIRED' });
    const account = await acceptStaffInvite({
      token,
      userId: session.user.id,
      email,
      ipAddress: clientIp(req),
    });
    return res.json({ ok: true, role: account.role, email: account.email });
  } catch (err) {
    console.error('[staff] invite accept', err);
    const text = err instanceof Error ? err.message : '';
    const friendly =
      text.includes('invalid or expired')
        ? 'This invite is invalid or expired'
        : text.includes('invited email')
          ? 'Sign in with the invited email address'
          : 'Invite could not be accepted.';
    return res.status(400).json({
      ok: false,
      error: 'INVITE_ACCEPT_FAILED',
      message: friendly,
    });
  }
});

router.post('/2fa/audit', requireStaffSession, async (req, res) => {
  const session = getStaffSessionOrNull(req);
  if (!session) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
  const event = String(req.body?.event || '');
  if (event !== 'enrolled') {
    return res.status(400).json({ ok: false, error: 'INVALID_EVENT' });
  }
  const account = await staffAuth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!(account?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled) {
    return res.status(409).json({ ok: false, error: 'TWO_FACTOR_NOT_ENABLED' });
  }
  await writeActivityAudit({
    actorId: session.userId,
    actorLabel: session.email,
    actorRole: session.role,
    action: 'STAFF_2FA_ENROLLED',
    resource: session.email,
    details: 'Authenticator enrolled and verified',
    ipAddress: clientIp(req),
  });
  return res.json({ ok: true });
});

router.get('/accounts', requireAdminSession, async (_req, res) => {
  const accounts = await listStaffAccounts();
  return res.json({
    ok: true,
    accounts: accounts.map((a) => ({
      id: a.id,
      label: a.email,
      email: a.email,
      role: a.role,
      active: a.status === 'active',
      status: a.status,
    })),
  });
});

router.post('/invites', requireAdminSession, async (req, res) => {
  const actor = getStaffSessionOrNull(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
  const role = req.body?.role;
  const email = String(req.body?.email || '');
  if (!isRole(role)) return res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
  let invite: Awaited<ReturnType<typeof createStaffInvite>>;
  try {
    invite = await createStaffInvite({
      email,
      role,
      invitedBy: actor.userId,
      actorLabel: actor.email,
      ipAddress: clientIp(req),
    });
  } catch (err) {
    console.error('[staff] invite', err);
    return res.status(400).json({
      ok: false,
      error: 'INVITE_FAILED',
      message: 'Could not create the invitation.',
    });
  }
  try {
    await sendStaffInviteEmail({
      email: email.trim().toLowerCase(),
      role,
      inviteUrl: inviteUrl(invite.token),
      expiresAt: invite.expiresAt,
    });
    return res.json({
      ok: true,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    console.error('[staff] invite email', err);
    return res.status(502).json({
      ok: false,
      error: 'INVITE_EMAIL_FAILED',
      message: 'Invitation email could not be sent.',
    });
  }
});

router.patch('/accounts/:id/role', requireAdminSession, async (req, res) => {
  const actor = getStaffSessionOrNull(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
  const role = req.body?.role;
  if (!isRole(role)) return res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
  try {
    const account = await updateStaffRole({
      targetId: String(req.params.id),
      newRole: role,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      ipAddress: clientIp(req),
    });
    return res.json({ ok: true, account });
  } catch (err) {
    console.error('[staff] role', err);
    const message = err instanceof Error ? err.message : 'Failed';
    const status = message === 'LAST_ADMIN' ? 409 : message === 'STAFF_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({
      ok: false,
      error: message === 'LAST_ADMIN' || message === 'STAFF_NOT_FOUND' ? message : 'ROLE_CHANGE_FAILED',
    });
  }
});

router.post('/accounts/:id/deactivate', requireAdminSession, async (req, res) => {
  const actor = getStaffSessionOrNull(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
  try {
    await deactivateStaffAccount({
      targetId: String(req.params.id),
      actorUserId: actor.userId,
      actorLabel: actor.email,
      ipAddress: clientIp(req),
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[staff] deactivate', err);
    const message = err instanceof Error ? err.message : 'Failed';
    const status = message === 'LAST_ADMIN' ? 409 : message === 'STAFF_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({
      ok: false,
      error: message === 'LAST_ADMIN' || message === 'STAFF_NOT_FOUND' ? message : 'DEACTIVATE_FAILED',
    });
  }
});

router.post('/accounts/:id/reset-2fa', requireAdminSession, async (req, res) => {
  const actor = getStaffSessionOrNull(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });
  try {
    await resetStaffTwoFactor({
      targetId: String(req.params.id),
      actorUserId: actor.userId,
      actorLabel: actor.email,
      ipAddress: clientIp(req),
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[staff] reset-2fa', err);
    const message = err instanceof Error ? err.message : 'Failed';
    return res.status(message === 'STAFF_NOT_FOUND' ? 404 : 400).json({
      ok: false,
      error: message === 'STAFF_NOT_FOUND' ? message : 'RESET_2FA_FAILED',
    });
  }
});

router.get('/me', requireStaffSession, (req, res) => {
  return res.json({ ok: true, session: getStaffSessionOrNull(req) });
});

export default router;
