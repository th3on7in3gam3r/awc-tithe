/**
 * server/externalRefs/store.ts
 *
 * Links a Stripe PaymentIntent to another AWC app's reference (rsvp:<uuid>)
 * and answers "was this reference paid?".
 *
 * "Paid" only ever comes from rows that the existing safeguards wrote:
 *  - a completed donation, which only the verified Stripe webhook writes, or
 *  - a manual (Zelle / Venmo / Cash App) gift Finance verified.
 * Opening a link, starting checkout or tapping "I've sent it" never counts.
 */

import { getPgPool } from '../auth/pgPool';
import { getGiftByTransactionId, type StoredDonation } from '../gifts/store';
import { listManualGiftsByExternalRefs, type ManualGift } from '../manualGifts/store';
import { normalizeExternalRef } from '../../shared/externalRef';

export const EXTERNAL_REFS_DDL = [
  `CREATE TABLE IF NOT EXISTS gift_external_refs (
    transaction_id TEXT PRIMARY KEY,
    external_ref TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS gift_external_refs_ref_idx ON gift_external_refs (external_ref)`,
];

let schemaPromise: Promise<void> | null = null;
const memoryLinks = new Map<string, string>(); // transactionId -> ref

export function ensureExternalRefsSchema(): Promise<void> {
  const pool = getPgPool();
  if (!pool) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of EXTERNAL_REFS_DDL) await pool.query(stmt);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

export function __resetExternalRefsMemoryForTests(): void {
  memoryLinks.clear();
}

/** Remember which reference a PaymentIntent was created for. Idempotent. */
export async function linkTransactionToRef(transactionId: string, rawRef: unknown): Promise<void> {
  const ref = normalizeExternalRef(rawRef);
  const txId = String(transactionId || '').trim();
  if (!ref || !txId) return;
  const pool = getPgPool();
  if (!pool) {
    memoryLinks.set(txId, ref);
    return;
  }
  await ensureExternalRefsSchema();
  await pool.query(
    `INSERT INTO gift_external_refs (transaction_id, external_ref)
     VALUES ($1, $2)
     ON CONFLICT (transaction_id) DO NOTHING`,
    [txId, ref]
  );
}

export type RefPaymentStatus =
  /** Money confirmed: Stripe webhook completed it, or Finance verified it. */
  | 'paid'
  /** Bank payment clearing, or donor says they sent Zelle/Venmo/Cash App — not money yet. */
  | 'processing'
  /** Donor opened checkout or got a memo code but nothing more. */
  | 'started'
  /** Paid, then refunded in full. */
  | 'refunded'
  | 'none';

export interface RefStatus {
  ref: string;
  status: RefPaymentStatus;
  amount: number | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
}

const RANK: Record<RefPaymentStatus, number> = { none: 0, started: 1, refunded: 2, processing: 3, paid: 4 };

function better(a: RefStatus, b: RefStatus): RefStatus {
  return RANK[b.status] > RANK[a.status] ? b : a;
}

function fromDonation(ref: string, d: StoredDonation): RefStatus {
  const fullyRefunded = d.status === 'refunded' || (d.refundedAmount > 0 && d.refundedAmount >= d.amount);
  const status: RefPaymentStatus = fullyRefunded
    ? 'refunded'
    : d.status === 'completed'
      ? 'paid'
      : d.status === 'pending'
        ? 'processing'
        : 'started';
  return {
    ref,
    status,
    amount: d.amount,
    receiptNumber: status === 'paid' ? d.receiptNumber : null,
    paymentMethod: d.paymentMethod,
    paidAt: status === 'paid' ? d.timestamp : null,
  };
}

async function donationsForRefs(refs: string[]): Promise<Array<{ ref: string; donation: StoredDonation }>> {
  const pool = getPgPool();
  const links: Array<{ ref: string; transactionId: string }> = [];
  if (!pool) {
    for (const [transactionId, ref] of memoryLinks) {
      if (refs.includes(ref)) links.push({ ref, transactionId });
    }
  } else {
    await ensureExternalRefsSchema();
    const result = await pool.query(
      `SELECT transaction_id, external_ref FROM gift_external_refs WHERE external_ref = ANY($1::text[])`,
      [refs]
    );
    for (const row of result.rows) {
      links.push({ ref: String(row.external_ref), transactionId: String(row.transaction_id) });
    }
  }
  const out: Array<{ ref: string; donation: StoredDonation }> = [];
  for (const link of links) {
    const donation = await getGiftByTransactionId(link.transactionId);
    if (donation) out.push({ ref: link.ref, donation });
  }
  return out;
}

async function manualStatus(ref: string, gift: ManualGift): Promise<RefStatus> {
  if (gift.status === 'verified' && gift.donationId) {
    const pool = getPgPool();
    if (pool) {
      const result = await pool.query('SELECT transaction_id FROM donations WHERE id = $1 LIMIT 1', [gift.donationId]);
      const txId = result.rows[0]?.transaction_id;
      const donation = txId ? await getGiftByTransactionId(String(txId)) : null;
      if (donation) return fromDonation(ref, donation);
    }
  }
  const status: RefPaymentStatus =
    gift.status === 'verified' ? 'paid' : gift.status === 'submitted' ? 'processing' : gift.status === 'initiated' ? 'started' : 'none';
  return {
    ref,
    status,
    amount: gift.receivedAmount ?? gift.amount,
    receiptNumber: null,
    paymentMethod: gift.provider,
    paidAt: status === 'paid' ? gift.verifiedAt : null,
  };
}

/** Best known status for each reference (unknown refs come back as 'none'). */
export async function statusForRefs(rawRefs: unknown[]): Promise<RefStatus[]> {
  const refs = [...new Set(rawRefs.map(normalizeExternalRef).filter((r): r is string => Boolean(r)))].slice(0, 200);
  const byRef = new Map<string, RefStatus>(
    refs.map((ref) => [ref, { ref, status: 'none', amount: null, receiptNumber: null, paymentMethod: null, paidAt: null }])
  );
  if (!refs.length) return [];

  for (const { ref, donation } of await donationsForRefs(refs)) {
    byRef.set(ref, better(byRef.get(ref)!, fromDonation(ref, donation)));
  }
  for (const gift of await listManualGiftsByExternalRefs(refs)) {
    if (!gift.externalRef) continue;
    const next = await manualStatus(gift.externalRef, gift);
    byRef.set(gift.externalRef, better(byRef.get(gift.externalRef)!, next));
  }
  return refs.map((r) => byRef.get(r)!);
}
