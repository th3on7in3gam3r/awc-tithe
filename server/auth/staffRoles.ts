import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getSql } from '../db';
import { memoryStoreAllowed } from '../config';
import { getPgPool } from './pgPool';
import { writeActivityAudit } from '../audit/activity';

export type StaffRole = 'admin' | 'staff';
export type StaffStatus = 'active' | 'deactivated';

export type StaffAccount = {
  id: string;
  userId: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
};

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const memoryAccounts = new Map<string, StaffAccount>();
const memoryInvites = new Map<
  string,
  { id: string; email: string; role: StaffRole; tokenHash: string; expiresAt: number; usedAt: string | null; invitedBy: string | null }
>();
const memorySeen = new Map<string, { userId: string; lastSeen: number }>();

function requireMemoryStaff(): void {
  if (!memoryStoreAllowed()) {
    throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
  }
}

function isRole(v: unknown): v is StaffRole {
  return v === 'admin' || v === 'staff';
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function withStaffTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  if (!pool) throw new Error('DATABASE_URL is required for staff account changes');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, unknown>): StaffAccount | null {
  if (!row.user_id || !isRole(row.role)) return null;
  const status: StaffStatus = row.status === 'deactivated' || row.active === false ? 'deactivated' : 'active';
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: String(row.email || ''),
    role: row.role,
    status,
  };
}

export async function emailEligibleForStaffOtp(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const account = await findStaffByEmail(normalized);
  if (account && account.status === 'active') return true;
  const client = getSql();
  const now = Date.now();
  if (!client) {
    requireMemoryStaff();
    for (const invite of memoryInvites.values()) {
      if (invite.email === normalized && !invite.usedAt && invite.expiresAt > now) return true;
    }
    return false;
  }
  const rows = await client`
    SELECT id FROM staff_invites
    WHERE LOWER(email) = ${normalized} AND used_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `;
  return rows.length > 0;
}

async function findStaffByEmail(email: string): Promise<StaffAccount | null> {
  const normalized = email.trim().toLowerCase();
  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    for (const account of memoryAccounts.values()) {
      if (account.email === normalized) return account;
    }
    return null;
  }
  const rows = await client`
    SELECT id, user_id, email, role, status, active
    FROM staff_accounts
    WHERE LOWER(email) = ${normalized} AND user_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function findStaffByUserId(userId: string): Promise<StaffAccount | null> {
  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    for (const account of memoryAccounts.values()) {
      if (account.userId === userId) return account;
    }
    return null;
  }
  const rows = await client`
    SELECT id, user_id, email, role, status, active
    FROM staff_accounts
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function countActiveAdmins(): Promise<number> {
  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    let n = 0;
    for (const account of memoryAccounts.values()) {
      if (account.role === 'admin' && account.status === 'active') n += 1;
    }
    return n;
  }
  const rows = await client`
    SELECT COUNT(*)::int AS n FROM staff_accounts
    WHERE role = 'admin' AND status = 'active' AND user_id IS NOT NULL
  `;
  return Number(rows[0]?.n || 0);
}

export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    return Array.from(memoryAccounts.values()).filter((a) => a.userId);
  }
  const rows = await client`
    SELECT id, user_id, email, role, status, active
    FROM staff_accounts
    WHERE user_id IS NOT NULL
    ORDER BY email ASC
  `;
  return rows.map((row) => mapRow(row as Record<string, unknown>)).filter((a): a is StaffAccount => Boolean(a));
}

export async function createStaffInvite(input: {
  email: string;
  role: StaffRole;
  invitedBy: string | null;
  ipAddress: string;
  actorLabel: string;
}): Promise<{ token: string; expiresAt: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('A valid email is required');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const id = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    const existing = await findStaffByEmail(email);
    if (existing) throw new Error('This email is already linked to a staff account');
    for (const [key, invite] of memoryInvites) {
      if (invite.email === email && !invite.usedAt) memoryInvites.delete(key);
    }
    memoryInvites.set(tokenHash, {
      id,
      email,
      role: input.role,
      tokenHash,
      expiresAt: expiresAt.getTime(),
      usedAt: null,
      invitedBy: input.invitedBy,
    });
    await writeActivityAudit({
      actorId: input.invitedBy || 'bootstrap',
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_INVITE',
      resource: email,
      details: `Invited ${email} as ${input.role}`,
      ipAddress: input.ipAddress,
    });
  } else {
    await withStaffTransaction(async (tx) => {
      const existing = await tx.query(
        'SELECT id FROM staff_accounts WHERE LOWER(email) = $1 AND user_id IS NOT NULL LIMIT 1',
        [email]
      );
      if (existing.rowCount) throw new Error('This email is already linked to a staff account');
      await tx.query(
        'UPDATE staff_invites SET used_at = NOW() WHERE LOWER(email) = $1 AND used_at IS NULL',
        [email]
      );
      await tx.query(
        `INSERT INTO staff_invites (id, email, role, token_hash, expires_at, invited_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, email, input.role, tokenHash, expiresAt.toISOString(), input.invitedBy]
      );
      await writeActivityAudit({
        actorId: input.invitedBy || 'bootstrap',
        actorLabel: input.actorLabel,
        actorRole: 'admin',
        action: 'STAFF_INVITE',
        resource: email,
        details: `Invited ${email} as ${input.role}`,
        ipAddress: input.ipAddress,
      }, tx);
    });
  }
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function acceptStaffInvite(input: {
  token: string;
  userId: string;
  email: string;
  ipAddress: string;
}): Promise<StaffAccount> {
  const email = input.email.trim().toLowerCase();
  const tokenHash = hashToken(input.token.trim());
  if (!getSql()) {
    requireMemoryStaff();
    const invite = memoryInvites.get(tokenHash);
    if (!invite || invite.usedAt || invite.expiresAt < Date.now()) {
      throw new Error('This invite is invalid or expired');
    }
    if (invite.email !== email) throw new Error('Sign in with the invited email address');
    const existing = await findStaffByUserId(input.userId);
    if (existing?.status === 'deactivated') throw new Error('This staff account is deactivated');
    if (existing) throw new Error('This user already has a staff account');
    const byEmail = await findStaffByEmail(email);
    if (byEmail) throw new Error('This email is already linked to another staff account');
    const id = `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const account: StaffAccount = { id, userId: input.userId, email, role: invite.role, status: 'active' };
    invite.usedAt = new Date().toISOString();
    memoryAccounts.set(id, account);
    await writeActivityAudit({
      actorId: input.userId,
      actorLabel: email,
      actorRole: account.role,
      action: 'STAFF_INVITE_ACCEPTED',
      resource: invite.id,
      details: `${email} accepted a ${account.role} invite`,
      ipAddress: input.ipAddress,
    });
    return account;
  } else {
    return withStaffTransaction(async (tx) => {
      const rows = await tx.query(
        `SELECT id, email, role, expires_at, used_at
         FROM staff_invites WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash]
      );
      const invite = rows.rows[0] as Record<string, unknown> | undefined;
      if (!invite || invite.used_at || new Date(String(invite.expires_at)).getTime() < Date.now()) {
        throw new Error('This invite is invalid or expired');
      }
      if (String(invite.email).toLowerCase() !== email) {
        throw new Error('Sign in with the invited email address');
      }
      const role = isRole(invite.role) ? invite.role : 'staff';
      const existing = await tx.query('SELECT id, status FROM staff_accounts WHERE user_id = $1 LIMIT 1', [input.userId]);
      if (existing.rows[0]?.status === 'deactivated') throw new Error('This staff account is deactivated');
      if (existing.rowCount) throw new Error('This user already has a staff account');
      const byEmail = await tx.query(
        'SELECT id FROM staff_accounts WHERE LOWER(email) = $1 AND user_id IS NOT NULL LIMIT 1',
        [email]
      );
      if (byEmail.rowCount) throw new Error('This email is already linked to another staff account');
      const id = `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const account: StaffAccount = { id, userId: input.userId, email, role, status: 'active' };
      const updated = await tx.query(
        `UPDATE staff_invites SET used_at = NOW()
         WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING id`,
        [String(invite.id)]
      );
      if (!updated.rowCount) throw new Error('This invite is invalid or expired');
      await tx.query(
        `INSERT INTO staff_accounts (id, label, invite_code_hash, role, active, user_id, email, status)
         VALUES ($1, $2, NULL, $3, TRUE, $4, $2, 'active')`,
        [id, email, role, input.userId]
      );
      await writeActivityAudit({
        actorId: input.userId,
        actorLabel: email,
        actorRole: role,
        action: 'STAFF_INVITE_ACCEPTED',
        resource: String(invite.id),
        details: `${email} accepted a ${role} invite`,
        ipAddress: input.ipAddress,
      }, tx);
      return account;
    });
  }
}

/**
 * After Staff Portal OTP, attach this user to an existing staff row or unused invite
 * for the same email. Invite links are optional once the inbox has been proven.
 */
export async function claimPendingStaffAccess(input: {
  userId: string;
  email: string;
  ipAddress: string;
}): Promise<StaffAccount | null> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.userId) return null;

  const already = await findStaffByUserId(input.userId);
  if (already) return already.status === 'active' ? already : null;

  const linked = await findStaffByEmail(email);
  if (linked) {
    if (linked.status !== 'active') return null;
    if (linked.userId === input.userId) return linked;
    const client = getSql();
    if (!client) {
      requireMemoryStaff();
      linked.userId = input.userId;
      return { ...linked };
    }
    await client`
      UPDATE staff_accounts SET user_id = ${input.userId}, updated_at = NOW()
      WHERE id = ${linked.id} AND status = 'active'
    `;
    await revokeUserSessions(linked.userId);
    return { ...linked, userId: input.userId };
  }

  const client = getSql();
  if (!client) {
    requireMemoryStaff();
    let match: { id: string; email: string; role: StaffRole; tokenHash: string; expiresAt: number; usedAt: string | null; invitedBy: string | null } | null = null;
    for (const invite of memoryInvites.values()) {
      if (invite.email === email && !invite.usedAt && invite.expiresAt > Date.now()) {
        if (!match || invite.expiresAt > match.expiresAt) match = invite;
      }
    }
    if (!match) return null;
    match.usedAt = new Date().toISOString();
    const id = `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const account: StaffAccount = { id, userId: input.userId, email, role: match.role, status: 'active' };
    memoryAccounts.set(id, account);
    await writeActivityAudit({
      actorId: input.userId,
      actorLabel: email,
      actorRole: account.role,
      action: 'STAFF_INVITE_ACCEPTED',
      resource: match.id,
      details: `${email} accepted a ${account.role} invite`,
      ipAddress: input.ipAddress,
    });
    return account;
  }

  return withStaffTransaction(async (tx) => {
    const rows = await tx.query(
      `SELECT id, email, role, expires_at, used_at
       FROM staff_invites
       WHERE LOWER(email) = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [email]
    );
    const invite = rows.rows[0] as Record<string, unknown> | undefined;
    if (!invite) return null;
    const role = isRole(invite.role) ? invite.role : 'staff';
    const existingUser = await tx.query(
      'SELECT id, user_id, email, role, status, active FROM staff_accounts WHERE user_id = $1 LIMIT 1',
      [input.userId]
    );
    if (existingUser.rows[0]?.status === 'deactivated') return null;
    if (existingUser.rowCount) return mapRow(existingUser.rows[0] as Record<string, unknown>);
    const byEmail = await tx.query(
      'SELECT id FROM staff_accounts WHERE LOWER(email) = $1 AND user_id IS NOT NULL LIMIT 1',
      [email]
    );
    if (byEmail.rowCount) return null;
    const updated = await tx.query(
      `UPDATE staff_invites SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [String(invite.id)]
    );
    if (!updated.rowCount) return null;
    const id = `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const account: StaffAccount = { id, userId: input.userId, email, role, status: 'active' };
    await tx.query(
      `INSERT INTO staff_accounts (id, label, invite_code_hash, role, active, user_id, email, status)
       VALUES ($1, $2, NULL, $3, TRUE, $4, $2, 'active')`,
      [id, email, role, input.userId]
    );
    await writeActivityAudit({
      actorId: input.userId,
      actorLabel: email,
      actorRole: role,
      action: 'STAFF_INVITE_ACCEPTED',
      resource: String(invite.id),
      details: `${email} accepted a ${role} invite`,
      ipAddress: input.ipAddress,
    }, tx);
    return account;
  });
}

export async function updateStaffRole(input: {
  targetId: string;
  newRole: StaffRole;
  actorUserId: string;
  actorLabel: string;
  ipAddress: string;
}): Promise<StaffAccount> {
  if (!getSql()) {
    const target = memoryAccounts.get(input.targetId);
    if (!target) throw new Error('STAFF_NOT_FOUND');
    if (target.role === input.newRole) return { ...target };
    if (
      target.role === 'admin' &&
      input.newRole !== 'admin' &&
      target.status === 'active' &&
      (await countActiveAdmins()) <= 1
    ) {
      throw new Error('LAST_ADMIN');
    }
    const oldRole = target.role;
    target.role = input.newRole;
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_ROLE_CHANGE',
      resource: target.email,
      details: `${target.email} role ${oldRole} → ${input.newRole}`,
      ipAddress: input.ipAddress,
    });
    return { ...target };
  }

  return withStaffTransaction(async (tx) => {
    await tx.query('LOCK TABLE staff_accounts IN EXCLUSIVE MODE');
    const rows = await tx.query(
      `SELECT id, user_id, email, role, status, active FROM staff_accounts WHERE id = $1 FOR UPDATE`,
      [input.targetId]
    );
    const target = rows.rows[0] ? mapRow(rows.rows[0] as Record<string, unknown>) : null;
    if (!target) throw new Error('STAFF_NOT_FOUND');
    if (target.role === input.newRole) return target;
    if (target.role === 'admin' && input.newRole !== 'admin' && target.status === 'active') {
      const admins = await tx.query(
        `SELECT COUNT(*)::int AS n FROM staff_accounts
         WHERE role = 'admin' AND status = 'active' AND user_id IS NOT NULL`
      );
      if (Number(admins.rows[0]?.n || 0) <= 1) throw new Error('LAST_ADMIN');
    }
    await tx.query(
      'UPDATE staff_accounts SET role = $1, updated_at = NOW() WHERE id = $2',
      [input.newRole, input.targetId]
    );
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_ROLE_CHANGE',
      resource: target.email,
      details: `${target.email} role ${target.role} → ${input.newRole}`,
      ipAddress: input.ipAddress,
    }, tx);
    return { ...target, role: input.newRole };
  });
}

export async function deactivateStaffAccount(input: {
  targetId: string;
  actorUserId: string;
  actorLabel: string;
  ipAddress: string;
}): Promise<void> {
  if (!getSql()) {
    const target = memoryAccounts.get(input.targetId);
    if (!target) throw new Error('STAFF_NOT_FOUND');
    if (target.status === 'deactivated') return;
    if (target.role === 'admin' && (await countActiveAdmins()) <= 1) throw new Error('LAST_ADMIN');
    target.status = 'deactivated';
    await revokeUserSessions(target.userId);
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_DEACTIVATED',
      resource: target.email,
      details: `Deactivated ${target.email}`,
      ipAddress: input.ipAddress,
    });
    return;
  }
  await withStaffTransaction(async (tx) => {
    await tx.query('LOCK TABLE staff_accounts IN EXCLUSIVE MODE');
    const rows = await tx.query(
      `SELECT id, user_id, email, role, status, active FROM staff_accounts WHERE id = $1 FOR UPDATE`,
      [input.targetId]
    );
    const target = rows.rows[0] ? mapRow(rows.rows[0] as Record<string, unknown>) : null;
    if (!target) throw new Error('STAFF_NOT_FOUND');
    if (target.status === 'deactivated') return;
    if (target.role === 'admin') {
      const admins = await tx.query(
        `SELECT COUNT(*)::int AS n FROM staff_accounts
         WHERE role = 'admin' AND status = 'active' AND user_id IS NOT NULL`
      );
      if (Number(admins.rows[0]?.n || 0) <= 1) throw new Error('LAST_ADMIN');
    }
    await tx.query(
      `UPDATE staff_accounts SET status = 'deactivated', active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [input.targetId]
    );
    await tx.query('DELETE FROM "session" WHERE "userId" = $1', [target.userId]);
    await tx.query('DELETE FROM staff_session_activity WHERE user_id = $1', [target.userId]);
    await tx.query('DELETE FROM staff_session_mfa WHERE user_id = $1', [target.userId]);
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_DEACTIVATED',
      resource: target.email,
      details: `Deactivated ${target.email}`,
      ipAddress: input.ipAddress,
    }, tx);
  });
}

export async function revokeUserSessions(userId: string): Promise<void> {
  for (const [sessionId, row] of memorySeen) {
    if (row.userId === userId) memorySeen.delete(sessionId);
  }
  const { deleteStaffMfaForUser } = await import('./staffMfa');
  await deleteStaffMfaForUser(userId);
  const pool = getPgPool();
  if (!pool) return;
  await pool.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
  await pool.query('DELETE FROM staff_session_activity WHERE user_id = $1', [userId]);
}

export async function resetStaffTwoFactor(input: {
  targetId: string;
  actorUserId: string;
  actorLabel: string;
  ipAddress: string;
}): Promise<void> {
  const accounts = await listStaffAccounts();
  const target = accounts.find((a) => a.id === input.targetId);
  if (!target) throw new Error('STAFF_NOT_FOUND');
  if (!getSql()) {
    requireMemoryStaff();
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_2FA_RESET',
      resource: target.email,
      details: `Reset authenticator for ${target.email}`,
      ipAddress: input.ipAddress,
    });
    return;
  }
  await withStaffTransaction(async (tx) => {
    await tx.query('UPDATE "user" SET "twoFactorEnabled" = FALSE WHERE id = $1', [target.userId]);
    await tx.query('DELETE FROM "twoFactor" WHERE "userId" = $1', [target.userId]);
    await tx.query('DELETE FROM "session" WHERE "userId" = $1', [target.userId]);
    await tx.query('DELETE FROM staff_session_activity WHERE user_id = $1', [target.userId]);
    await tx.query('DELETE FROM staff_session_mfa WHERE user_id = $1', [target.userId]);
    await writeActivityAudit({
      actorId: input.actorUserId,
      actorLabel: input.actorLabel,
      actorRole: 'admin',
      action: 'STAFF_2FA_RESET',
      resource: target.email,
      details: `Reset authenticator for ${target.email}`,
      ipAddress: input.ipAddress,
    }, tx);
  });
}

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export async function assertStaffSessionFresh(input: {
  sessionId: string;
  userId: string;
  createdAt: Date;
}): Promise<'ok' | 'expired'> {
  if (Date.now() - input.createdAt.getTime() > ABSOLUTE_MS) return 'expired';
  const client = getSql();
  const now = Date.now();
  if (!client) {
    requireMemoryStaff();
    const prev = memorySeen.get(input.sessionId);
    if (prev && now - prev.lastSeen > IDLE_MS) return 'expired';
    memorySeen.set(input.sessionId, { userId: input.userId, lastSeen: now });
    return 'ok';
  }
  const rows = await client`
    SELECT last_seen FROM staff_session_activity WHERE session_id = ${input.sessionId} LIMIT 1
  `;
  const last = rows[0]?.last_seen ? new Date(String(rows[0].last_seen)).getTime() : null;
  if (last && now - last > IDLE_MS) return 'expired';
  await client`
    INSERT INTO staff_session_activity (session_id, user_id, last_seen)
    VALUES (${input.sessionId}, ${input.userId}, NOW())
    ON CONFLICT (session_id) DO UPDATE SET last_seen = NOW(), user_id = EXCLUDED.user_id
  `;
  return 'ok';
}

export function __resetStaffRoleMemoryForTests(): void {
  memoryAccounts.clear();
  memoryInvites.clear();
  memorySeen.clear();
}
