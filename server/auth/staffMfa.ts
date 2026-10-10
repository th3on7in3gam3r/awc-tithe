import { getSql } from '../db';
import { memoryStoreAllowed } from '../config';
import { getPgPool } from './pgPool';

const MFA_FAIL_LIMIT = 5;

const memoryMfa = new Map<
  string,
  { userId: string; verifiedAt: string | null; failedAttempts: number }
>();

function requireMemory(): void {
  if (!memoryStoreAllowed()) {
    throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
  }
}

export async function isStaffSessionMfaVerified(sessionId: string): Promise<boolean> {
  const id = sessionId.trim();
  if (!id) return false;
  const client = getSql();
  if (!client) {
    requireMemory();
    const row = memoryMfa.get(id);
    return Boolean(row?.verifiedAt);
  }
  const rows = await client`
    SELECT verified_at FROM staff_session_mfa
    WHERE session_id = ${id} AND verified_at IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function markStaffSessionMfaVerified(sessionId: string, userId: string): Promise<void> {
  const id = sessionId.trim();
  if (!id || !userId) return;
  const client = getSql();
  if (!client) {
    requireMemory();
    memoryMfa.set(id, { userId, verifiedAt: new Date().toISOString(), failedAttempts: 0 });
    return;
  }
  await client`
    INSERT INTO staff_session_mfa (session_id, user_id, verified_at, failed_attempts)
    VALUES (${id}, ${userId}, NOW(), 0)
    ON CONFLICT (session_id) DO UPDATE
      SET user_id = EXCLUDED.user_id, verified_at = NOW(), failed_attempts = 0
  `;
}

export async function recordStaffMfaFailure(
  sessionId: string,
  userId: string
): Promise<{ failedAttempts: number; revoked: boolean }> {
  const id = sessionId.trim();
  if (!id || !userId) return { failedAttempts: 0, revoked: false };
  const client = getSql();
  if (!client) {
    requireMemory();
    const prev = memoryMfa.get(id) || { userId, verifiedAt: null, failedAttempts: 0 };
    const failedAttempts = prev.failedAttempts + 1;
    memoryMfa.set(id, { userId, verifiedAt: prev.verifiedAt, failedAttempts });
    if (failedAttempts >= MFA_FAIL_LIMIT) {
      await deleteStaffSessionMfa(id);
      const { revokeUserSessions } = await import('./staffRoles');
      await revokeUserSessions(userId);
      return { failedAttempts, revoked: true };
    }
    return { failedAttempts, revoked: false };
  }
  await client`
    INSERT INTO staff_session_mfa (session_id, user_id, verified_at, failed_attempts)
    VALUES (${id}, ${userId}, NULL, 1)
    ON CONFLICT (session_id) DO UPDATE
      SET failed_attempts = staff_session_mfa.failed_attempts + 1, user_id = EXCLUDED.user_id
  `;
  const rows = await client`
    SELECT failed_attempts FROM staff_session_mfa WHERE session_id = ${id} LIMIT 1
  `;
  const failedAttempts = Number(rows[0]?.failed_attempts || 0);
  if (failedAttempts >= MFA_FAIL_LIMIT) {
    await deleteStaffSessionMfa(id);
    const { revokeUserSessions } = await import('./staffRoles');
    await revokeUserSessions(userId);
    return { failedAttempts, revoked: true };
  }
  return { failedAttempts, revoked: false };
}

export async function deleteStaffSessionMfa(sessionId: string): Promise<void> {
  const id = sessionId.trim();
  if (!id) return;
  memoryMfa.delete(id);
  const pool = getPgPool();
  if (pool) {
    await pool.query('DELETE FROM staff_session_mfa WHERE session_id = $1', [id]);
    return;
  }
  const client = getSql();
  if (client) {
    await client`DELETE FROM staff_session_mfa WHERE session_id = ${id}`;
  }
}

export async function deleteStaffMfaForUser(userId: string): Promise<void> {
  for (const [sessionId, row] of memoryMfa) {
    if (row.userId === userId) memoryMfa.delete(sessionId);
  }
  const pool = getPgPool();
  if (pool) {
    await pool.query('DELETE FROM staff_session_mfa WHERE user_id = $1', [userId]);
    return;
  }
  const client = getSql();
  if (client) {
    await client`DELETE FROM staff_session_mfa WHERE user_id = ${userId}`;
  }
}

export function __resetStaffMfaForTests(): void {
  memoryMfa.clear();
}
