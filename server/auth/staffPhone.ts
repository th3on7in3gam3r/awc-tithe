/**
 * Staff Portal: a staff member's own mobile number for sign-in codes by text.
 * Saved only after a code texted to it is confirmed while signed in (and past
 * the authenticator step, when they use one). Kept apart from donor phones.
 */
import { getPgPool } from './pgPool';
import { memoryStoreAllowed } from '../config';

export type StaffPhone = { userId: string; email: string; phone: string; pendingPhone: string | null; verifiedAt: string | null };

const DDL = [
  `CREATE TABLE IF NOT EXISTS staff_sms_phones (
     user_id TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     phone TEXT,
     pending_phone TEXT,
     verified_at TIMESTAMPTZ,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS staff_sms_phones_phone_key ON staff_sms_phones (phone) WHERE phone IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS staff_sms_phones_email_idx ON staff_sms_phones (LOWER(email))`,
];

let schemaPromise: Promise<void> | null = null;
export function ensureStaffPhoneSchema(): Promise<void> {
  const pool = getPgPool();
  if (!pool) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of DDL) await pool.query(stmt);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

const mem = new Map<string, StaffPhone>();
export function __resetStaffPhonesForTests(): void {
  mem.clear();
}

function pool() {
  const p = getPgPool();
  if (!p && !memoryStoreAllowed()) throw new Error('DATABASE_URL is required');
  return p;
}

function mapRow(r: any): StaffPhone {
  return {
    userId: r.user_id,
    email: r.email,
    phone: r.phone || '',
    pendingPhone: r.pending_phone || null,
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
  };
}

export async function getStaffPhone(userId: string): Promise<StaffPhone | null> {
  const p = pool();
  if (!p) return mem.get(userId) ?? null;
  await ensureStaffPhoneSchema();
  const r = await p.query('SELECT * FROM staff_sms_phones WHERE user_id = $1', [userId]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Confirmed number for a staff email (sign-in by text), or null. */
export async function getVerifiedPhoneForEmail(email: string): Promise<StaffPhone | null> {
  const e = email.trim().toLowerCase();
  const p = pool();
  if (!p) {
    for (const row of mem.values()) if (row.email === e && row.phone && row.verifiedAt) return row;
    return null;
  }
  await ensureStaffPhoneSchema();
  const r = await p.query(
    'SELECT * FROM staff_sms_phones WHERE LOWER(email) = $1 AND phone IS NOT NULL AND verified_at IS NOT NULL LIMIT 1',
    [e]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function phoneUsedByOtherStaff(phone: string, userId: string): Promise<boolean> {
  const p = pool();
  if (!p) return [...mem.values()].some((r) => r.phone === phone && r.userId !== userId);
  await ensureStaffPhoneSchema();
  const r = await p.query('SELECT 1 FROM staff_sms_phones WHERE phone = $1 AND user_id <> $2 LIMIT 1', [phone, userId]);
  return r.rows.length > 0;
}

export async function setPendingStaffPhone(userId: string, email: string, phone: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const p = pool();
  if (!p) {
    const cur = mem.get(userId);
    mem.set(userId, { userId, email: e, phone: cur?.phone || '', verifiedAt: cur?.verifiedAt || null, pendingPhone: phone });
    return;
  }
  await ensureStaffPhoneSchema();
  await p.query(
    `INSERT INTO staff_sms_phones (user_id, email, pending_phone) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, pending_phone = EXCLUDED.pending_phone, updated_at = NOW()`,
    [userId, e, phone]
  );
}

export async function confirmStaffPhone(userId: string): Promise<string | null> {
  const p = pool();
  if (!p) {
    const cur = mem.get(userId);
    if (!cur?.pendingPhone) return null;
    const phone = cur.pendingPhone;
    mem.set(userId, { ...cur, phone, pendingPhone: null, verifiedAt: new Date().toISOString() });
    return phone;
  }
  await ensureStaffPhoneSchema();
  const r = await p.query(
    `UPDATE staff_sms_phones SET phone = pending_phone, pending_phone = NULL, verified_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND pending_phone IS NOT NULL RETURNING phone`,
    [userId]
  );
  return r.rows[0]?.phone || null;
}

export async function removeStaffPhone(userId: string): Promise<void> {
  const p = pool();
  if (!p) {
    mem.delete(userId);
    return;
  }
  await ensureStaffPhoneSchema();
  await p.query('DELETE FROM staff_sms_phones WHERE user_id = $1', [userId]);
}
