/**
 * server/dcb/client.ts
 *
 * HTTP client for AWC Digital Contribution Book.
 *
 * Signing: HMAC-SHA256 with AWC_DCB_KEY_TITHE.
 * Header:  X-AWC-Key-Id: tithe  (DCB routes to the tithe per-app key)
 * Header:  Idempotency-Key: <transactionId>
 * Timeout: 10 seconds (AbortSignal.timeout)
 *
 * This module is called ONLY by the outbox worker — never from a request
 * handler or Stripe webhook directly.
 */

import crypto from 'crypto';
import { env } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DcbContributionPayload {
  /** Voucher number — use the donation receipt number as-is (e.g. REC-2025-84321). */
  voucherNumber: string;
  donorName: string;
  donorEmail: string;
  envelopeNumber?: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  fundCode: string;
  fundName: string;
  paymentMethod: string;
  /** Full Stripe PaymentIntent ID or invoice ID — also used as Idempotency-Key. */
  transactionId: string;
  contributedAt: string;
  /** Lets DCB label Tithe deliveries in its audit log. */
  source: 'awc-tithe-bridge';
  /**
   * Event RSVP payment (AWC Vault rsvp: reference). DCB creates the event's fund
   * (fundName, e.g. "Thanksgiving Dinner 2026") if it does not have it yet.
   */
  eventFund?: boolean;
  /** Short note shown on the DCB contribution ("Thanksgiving Dinner 2026 RSVP"). */
  memo?: string;
  /** Event fund: the AWC Vault event id, so DCB keeps one fund per event across renames. */
  eventKey?: string;
  /** Event fund: earlier names, so DCB finds the right fund after a rename. */
  previousFundNames?: string[];
}

export interface DcbSyncResult {
  ok: boolean;
  voucherId: string;
  syncedAt: string;
  posted?: boolean;
  needsReview?: boolean;
  duplicate?: boolean;
  error?: string;
}

/**
 * Thrown when AWC_DCB_API_URL or AWC_DCB_KEY_TITHE are not set.
 * The outbox worker catches this and leaves the row 'pending' rather than
 * counting it as a failed attempt.
 */
export class DcbNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`DCB not configured: ${missing} is not set`);
    this.name = 'DcbNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the voucher number from the donation receipt number.
 * Receipt numbers are already unique (e.g. REC-2025-84321); use them as-is.
 */
export function buildVoucherNumber(receiptNumber: string): string {
  return receiptNumber;
}

function resolveDcbIngestUrl(): string {
  const configured = env.awcDcbApiUrl.replace(/\/$/, '');
  if (!configured) return '';
  if (configured.includes('/api/')) return configured;
  return `${configured}/api/public/giving/contributions`;
}

/**
 * Sign the request body with AWC_DCB_KEY_TITHE.
 * DCB verifies: HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 * The X-AWC-Key-Id header tells DCB which per-app key to look up.
 */
function signRequest(
  rawBody: string,
  idempotencyKey: string
): Record<string, string> {
  const key = env.awcDcbKeyTithe;
  if (!key) {
    throw new DcbNotConfiguredError('AWC_DCB_KEY_TITHE');
  }
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-AWC-Key-Id': 'tithe',
    'X-AWC-Timestamp': timestamp,
    'X-AWC-Signature': signature,
    'Idempotency-Key': idempotencyKey,
  };
}

/** DCB base URL (the configured URL may be the full contributions path). */
function dcbBaseUrl(): string {
  const configured = env.awcDcbApiUrl.replace(/\/$/, '');
  const i = configured.indexOf('/api/');
  return i >= 0 ? configured.slice(0, i) : configured;
}

/**
 * Tell DCB an event fund was set up or renamed, so DCB renames the same fund right away
 * (its gifts stay with it). Never throws: returns false when DCB is not set up or fails;
 * the next gift for the event also carries the event id and fixes the name then.
 */
export async function postEventFundToDcb(input: {
  eventKey: string | null | undefined;
  name: string;
  previousNames?: string[];
}): Promise<boolean> {
  if (!env.awcDcbApiUrl?.trim() || !env.awcDcbKeyTithe?.trim()) return false;
  const rawBody = JSON.stringify({
    eventKey: input.eventKey || undefined,
    name: input.name,
    previousNames: (input.previousNames || []).slice(0, 10),
  });
  try {
    const res = await fetch(`${dcbBaseUrl()}/api/public/giving/event-fund`, {
      method: 'POST',
      headers: signRequest(rawBody, `event-fund:${input.eventKey || input.name}:${Date.now()}`),
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[dcb] event fund sync failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function postContributionToDcb(
  payload: DcbContributionPayload
): Promise<DcbSyncResult> {
  const syncedAt = new Date().toISOString();

  const url = env.awcDcbApiUrl?.trim();
  const key = env.awcDcbKeyTithe?.trim();

  if (!url) throw new DcbNotConfiguredError('AWC_DCB_API_URL');
  if (!key) throw new DcbNotConfiguredError('AWC_DCB_KEY_TITHE');

  const ingestUrl = resolveDcbIngestUrl();
  const rawBody = JSON.stringify(payload);
  const headers = signRequest(rawBody, payload.transactionId);

  let response: Response;
  try {
    response = await fetch(ingestUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(
      `DCB fetch failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // DCB returns 409 / duplicate flag for already-seen idempotency keys.
  // Treat as successfully sent — the contribution is already in DCB.
  if (response.status === 409) {
    let voucherId = payload.voucherNumber;
    try {
      const json = (await response.json()) as {
        voucherId?: string;
        voucherNumber?: string;
        id?: string;
      };
      voucherId =
        json.voucherId || json.voucherNumber || json.id || payload.voucherNumber;
    } catch {
      // non-JSON 409 — use voucher from payload
    }
    return { ok: true, voucherId, syncedAt, duplicate: true, posted: true };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DCB API ${response.status}: ${text.slice(0, 400)}`);
  }

  // Parse success response
  let voucherId = payload.voucherNumber;
  let posted = true;
  let needsReview = false;
  let duplicate = false;
  try {
    const json = (await response.json()) as {
      voucherId?: string;
      voucherNumber?: string;
      id?: string;
      posted?: boolean;
      needsReview?: boolean;
      duplicate?: boolean;
    };
    voucherId =
      json.voucherId || json.voucherNumber || json.id || payload.voucherNumber;
    posted = json.posted !== false;
    needsReview = !!json.needsReview;
    duplicate = !!json.duplicate;
    // DCB says it's a duplicate in the body — still treat as sent
    if (duplicate) {
      return { ok: true, voucherId, syncedAt, duplicate: true, posted: true };
    }
  } catch {
    // non-JSON success body is fine
  }

  return { ok: true, voucherId, syncedAt, posted, needsReview, duplicate };
}

// ---------------------------------------------------------------------------
// Refunds — POST /api/public/giving/contributions/:voucherId/void
// ---------------------------------------------------------------------------

export interface DcbRefundPayload {
  voucherNumber: string;
  transactionId: string;
  refundedAt: string;
  refundAmount: number;
  reason?: string;
  source?: 'awc-tithe-bridge';
}

/** Thrown when DCB has no record of the gift yet (contribution not delivered). */
export class DcbGiftNotFoundError extends Error {
  constructor(voucher: string) {
    super(`DCB has no gift for voucher ${voucher} yet`);
    this.name = 'DcbGiftNotFoundError';
  }
}

export async function voidContributionInDcb(payload: DcbRefundPayload): Promise<DcbSyncResult> {
  const syncedAt = new Date().toISOString();
  const url = env.awcDcbApiUrl?.trim();
  if (!url) throw new DcbNotConfiguredError('AWC_DCB_API_URL');
  if (!env.awcDcbKeyTithe?.trim()) throw new DcbNotConfiguredError('AWC_DCB_KEY_TITHE');

  const ingestUrl = resolveDcbIngestUrl();
  const voidUrl = `${ingestUrl}/${encodeURIComponent(payload.voucherNumber || payload.transactionId)}/void`;
  const rawBody = JSON.stringify({ ...payload, source: 'awc-tithe-bridge' });
  const headers = signRequest(rawBody, `refund:${payload.transactionId}`);

  let response: Response;
  try {
    response = await fetch(voidUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`DCB fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 409) {
    return { ok: true, voucherId: payload.voucherNumber, syncedAt, duplicate: true };
  }
  if (response.status === 404) {
    throw new DcbGiftNotFoundError(payload.voucherNumber);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DCB API ${response.status}: ${text.slice(0, 400)}`);
  }
  let voucherId = payload.voucherNumber;
  try {
    const json = (await response.json()) as { voucherId?: string };
    voucherId = json.voucherId || voucherId;
  } catch {
    // non-JSON success body is fine
  }
  return { ok: true, voucherId, syncedAt, needsReview: true };
}
