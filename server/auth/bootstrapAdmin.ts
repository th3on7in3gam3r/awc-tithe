/**
 * One-time first-admin setup without database access.
 *
 * Set BOOTSTRAP_ADMIN_EMAIL in Render. On boot, if (and only if) there is no
 * active admin yet, a single-use admin invite is created for that email and
 * its link is written to the server log, which only people with access to the
 * Render service can read. Each boot replaces the previous unused invite.
 * Once an admin exists this does nothing, so the variable can be removed.
 */
import { countActiveAdmins, createStaffInvite } from './staffRoles';
import { env } from '../config';

export async function maybeBootstrapAdminInvite(
  log: (line: string) => void = (line) => console.log(line)
): Promise<'skipped' | 'admin-exists' | 'invited' | 'invalid-email'> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return 'skipped';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    log('[bootstrap] BOOTSTRAP_ADMIN_EMAIL is not a valid email; ignoring it.');
    return 'invalid-email';
  }
  if ((await countActiveAdmins()) > 0) {
    log('[bootstrap] An admin already exists. You can remove BOOTSTRAP_ADMIN_EMAIL from the environment.');
    return 'admin-exists';
  }
  const invite = await createStaffInvite({
    email,
    role: 'admin',
    invitedBy: 'bootstrap:env',
    actorLabel: 'BOOTSTRAP_ADMIN_EMAIL',
    ipAddress: '127.0.0.1',
  });
  const url = `${env.publicAppUrl.replace(/\/$/, '')}/?staffInvite=${encodeURIComponent(invite.token)}`;
  log(`[bootstrap] First admin invite for ${email} (single use, expires ${invite.expiresAt}):`);
  log(`[bootstrap] ${url}`);
  return 'invited';
}
