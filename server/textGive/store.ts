/**
 * Text-an-amount giving (Pastor's request): after a one-time setup, a member
 * texts an amount (e.g. "50") to the giving number and their saved card is
 * charged to the church's Stripe account — Tithes & Offerings.
 *
 * Tables
 *   text_givers       phone → Stripe customer + saved card + fee choice
 *   text_give_links   one-time setup links (hashed token, phone, amount, expiry)
 *   text_give_pending gifts over the instant limit waiting for a YES reply
 *
 * Postgres in production; an in-memory copy for local dev and tests.
 */
import crypto from 'crypto';
import { getPgPool } from '../auth/pgPool';
import { memoryStoreAllowed } from '../config';

/** How a text gift is paid. Card and bank are charged automatically; the others send a ready-to-tap link. */
export type TextGiveMethod = 'card' | 'us_bank_account' | 'cash_app' | 'venmo' | 'zelle';
export const TEXT_GIVE_METHODS: TextGiveMethod[] = ['card', 'us_bank_account', 'cash_app', 'venmo', 'zelle'];
export const AUTO_CHARGE_METHODS: TextGiveMethod[] = ['card', 'us_bank_account'];

export function isTextGiveMethod(v: unknown): v is TextGiveMethod {
  return TEXT_GIVE_METHODS.includes(v as TextGiveMethod);
}

export type TextGiver = {
  phone: string;
  method: TextGiveMethod;
  stripeCustomerId: string;
  paymentMethodId: string;
  cardBrand: string;
  cardLast4: string;
  donorName: string;
  donorEmail: string;
  coverFees: boolean;
  createdAt: string;
};

export type TextGiveLink = {
  id: string;
  phone: string;
  /** Gift to make at setup; 0 = save a new card only (CHANGE). */
  amountCents: number;
  /** Fund the first gift goes to (the word after the amount). */
  fundId: string;
  expiresAt: string;
  usedAt: string | null;
};

export type PendingTextGift = { phone: string; amountCents: number; fundId: string; expiresAt: string };

export const LINK_TTL_MS = 30 * 60 * 1000;
export const PENDING_TTL_MS = 10 * 60 * 1000;

const DDL = [
  `CREATE TABLE IF NOT EXISTS text_givers (
     phone TEXT PRIMARY KEY,
     stripe_customer_id TEXT NOT NULL,
     payment_method_id TEXT NOT NULL,
     card_brand TEXT NOT NULL DEFAULT '',
     card_last4 TEXT NOT NULL DEFAULT '',
     donor_name TEXT NOT NULL DEFAULT '',
     donor_email TEXT NOT NULL DEFAULT '',
     cover_fees BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE text_givers ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'card'`,
  `CREATE TABLE IF NOT EXISTS text_give_links (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     phone TEXT NOT NULL,
     amount_cents INTEGER NOT NULL DEFAULT 0,
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE text_give_links ADD COLUMN IF NOT EXISTS fund_id TEXT NOT NULL DEFAULT 'fund-tithes'`,
  `CREATE INDEX IF NOT EXISTS text_give_links_phone_idx ON text_give_links (phone, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS text_give_charges (
     id BIGSERIAL PRIMARY KEY,
     phone TEXT NOT NULL,
     amount_cents INTEGER NOT NULL,
     payment_intent_id TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS text_give_charges_phone_idx ON text_give_charges (phone, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS text_give_pending (
     phone TEXT PRIMARY KEY,
     amount_cents INTEGER NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL
   )`,
  `ALTER TABLE text_give_pending ADD COLUMN IF NOT EXISTS fund_id TEXT NOT NULL DEFAULT 'fund-tithes'`,
];

let schemaPromise: Promise<void> | null = null;
export function ensureTextGiveSchema(): Promise<void> {
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

// ---- memory (dev / tests) --------------------------------------------------
const memGivers = new Map<string, TextGiver>();
const memLinks = new Map<string, TextGiveLink & { tokenHash: string }>();
const memPending = new Map<string, PendingTextGift>();
const memCharges: Array<{ phone: string; amountCents: number; paymentIntentId: string; at: number }> = [];

export function __resetTextGiveMemoryForTests(): void {
  memGivers.clear();
  memLinks.clear();
  memPending.clear();
  memCharges.length = 0;
}

function pool() {
  const p = getPgPool();
  if (!p && !memoryStoreAllowed()) throw new Error('DATABASE_URL is required for text giving');
  return p;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(`awc-text-give:${token}`).digest('hex');
}

function mapGiver(r: any): TextGiver {
  return {
    phone: r.phone,
    method: isTextGiveMethod(r.method) ? r.method : 'card',
    stripeCustomerId: r.stripe_customer_id,
    paymentMethodId: r.payment_method_id,
    cardBrand: r.card_brand || '',
    cardLast4: r.card_last4 || '',
    donorName: r.donor_name || '',
    donorEmail: r.donor_email || '',
    coverFees: Boolean(r.cover_fees),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function getGiver(phone: string): Promise<TextGiver | null> {
  const p = pool();
  if (!p) return memGivers.get(phone) ?? null;
  await ensureTextGiveSchema();
  const r = await p.query('SELECT * FROM text_givers WHERE phone = $1', [phone]);
  return r.rows[0] ? mapGiver(r.rows[0]) : null;
}

export async function saveGiver(g: Omit<TextGiver, 'createdAt'>): Promise<void> {
  const p = pool();
  if (!p) {
    memGivers.set(g.phone, { ...g, createdAt: memGivers.get(g.phone)?.createdAt ?? new Date().toISOString() });
    return;
  }
  await ensureTextGiveSchema();
  await p.query(
    `INSERT INTO text_givers (phone, stripe_customer_id, payment_method_id, card_brand, card_last4, donor_name, donor_email, cover_fees, method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (phone) DO UPDATE SET
       method = EXCLUDED.method,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       payment_method_id = EXCLUDED.payment_method_id,
       card_brand = EXCLUDED.card_brand,
       card_last4 = EXCLUDED.card_last4,
       donor_name = EXCLUDED.donor_name,
       donor_email = EXCLUDED.donor_email,
       cover_fees = EXCLUDED.cover_fees,
       updated_at = NOW()`,
    [g.phone, g.stripeCustomerId, g.paymentMethodId, g.cardBrand, g.cardLast4, g.donorName, g.donorEmail, g.coverFees, g.method]
  );
}

export async function removeGiver(phone: string): Promise<boolean> {
  const p = pool();
  if (!p) return memGivers.delete(phone);
  await ensureTextGiveSchema();
  const r = await p.query('DELETE FROM text_givers WHERE phone = $1', [phone]);
  return (r.rowCount ?? 0) > 0;
}

/** New one-time setup link; returns the raw token (only its hash is stored). */
export async function createLink(
  phone: string,
  amountCents: number,
  now = Date.now(),
  fundId = 'fund-tithes'
): Promise<{ token: string; link: TextGiveLink }> {
  const token = crypto.randomBytes(24).toString('base64url');
  const link: TextGiveLink = {
    id: crypto.randomUUID(),
    phone,
    amountCents,
    fundId,
    expiresAt: new Date(now + LINK_TTL_MS).toISOString(),
    usedAt: null,
  };
  const p = pool();
  if (!p) {
    memLinks.set(link.id, { ...link, tokenHash: hashToken(token) });
    return { token, link };
  }
  await ensureTextGiveSchema();
  await p.query(
    'INSERT INTO text_give_links (id, token_hash, phone, amount_cents, expires_at, fund_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [link.id, hashToken(token), phone, amountCents, link.expiresAt, fundId]
  );
  return { token, link };
}

/** The link for a token if it is unused and not expired. */
export async function findOpenLink(token: string, now = Date.now()): Promise<TextGiveLink | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const hash = hashToken(token);
  let link: TextGiveLink | null = null;
  const p = pool();
  if (!p) {
    for (const l of memLinks.values()) if (l.tokenHash === hash) link = l;
  } else {
    await ensureTextGiveSchema();
    const r = await p.query('SELECT * FROM text_give_links WHERE token_hash = $1', [hash]);
    const row = r.rows[0];
    if (row) {
      link = {
        id: row.id,
        phone: row.phone,
        amountCents: Number(row.amount_cents),
        fundId: String(row.fund_id || 'fund-tithes'),
        expiresAt: new Date(row.expires_at).toISOString(),
        usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
      };
    }
  }
  if (!link || link.usedAt || Date.parse(link.expiresAt) < now) return null;
  return link;
}

/** Marks a link used; false if it was already used (so setup completes once). */
export async function useLink(id: string): Promise<boolean> {
  const p = pool();
  if (!p) {
    const l = memLinks.get(id);
    if (!l || l.usedAt) return false;
    l.usedAt = new Date().toISOString();
    return true;
  }
  const r = await p.query('UPDATE text_give_links SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Setup links sent to a number in the last hour (limits link texts to strangers). */
export async function countRecentLinks(phone: string, now = Date.now()): Promise<number> {
  const since = now - 60 * 60 * 1000;
  const p = pool();
  if (!p) {
    return [...memLinks.values()].filter((l) => l.phone === phone && Date.parse(l.expiresAt) - LINK_TTL_MS >= since).length;
  }
  await ensureTextGiveSchema();
  const r = await p.query(
    'SELECT count(*)::int AS n FROM text_give_links WHERE phone = $1 AND created_at >= $2',
    [phone, new Date(since).toISOString()]
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function setPending(phone: string, amountCents: number, now = Date.now(), fundId = 'fund-tithes'): Promise<void> {
  const expiresAt = new Date(now + PENDING_TTL_MS).toISOString();
  const p = pool();
  if (!p) {
    memPending.set(phone, { phone, amountCents, fundId, expiresAt });
    return;
  }
  await ensureTextGiveSchema();
  await p.query(
    `INSERT INTO text_give_pending (phone, amount_cents, expires_at, fund_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, expires_at = EXCLUDED.expires_at, fund_id = EXCLUDED.fund_id`,
    [phone, amountCents, expiresAt, fundId]
  );
}

/** Takes (and clears) the gift waiting for YES, if it hasn't expired. */
export async function takePending(phone: string, now = Date.now()): Promise<PendingTextGift | null> {
  const p = pool();
  let row: PendingTextGift | null = null;
  if (!p) {
    row = memPending.get(phone) ?? null;
    memPending.delete(phone);
  } else {
    await ensureTextGiveSchema();
    const r = await p.query('DELETE FROM text_give_pending WHERE phone = $1 RETURNING *', [phone]);
    const x = r.rows[0];
    if (x) row = { phone: x.phone, amountCents: Number(x.amount_cents), fundId: String(x.fund_id || 'fund-tithes'), expiresAt: new Date(x.expires_at).toISOString() };
  }
  if (!row || Date.parse(row.expiresAt) < now) return null;
  return row;
}

/** Every successful text charge (audit trail + daily instant-gift limit). */
export async function recordCharge(phone: string, amountCents: number, paymentIntentId: string, now = Date.now()): Promise<void> {
  const p = pool();
  if (!p) {
    memCharges.push({ phone, amountCents, paymentIntentId, at: now });
    return;
  }
  await ensureTextGiveSchema();
  await p.query(
    'INSERT INTO text_give_charges (phone, amount_cents, payment_intent_id) VALUES ($1, $2, $3)',
    [phone, amountCents, paymentIntentId]
  );
}

export async function countChargesToday(phone: string, now = Date.now()): Promise<number> {
  const since = now - 24 * 60 * 60 * 1000;
  const p = pool();
  if (!p) return memCharges.filter((c) => c.phone === phone && c.at >= since).length;
  await ensureTextGiveSchema();
  const r = await p.query(
    'SELECT count(*)::int AS n FROM text_give_charges WHERE phone = $1 AND created_at >= $2',
    [phone, new Date(since).toISOString()]
  );
  return Number(r.rows[0]?.n ?? 0);
}
