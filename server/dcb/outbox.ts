/**
 * server/dcb/outbox.ts
 *
 * Low-level DB helpers for the dcb_outbox table.
 * No HTTP calls live here — only SQL.
 *
 * Caller note: insertOutboxRow() accepts a NeonQueryFunction (the HTTP
 * client used for most queries) OR a pg.PoolClient (used inside the
 * Stripe webhook transaction so the outbox insert is atomic with the
 * donation write). Both expose a tagged-template query interface.
 */

import type pg from 'pg';
import { getSql } from '../db';
import { getPgPool } from '../auth/pgPool';
import { buildVoucherNumber } from './client';
import { dcbDonorDisplayName } from './displayName';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutboxEventType = 'contribution' | 'refund';

export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'needs_review';

export interface DcbOutboxRow {
  id: string;
  donationId: string;
  eventType: OutboxEventType;
  /** Full payload that will be (or was) sent to DCB. */
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  dcbVoucherId: string | null;
  createdAt: string;
}

/** Enriched row used by the admin retry panel (joined to donations). */
export interface DcbOutboxAdminRow extends DcbOutboxRow {
  donorName: string;
  amount: number;
  fundName: string;
  /** ISO timestamp of the donation's contributed_at */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Backoff schedule (indices map to attempt count, capped at last entry)
// ---------------------------------------------------------------------------

const BACKOFF_MINUTES = [1, 5, 30, 120, 720, 720, 720];

/** `failedAttemptCount` is how many failures have already been recorded (0 after the first fail). */
export function nextAttemptMinutes(failedAttemptCount: number): number {
  const idx = Math.min(Math.max(failedAttemptCount, 0), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx];
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): DcbOutboxRow {
  return {
    id: String(row.id),
    donationId: String(row.donation_id),
    eventType: String(row.event_type) as OutboxEventType,
    payload:
      typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {},
    status: String(row.status) as OutboxStatus,
    attempts: Number(row.attempts || 0),
    lastError: row.last_error ? String(row.last_error) : null,
    nextAttemptAt: row.next_attempt_at
      ? new Date(String(row.next_attempt_at)).toISOString()
      : new Date().toISOString(),
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    dcbVoucherId: row.dcb_voucher_id ? String(row.dcb_voucher_id) : null,
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  };
}

function mapAdminRow(row: Record<string, unknown>): DcbOutboxAdminRow {
  return {
    ...mapRow(row),
    payload: {},
    donorName: String(row.donor_name || 'Unknown'),
    amount: Number(row.amount || 0),
    fundName: String(row.fund_name || ''),
    timestamp: row.contributed_at
      ? new Date(String(row.contributed_at)).toISOString()
      : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// INSERT — idempotent (ON CONFLICT DO NOTHING)
// ---------------------------------------------------------------------------

/**
 * Insert an outbox row inside an existing pg.PoolClient transaction so the
 * write is atomic with the donation row.
 *
 * Uses parameterised query (pg.PoolClient) rather than the Neon HTTP client
 * to work inside a BEGIN/COMMIT block.
 */
export async function insertOutboxRow(
  client: pg.PoolClient,
  donationId: string,
  eventType: OutboxEventType,
  payload: Record<string, unknown>,
  initialStatus: OutboxStatus = 'pending'
): Promise<{ inserted: boolean }> {
  const id = `dcb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const conflictSql =
    eventType === 'refund'
      ? `ON CONFLICT (donation_id, event_type) DO UPDATE SET payload = EXCLUDED.payload`
      : `ON CONFLICT (donation_id, event_type) DO NOTHING`;
  const result = await client.query(
    `INSERT INTO dcb_outbox (id, donation_id, event_type, payload, status)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ${conflictSql}
     RETURNING id`,
    [id, donationId, eventType, JSON.stringify(payload), initialStatus]
  );
  return { inserted: (result.rowCount ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Worker claims — SELECT FOR UPDATE SKIP LOCKED
// ---------------------------------------------------------------------------

/**
 * Atomically claim up to `limit` pending/failed rows whose next_attempt_at
 * has arrived. Returns them locked inside the provided pg.PoolClient so the
 * caller MUST update and commit (or rollback) before releasing the client.
 */
export async function claimPendingRows(
  client: pg.PoolClient,
  limit = 5
): Promise<DcbOutboxRow[]> {
  const result = await client.query(
    `SELECT * FROM dcb_outbox
     WHERE status = 'pending'
       AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function markOutboxSent(
  client: pg.PoolClient,
  id: string,
  dcbVoucherId: string
): Promise<void> {
  await client.query(
    `UPDATE dcb_outbox
     SET status = 'sent',
         sent_at = NOW(),
         dcb_voucher_id = $2,
         last_error = NULL,
         attempts = attempts + 1
     WHERE id = $1`,
    [id, dcbVoucherId]
  );
}

/**
 * Mark an attempt as failed.
 * @param nextAttemptAt - ISO string for next retry, or null to set terminal 'failed'
 */
export async function markOutboxFailed(
  client: pg.PoolClient,
  id: string,
  error: string,
  nextAttemptAt: string | null
): Promise<void> {
  const terminal = nextAttemptAt === null;
  await client.query(
    `UPDATE dcb_outbox
     SET status = $2,
         last_error = $3,
         next_attempt_at = COALESCE($4::timestamptz, next_attempt_at),
         attempts = attempts + 1
     WHERE id = $1`,
    [id, terminal ? 'failed' : 'pending', error.slice(0, 2000), nextAttemptAt]
  );
}

export async function setOutboxNeedsReview(
  client: pg.PoolClient,
  id: string,
  error: string
): Promise<void> {
  await client.query(
    `UPDATE dcb_outbox
     SET status = 'needs_review',
         last_error = $2,
         attempts = attempts + 1
     WHERE id = $1`,
    [id, error.slice(0, 2000)]
  );
}

// ---------------------------------------------------------------------------
// Admin retry — resets the row so the worker picks it up again
// ---------------------------------------------------------------------------

/**
 * Re-queue an existing outbox row for immediate retry.
 * Returns false if the row was not found.
 */
function payloadFromDonation(
  eventType: OutboxEventType,
  donation: Record<string, unknown>
): Record<string, unknown> {
  const receiptNumber = String(donation.receipt_number || '');
  const transactionId = String(donation.transaction_id || '');
  const amount = Number(donation.amount || 0);
  const feeAmount = Number(donation.fee_amount || 0);
  if (eventType === 'refund') {
    return {
      voucherNumber: buildVoucherNumber(receiptNumber),
      transactionId,
      refundedAt: new Date().toISOString(),
      refundAmount: amount,
      source: 'awc-tithe-bridge',
    };
  }
  return {
    voucherNumber: buildVoucherNumber(receiptNumber),
    donorName: dcbDonorDisplayName({
      isAnonymous: Boolean(donation.is_anonymous),
      donorName: donation.donor_name ? String(donation.donor_name) : '',
    }),
    donorEmail: String(donation.donor_email || ''),
    amount,
    feeAmount,
    netAmount: Math.max(0, amount - feeAmount),
    fundCode: String(donation.fund_code || ''),
    fundName: String(donation.fund_name || ''),
    paymentMethod: String(donation.payment_method || ''),
    transactionId,
    contributedAt: donation.contributed_at
      ? new Date(String(donation.contributed_at)).toISOString()
      : new Date().toISOString(),
    source: 'awc-tithe-bridge',
  };
}

export async function requeueOutboxRow(id: string): Promise<{ found: boolean; row: DcbOutboxRow | null }> {
  const pool = getPgPool();
  if (!pool) {
    return { found: false, row: null };
  }
  const existing = await pool.query('SELECT * FROM dcb_outbox WHERE id = $1 LIMIT 1', [id]);
  if ((existing.rowCount ?? 0) === 0) return { found: false, row: null };
  const current = existing.rows[0] as Record<string, unknown>;
  const eventType = String(current.event_type) as OutboxEventType;
  const donationId = String(current.donation_id);
  const donation = await pool.query('SELECT * FROM donations WHERE id = $1 LIMIT 1', [donationId]);
  if ((donation.rowCount ?? 0) === 0) {
    throw new Error('DONATION_NOT_FOUND');
  }
  const payload = payloadFromDonation(eventType, donation.rows[0] as Record<string, unknown>);
  const result = await pool.query(
    `UPDATE dcb_outbox
     SET status = 'pending',
         attempts = 0,
         last_error = NULL,
         next_attempt_at = NOW(),
         payload = $2::jsonb
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(payload)]
  );
  if ((result.rowCount ?? 0) === 0) return { found: false, row: null };
  return { found: true, row: mapRow(result.rows[0] as Record<string, unknown>) };
}

// ---------------------------------------------------------------------------
// Admin list — failed + needs_review, joined to donations
// ---------------------------------------------------------------------------

export async function listFailedAndNeedsReview(limit = 200): Promise<DcbOutboxAdminRow[]> {
  const pool = getPgPool();
  if (!pool) {
    // Memory mode — return empty; no outbox rows can exist without Postgres
    return [];
  }
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const result = await pool.query(
    `SELECT
       o.*,
       d.donor_name,
       d.amount,
       d.fund_name,
       d.contributed_at
     FROM dcb_outbox o
     LEFT JOIN donations d ON d.id = o.donation_id
     WHERE o.status IN ('failed', 'needs_review')
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((r) => mapAdminRow(r as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Lookup by id (used by the retry route to validate the row exists)
// ---------------------------------------------------------------------------

export async function getOutboxRowById(id: string): Promise<DcbOutboxRow | null> {
  const sql = getSql();
  if (sql) {
    const rows = await sql`
      SELECT * FROM dcb_outbox WHERE id = ${id} LIMIT 1
    `;
    if (!rows.length) return null;
    return mapRow(rows[0] as Record<string, unknown>);
  }
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query('SELECT * FROM dcb_outbox WHERE id = $1 LIMIT 1', [id]);
  if (!result.rows.length) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}
