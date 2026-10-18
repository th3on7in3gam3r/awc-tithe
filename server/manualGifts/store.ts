/**
 * server/manualGifts/store.ts
 *
 * Person-to-person gifts (Zelle, Venmo, Cash App $cashtag) that no provider
 * webhook can confirm. Lifecycle:
 *
 *   initiated  — donor chose Zelle/Venmo and was shown a memo code
 *   submitted  — donor tapped "I've sent it" (still NOT money received)
 *   verified   — Finance matched it to the bank/Venmo statement and entered
 *                the provider's transaction ID → a completed donation is
 *                written, the DCB outbox row is queued, a receipt is sent
 *   rejected   — Finance could not find the payment
 *
 * Rules enforced here:
 *  - A donor action can never create a completed donation.
 *  - One provider transaction ID can be used once (unique index + the
 *    donations.transaction_id unique constraint as a second guard).
 *  - Verification, the donation write, the DCB outbox row and the audit
 *    entry commit together or not at all.
 */

import crypto from 'crypto';
import type pg from 'pg';
import { getPgPool } from '../auth/pgPool';
import { memoryStoreAllowed } from '../config';
import { ensureSchema } from '../db';
import { createGift } from '../gifts/store';
import { getFundById } from '../funds/store';
import { insertOutboxRow } from '../dcb/outbox';
import { buildVoucherNumber } from '../dcb/client';
import { dcbDonorDisplayName } from '../dcb/displayName';
import { writeActivityAudit } from '../audit/activity';
import { sendGiftReceiptEmail } from '../email/sendReceipt';
import { normalizeExternalRef } from '../../shared/externalRef';

export type ManualProvider = 'zelle' | 'venmo' | 'cash_app';
export type ManualGiftStatus = 'initiated' | 'submitted' | 'verified' | 'rejected';

export const MANUAL_PROVIDERS: ManualProvider[] = ['zelle', 'venmo', 'cash_app'];

export const PROVIDER_LABELS: Record<ManualProvider, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  cash_app: 'Cash App',
};

export interface ManualGift {
  id: string;
  memoCode: string;
  provider: ManualProvider;
  status: ManualGiftStatus;
  amount: number;
  fundId: string;
  fundName: string;
  fundCode: string;
  donorName: string;
  donorEmail: string;
  isAnonymous: boolean;
  donorReference: string;
  providerTransactionId: string | null;
  receivedAmount: number | null;
  receivedOn: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  donationId: string | null;
  createdAt: string;
  submittedAt: string | null;
  /** Another AWC app's reference (rsvp:<uuid>), when the donor came from one. */
  externalRef: string | null;
}

export interface Actor {
  userId: string;
  email: string;
  role: string;
  ipAddress: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string };

function fail(status: number, error: string, message: string): { ok: false; status: number; error: string; message: string } {
  return { ok: false, status, error, message };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const MANUAL_GIFTS_DDL = [
  `CREATE TABLE IF NOT EXISTS manual_gifts (
    id TEXT PRIMARY KEY,
    memo_code TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('zelle', 'venmo', 'cash_app')),
    status TEXT NOT NULL DEFAULT 'initiated'
      CHECK (status IN ('initiated', 'submitted', 'verified', 'rejected')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    fund_id TEXT NOT NULL,
    fund_name TEXT NOT NULL,
    fund_code TEXT NOT NULL DEFAULT '',
    donor_name TEXT NOT NULL,
    donor_email TEXT NOT NULL,
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    claim_token_hash TEXT,
    donor_reference TEXT NOT NULL DEFAULT '',
    provider_transaction_id TEXT,
    received_amount NUMERIC(12,2),
    received_on DATE,
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    donation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS manual_gifts_provider_txn_uq
     ON manual_gifts (provider, lower(provider_transaction_id))
     WHERE provider_transaction_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS manual_gifts_status_idx ON manual_gifts (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS manual_gifts_email_idx ON manual_gifts (donor_email)`,
  `ALTER TABLE manual_gifts ADD COLUMN IF NOT EXISTS external_ref TEXT`,
  `CREATE INDEX IF NOT EXISTS manual_gifts_external_ref_idx ON manual_gifts (external_ref) WHERE external_ref IS NOT NULL`,
];

let schemaPromise: Promise<void> | null = null;

export function ensureManualGiftsSchema(): Promise<void> {
  const pool = getPgPool();
  if (!pool) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of MANUAL_GIFTS_DDL) await pool.query(stmt);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** No 0/O/1/I/L — easy to read aloud and type into a memo field. */
const MEMO_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateMemoCode(): string {
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) code += MEMO_ALPHABET[bytes[i] % MEMO_ALPHABET.length];
  return `AWC-${code}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function tokensMatch(token: string, storedHash: string | null): boolean {
  if (!storedHash || !token) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Provider references: trimmed, inner whitespace removed, 3–80 safe characters. */
export function normalizeProviderReference(raw: unknown): string | null {
  const ref = String(raw ?? '').trim().replace(/\s+/g, '');
  if (ref.length < 3 || ref.length > 80) return null;
  if (!/^[A-Za-z0-9._:#\-]+$/.test(ref)) return null;
  return ref;
}

export function isManualProvider(value: unknown): value is ManualProvider {
  return typeof value === 'string' && (MANUAL_PROVIDERS as string[]).includes(value);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function validDateOnly(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Not in the future (allow one day of timezone slack)
  if (d.getTime() > Date.now() + 36 * 60 * 60 * 1000) return null;
  return s;
}

function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dateOnlyOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function mapRow(row: Record<string, unknown>): ManualGift {
  return {
    id: String(row.id),
    memoCode: String(row.memo_code),
    provider: String(row.provider) as ManualProvider,
    status: String(row.status) as ManualGiftStatus,
    amount: Number(row.amount),
    fundId: String(row.fund_id),
    fundName: String(row.fund_name),
    fundCode: String(row.fund_code || ''),
    donorName: String(row.donor_name),
    donorEmail: String(row.donor_email),
    isAnonymous: Boolean(row.is_anonymous),
    donorReference: String(row.donor_reference || ''),
    providerTransactionId: row.provider_transaction_id ? String(row.provider_transaction_id) : null,
    receivedAmount: row.received_amount != null ? Number(row.received_amount) : null,
    receivedOn: dateOnlyOrNull(row.received_on),
    verifiedBy: row.verified_by ? String(row.verified_by) : null,
    verifiedAt: isoOrNull(row.verified_at),
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    donationId: row.donation_id ? String(row.donation_id) : null,
    createdAt: isoOrNull(row.created_at) || new Date().toISOString(),
    submittedAt: isoOrNull(row.submitted_at),
    externalRef: row.external_ref ? String(row.external_ref) : null,
  };
}

function requirePoolOrMemory(): pg.Pool | null {
  const pool = getPgPool();
  if (!pool && !memoryStoreAllowed()) {
    throw new Error('DATABASE_URL is required unless DEV_MEMORY_STORE=true');
  }
  return pool;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '23505');
}

/** DCB payload — same shape as Stripe gifts, plus how the gift was verified. */
export function buildManualDcbPayload(input: {
  receiptNumber: string;
  donorName: string;
  donorEmail: string;
  isAnonymous: boolean;
  amount: number;
  fundCode: string;
  fundName: string;
  provider: ManualProvider;
  transactionId: string;
  providerTransactionId: string;
  contributedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  memoCode: string;
}): Record<string, unknown> {
  return {
    voucherNumber: buildVoucherNumber(input.receiptNumber),
    donorName: dcbDonorDisplayName({ isAnonymous: input.isAnonymous, donorName: input.donorName }),
    donorEmail: input.donorEmail,
    amount: input.amount,
    feeAmount: 0,
    netAmount: input.amount,
    fundCode: input.fundCode,
    fundName: input.fundName,
    paymentMethod: input.provider,
    transactionId: input.transactionId,
    contributedAt: input.contributedAt,
    source: 'awc-tithe-bridge',
    verification: {
      status: 'verified',
      method: 'finance_manual',
      providerReference: input.providerTransactionId,
      memoCode: input.memoCode,
      verifiedBy: input.verifiedBy,
      verifiedAt: input.verifiedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Memory store (dev/test only)
// ---------------------------------------------------------------------------

type MemoryRow = ManualGift & { claimTokenHash: string | null };
const memoryRows = new Map<string, MemoryRow>();

export function __resetManualGiftsMemoryForTests(): void {
  memoryRows.clear();
}

function memoryReferenceTaken(provider: ManualProvider, ref: string, exceptId?: string): boolean {
  for (const row of memoryRows.values()) {
    if (
      row.id !== exceptId &&
      row.provider === provider &&
      row.providerTransactionId &&
      row.providerTransactionId.toLowerCase() === ref.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

function stripSecret(row: MemoryRow): ManualGift {
  const { claimTokenHash: _omit, ...gift } = row;
  return { ...gift };
}

// ---------------------------------------------------------------------------
// Donor: start a gift (shows the memo code)
// ---------------------------------------------------------------------------

export async function createManualGift(input: {
  provider: ManualProvider;
  amount: number;
  fundId: string;
  donorName: string;
  donorEmail: string;
  isAnonymous: boolean;
  externalRef?: string | null;
}): Promise<Result<{ gift: ManualGift; claimToken: string }>> {
  const externalRef = normalizeExternalRef(input.externalRef);
  const amount = roundMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return fail(400, 'INVALID_AMOUNT', 'Enter a valid gift amount.');
  }
  const email = String(input.donorEmail || '').trim().toLowerCase();
  if (!isValidEmail(email)) return fail(400, 'EMAIL_REQUIRED', 'A valid email is needed for your receipt.');
  const name = String(input.donorName || '').trim().slice(0, 120);
  if (!name) return fail(400, 'NAME_REQUIRED', 'Your name is needed for your receipt.');
  const fund = await getFundById(String(input.fundId || ''));
  if (!fund || !fund.active) return fail(400, 'FUND_NOT_FOUND', 'Choose a fund to give to.');

  const claimToken = crypto.randomBytes(24).toString('base64url');
  const claimTokenHash = hashToken(claimToken);
  const pool = requirePoolOrMemory();

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = `mg-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const memoCode = generateMemoCode();
    if (!pool) {
      if ([...memoryRows.values()].some((r) => r.memoCode === memoCode)) continue;
      const row: MemoryRow = {
        id,
        memoCode,
        provider: input.provider,
        status: 'initiated',
        amount,
        fundId: fund.id,
        fundName: fund.name,
        fundCode: fund.glCode || '',
        donorName: name,
        donorEmail: email,
        isAnonymous: Boolean(input.isAnonymous),
        donorReference: '',
        providerTransactionId: null,
        receivedAmount: null,
        receivedOn: null,
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
        donationId: null,
        createdAt: new Date().toISOString(),
        submittedAt: null,
        externalRef,
        claimTokenHash,
      };
      memoryRows.set(id, row);
      return { ok: true, value: { gift: stripSecret(row), claimToken } };
    }
    try {
      await ensureManualGiftsSchema();
      const result = await pool.query(
        `INSERT INTO manual_gifts (
           id, memo_code, provider, amount, fund_id, fund_name, fund_code,
           donor_name, donor_email, is_anonymous, claim_token_hash, external_ref
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [id, memoCode, input.provider, amount, fund.id, fund.name, fund.glCode || '', name, email, Boolean(input.isAnonymous), claimTokenHash, externalRef]
      );
      return { ok: true, value: { gift: mapRow(result.rows[0]), claimToken } };
    } catch (err) {
      if (isUniqueViolation(err)) continue; // memo code collision — try another
      throw err;
    }
  }
  return fail(503, 'MEMO_CODE_UNAVAILABLE', 'Please try again.');
}

// ---------------------------------------------------------------------------
// Donor: "I've sent it" — moves to submitted, never to verified
// ---------------------------------------------------------------------------

export async function markManualGiftSubmitted(input: {
  id: string;
  claimToken: string;
  donorReference?: string;
}): Promise<Result<ManualGift>> {
  const reference = String(input.donorReference || '').trim().slice(0, 80);
  const pool = requirePoolOrMemory();
  if (!pool) {
    const row = memoryRows.get(input.id);
    if (!row || !tokensMatch(input.claimToken, row.claimTokenHash)) return fail(404, 'NOT_FOUND', 'Gift not found.');
    if (row.status === 'initiated') {
      row.status = 'submitted';
      row.submittedAt = new Date().toISOString();
    }
    if (reference && row.status === 'submitted') row.donorReference = reference;
    return { ok: true, value: stripSecret(row) };
  }
  await ensureManualGiftsSchema();
  const found = await pool.query('SELECT * FROM manual_gifts WHERE id = $1 LIMIT 1', [input.id]);
  const row = found.rows[0] as Record<string, unknown> | undefined;
  if (!row || !tokensMatch(input.claimToken, (row.claim_token_hash as string) || null)) {
    return fail(404, 'NOT_FOUND', 'Gift not found.');
  }
  const updated = await pool.query(
    `UPDATE manual_gifts SET
       status = CASE WHEN status = 'initiated' THEN 'submitted' ELSE status END,
       submitted_at = COALESCE(submitted_at, CASE WHEN status = 'initiated' THEN NOW() END),
       donor_reference = CASE WHEN status IN ('initiated', 'submitted') AND $2 <> '' THEN $2 ELSE donor_reference END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.id, reference]
  );
  return { ok: true, value: mapRow(updated.rows[0]) };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export type AdminFilter = 'open' | 'closed' | 'all';

export async function listManualGiftsForAdmin(filter: AdminFilter = 'open', limit = 200): Promise<ManualGift[]> {
  const statuses =
    filter === 'open' ? ['initiated', 'submitted'] : filter === 'closed' ? ['verified', 'rejected'] : ['initiated', 'submitted', 'verified', 'rejected'];
  const pool = requirePoolOrMemory();
  if (!pool) {
    return [...memoryRows.values()]
      .filter((r) => statuses.includes(r.status))
      .sort((a, b) => {
        // Submitted first, then newest
        if (a.status !== b.status && filter === 'open') return a.status === 'submitted' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, limit)
      .map(stripSecret);
  }
  await ensureManualGiftsSchema();
  const result = await pool.query(
    `SELECT * FROM manual_gifts
     WHERE status = ANY($1::text[])
     ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'initiated' THEN 1 ELSE 2 END, created_at DESC
     LIMIT $2`,
    [statuses, Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * Donor history: gifts they reported sending that Finance hasn't confirmed,
 * and ones Finance couldn't find. Verified gifts appear as normal donations.
 */
export async function listManualGiftsForDonor(email: string): Promise<ManualGift[]> {
  const normalized = email.trim().toLowerCase();
  const pool = requirePoolOrMemory();
  if (!pool) {
    return [...memoryRows.values()]
      .filter((r) => r.donorEmail === normalized && (r.status === 'submitted' || r.status === 'rejected'))
      .map(stripSecret);
  }
  await ensureManualGiftsSchema();
  const result = await pool.query(
    `SELECT * FROM manual_gifts
     WHERE donor_email = $1 AND status IN ('submitted', 'rejected')
     ORDER BY created_at DESC LIMIT 100`,
    [normalized]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Finance: verify (the ONLY path that creates a completed donation)
// ---------------------------------------------------------------------------

interface VerifyCore {
  provider: ManualProvider;
  memoCode: string;
  fundId: string;
  fundName: string;
  fundCode: string;
  donorName: string;
  donorEmail: string;
  isAnonymous: boolean;
  receivedAmount: number;
  receivedOn: string;
  providerTransactionId: string;
}

function donationTransactionId(provider: ManualProvider, ref: string): string {
  return `${provider}_${ref}`;
}

async function writeVerifiedDonation(
  client: pg.PoolClient | undefined,
  core: VerifyCore,
  actor: Actor
): Promise<{ donationId: string; transactionId: string; receiptNumber: string; inserted: boolean; verifiedAt: string; payload: Record<string, unknown> }> {
  const transactionId = donationTransactionId(core.provider, core.providerTransactionId);
  const contributedAt = `${core.receivedOn}T12:00:00.000Z`;
  const result = await createGift({
    amount: core.receivedAmount,
    feeCovered: false,
    frequency: 'one-time',
    fundId: core.fundId,
    fundName: core.fundName,
    fundCode: core.fundCode,
    donorName: core.donorName,
    donorEmail: core.donorEmail,
    paymentMethod: core.provider,
    isAnonymous: core.isAnonymous,
    transactionId,
    contributedAt,
    status: 'completed',
    pgClient: client,
  });
  const verifiedAt = new Date().toISOString();
  const payload = buildManualDcbPayload({
    receiptNumber: result.donation.receiptNumber,
    donorName: result.donation.donorName,
    donorEmail: result.donation.donorEmail,
    isAnonymous: core.isAnonymous,
    amount: result.donation.amount,
    fundCode: core.fundCode,
    fundName: core.fundName,
    provider: core.provider,
    transactionId,
    providerTransactionId: core.providerTransactionId,
    contributedAt,
    verifiedBy: actor.email,
    verifiedAt,
    memoCode: core.memoCode,
  });
  return {
    donationId: result.donation.id,
    transactionId,
    receiptNumber: result.donation.receiptNumber,
    inserted: result.inserted,
    verifiedAt,
    payload,
  };
}

export async function verifyManualGift(input: {
  id: string;
  providerTransactionId: unknown;
  receivedAmount: unknown;
  receivedOn: unknown;
  actor: Actor;
}): Promise<Result<ManualGift>> {
  const ref = normalizeProviderReference(input.providerTransactionId);
  if (!ref) {
    return fail(400, 'REFERENCE_REQUIRED', 'Enter the transaction or confirmation ID from the Zelle/Venmo record (3–80 letters or numbers).');
  }
  const receivedAmount = roundMoney(Number(input.receivedAmount));
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0 || receivedAmount > 1_000_000) {
    return fail(400, 'INVALID_AMOUNT', 'Enter the amount actually received.');
  }
  const receivedOn = validDateOnly(input.receivedOn);
  if (!receivedOn) return fail(400, 'INVALID_DATE', 'Enter the date the payment arrived (not in the future).');

  const pool = requirePoolOrMemory();

  if (!pool) {
    const row = memoryRows.get(input.id);
    if (!row) return fail(404, 'NOT_FOUND', 'Gift not found.');
    if (row.status === 'verified') return fail(409, 'ALREADY_VERIFIED', 'This gift was already verified.');
    if (row.status === 'rejected') return fail(409, 'ALREADY_REJECTED', 'This gift was rejected. Record the payment as a new gift instead.');
    if (memoryReferenceTaken(row.provider, ref, row.id)) {
      return fail(409, 'DUPLICATE_REFERENCE', 'That transaction ID is already recorded on another gift.');
    }
    const written = await writeVerifiedDonation(undefined, { ...row, receivedAmount, receivedOn, providerTransactionId: ref }, input.actor);
    if (!written.inserted) return fail(409, 'DUPLICATE_REFERENCE', 'That transaction ID is already recorded as a gift.');
    Object.assign(row, {
      status: 'verified' as const,
      providerTransactionId: ref,
      receivedAmount,
      receivedOn,
      verifiedBy: input.actor.email,
      verifiedAt: written.verifiedAt,
      donationId: written.donationId,
    });
    await writeActivityAudit({
      actorId: input.actor.userId,
      actorLabel: input.actor.email,
      actorRole: input.actor.role,
      action: 'MANUAL_GIFT_VERIFIED',
      resource: row.id,
      details: JSON.stringify({ provider: row.provider, reference: ref, amount: receivedAmount, memo: row.memoCode }),
      ipAddress: input.actor.ipAddress,
    });
    return { ok: true, value: stripSecret(row) };
  }

  await ensureSchema();
  await ensureManualGiftsSchema();
  const client = await pool.connect();
  let verified: ManualGift | null = null;
  let receiptTxn = '';
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM manual_gifts WHERE id = $1 FOR UPDATE', [input.id]);
    const raw = locked.rows[0] as Record<string, unknown> | undefined;
    if (!raw) {
      await client.query('ROLLBACK');
      return fail(404, 'NOT_FOUND', 'Gift not found.');
    }
    const row = mapRow(raw);
    if (row.status === 'verified') {
      await client.query('ROLLBACK');
      return fail(409, 'ALREADY_VERIFIED', 'This gift was already verified.');
    }
    if (row.status === 'rejected') {
      await client.query('ROLLBACK');
      return fail(409, 'ALREADY_REJECTED', 'This gift was rejected. Record the payment as a new gift instead.');
    }
    const dup = await client.query(
      `SELECT id FROM manual_gifts
       WHERE provider = $1 AND lower(provider_transaction_id) = lower($2) AND id <> $3 LIMIT 1`,
      [row.provider, ref, row.id]
    );
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return fail(409, 'DUPLICATE_REFERENCE', 'That transaction ID is already recorded on another gift.');
    }

    const written = await writeVerifiedDonation(client, { ...row, receivedAmount, receivedOn, providerTransactionId: ref }, input.actor);
    if (!written.inserted) {
      await client.query('ROLLBACK');
      return fail(409, 'DUPLICATE_REFERENCE', 'That transaction ID is already recorded as a gift.');
    }

    const updated = await client.query(
      `UPDATE manual_gifts SET
         status = 'verified', provider_transaction_id = $2, received_amount = $3, received_on = $4::date,
         verified_by = $5, verified_at = $6, donation_id = $7, claim_token_hash = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [row.id, ref, receivedAmount, receivedOn, input.actor.email, written.verifiedAt, written.donationId]
    );
    await insertOutboxRow(client, written.donationId, 'contribution', written.payload);
    await writeActivityAudit(
      {
        actorId: input.actor.userId,
        actorLabel: input.actor.email,
        actorRole: input.actor.role,
        action: 'MANUAL_GIFT_VERIFIED',
        resource: row.id,
        details: JSON.stringify({ provider: row.provider, reference: ref, amount: receivedAmount, memo: row.memoCode, donationId: written.donationId }),
        ipAddress: input.actor.ipAddress,
      },
      client
    );
    await client.query('COMMIT');
    verified = mapRow(updated.rows[0]);
    receiptTxn = written.transactionId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isUniqueViolation(err)) return fail(409, 'DUPLICATE_REFERENCE', 'That transaction ID is already recorded.');
    throw err;
  } finally {
    client.release();
  }

  void sendGiftReceiptEmail(receiptTxn).catch((err) => console.error('[manual-gifts] receipt', err));
  return { ok: true, value: verified };
}

// ---------------------------------------------------------------------------
// Finance: reject
// ---------------------------------------------------------------------------

export async function rejectManualGift(input: { id: string; reason: unknown; actor: Actor }): Promise<Result<ManualGift>> {
  const reason = String(input.reason ?? '').trim().slice(0, 300);
  if (reason.length < 3) return fail(400, 'REASON_REQUIRED', 'Add a short reason (for example, "No matching payment after 7 days").');
  const pool = requirePoolOrMemory();
  if (!pool) {
    const row = memoryRows.get(input.id);
    if (!row) return fail(404, 'NOT_FOUND', 'Gift not found.');
    if (row.status === 'verified') return fail(409, 'ALREADY_VERIFIED', 'A verified gift cannot be rejected. Refund it instead.');
    if (row.status === 'rejected') return fail(409, 'ALREADY_REJECTED', 'This gift was already rejected.');
    Object.assign(row, { status: 'rejected' as const, rejectionReason: reason, verifiedBy: input.actor.email, verifiedAt: new Date().toISOString(), claimTokenHash: null });
    await writeActivityAudit({
      actorId: input.actor.userId,
      actorLabel: input.actor.email,
      actorRole: input.actor.role,
      action: 'MANUAL_GIFT_REJECTED',
      resource: row.id,
      details: JSON.stringify({ provider: row.provider, memo: row.memoCode, reason }),
      ipAddress: input.actor.ipAddress,
    });
    return { ok: true, value: stripSecret(row) };
  }
  await ensureManualGiftsSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE manual_gifts SET status = 'rejected', rejection_reason = $2, verified_by = $3,
         verified_at = NOW(), claim_token_hash = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('initiated', 'submitted')
       RETURNING *`,
      [input.id, reason, input.actor.email]
    );
    if (!updated.rows.length) {
      const existing = await client.query('SELECT status FROM manual_gifts WHERE id = $1', [input.id]);
      await client.query('ROLLBACK');
      if (!existing.rows.length) return fail(404, 'NOT_FOUND', 'Gift not found.');
      return existing.rows[0].status === 'verified'
        ? fail(409, 'ALREADY_VERIFIED', 'A verified gift cannot be rejected. Refund it instead.')
        : fail(409, 'ALREADY_REJECTED', 'This gift was already rejected.');
    }
    const row = mapRow(updated.rows[0]);
    await writeActivityAudit(
      {
        actorId: input.actor.userId,
        actorLabel: input.actor.email,
        actorRole: input.actor.role,
        action: 'MANUAL_GIFT_REJECTED',
        resource: row.id,
        details: JSON.stringify({ provider: row.provider, memo: row.memoCode, reason }),
        ipAddress: input.actor.ipAddress,
      },
      client
    );
    await client.query('COMMIT');
    return { ok: true, value: row };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Finance: record a payment that arrived without going through the site
// ---------------------------------------------------------------------------

export async function recordVerifiedManualGift(input: {
  provider: unknown;
  fundId: unknown;
  donorName: unknown;
  donorEmail: unknown;
  isAnonymous?: unknown;
  providerTransactionId: unknown;
  receivedAmount: unknown;
  receivedOn: unknown;
  actor: Actor;
}): Promise<Result<ManualGift>> {
  if (!isManualProvider(input.provider)) return fail(400, 'INVALID_PROVIDER', 'Choose Zelle, Venmo, or Cash App.');
  const receivedAmount = roundMoney(Number(input.receivedAmount));
  const created = await createManualGift({
    provider: input.provider,
    amount: receivedAmount,
    fundId: String(input.fundId || ''),
    donorName: String(input.donorName || ''),
    donorEmail: String(input.donorEmail || ''),
    isAnonymous: input.isAnonymous === true || input.isAnonymous === 'true',
  });
  if (!created.ok) return created;
  const result = await verifyManualGift({
    id: created.value.gift.id,
    providerTransactionId: input.providerTransactionId,
    receivedAmount,
    receivedOn: input.receivedOn,
    actor: input.actor,
  });
  if (!result.ok) {
    // Don't leave an orphan placeholder behind when verification is refused.
    await discardInitiated(created.value.gift.id);
  }
  return result;
}

async function discardInitiated(id: string): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    const row = memoryRows.get(id);
    if (row?.status === 'initiated') memoryRows.delete(id);
    return;
  }
  await pool.query(`DELETE FROM manual_gifts WHERE id = $1 AND status = 'initiated'`, [id]);
}

// ---------------------------------------------------------------------------
// External references (AWC Vault RSVPs)
// ---------------------------------------------------------------------------

/** Manual gifts started for any of these references, newest first. */
export async function listManualGiftsByExternalRefs(refs: string[]): Promise<ManualGift[]> {
  if (!refs.length) return [];
  const pool = getPgPool();
  if (!pool) {
    return [...memoryRows.values()]
      .filter((r) => r.externalRef && refs.includes(r.externalRef))
      .map(stripSecret)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  await ensureManualGiftsSchema();
  const result = await pool.query(
    `SELECT * FROM manual_gifts WHERE external_ref = ANY($1::text[]) ORDER BY created_at DESC`,
    [refs]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}
