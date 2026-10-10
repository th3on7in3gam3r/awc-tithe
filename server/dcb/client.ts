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
