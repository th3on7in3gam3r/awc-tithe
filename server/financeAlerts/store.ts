/**
 * Extra people who get Tithe's finance emails (e.g. "Check Zelle: … says they sent $50"),
 * on top of every active Tithe admin. Managed by admins in Integrations & Settings.
 * Never shown on any public endpoint.
 */
import { getSql } from '../db';

export type FinanceAlertRecipient = { email: string; name: string; addedBy: string; addedAt: string };

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const memory = new Map<string, FinanceAlertRecipient>();
let ready = false;

export function normalizeAlertEmail(raw: unknown): string | null {
  const e = String(raw || '').trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 200 ? e : null;
}

async function ensureTable(): Promise<void> {
  const client = getSql();
  if (!client || ready) return;
  await client`
    CREATE TABLE IF NOT EXISTS finance_alert_recipients (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      added_by TEXT NOT NULL DEFAULT '',
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  ready = true;
}

export async function listFinanceAlertRecipients(): Promise<FinanceAlertRecipient[]> {
  const client = getSql();
  if (!client) return [...memory.values()].sort((a, b) => a.email.localeCompare(b.email));
  await ensureTable();
  const rows = await client`SELECT email, name, added_by, added_at FROM finance_alert_recipients ORDER BY email`;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      email: String(row.email),
      name: String(row.name || ''),
      addedBy: String(row.added_by || ''),
      addedAt: new Date(String(row.added_at)).toISOString(),
    };
  });
}

export async function addFinanceAlertRecipient(input: {
  email: string;
  name?: string;
  addedBy: string;
}): Promise<FinanceAlertRecipient> {
  const email = normalizeAlertEmail(input.email);
  if (!email) throw new Error('INVALID_EMAIL');
  const name = String(input.name || '').trim().slice(0, 80);
  const rec: FinanceAlertRecipient = { email, name, addedBy: input.addedBy, addedAt: new Date().toISOString() };
  const client = getSql();
  if (!client) {
    memory.set(email, rec);
    return rec;
  }
  await ensureTable();
  await client`
    INSERT INTO finance_alert_recipients (email, name, added_by)
    VALUES (${email}, ${name}, ${input.addedBy})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  `;
  return rec;
}

export async function removeFinanceAlertRecipient(rawEmail: string): Promise<boolean> {
  const email = normalizeAlertEmail(rawEmail);
  if (!email) return false;
  const client = getSql();
  if (!client) return memory.delete(email);
  await ensureTable();
  const rows = await client`DELETE FROM finance_alert_recipients WHERE email = ${email} RETURNING email`;
  return rows.length > 0;
}

export function __resetFinanceAlertsForTests(): void {
  memory.clear();
}
