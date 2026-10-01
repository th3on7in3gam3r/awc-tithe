import crypto from 'crypto';
import { env } from '../config';

export interface DcbContributionPayload {
  bookId: string;
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
  transactionId: string;
  contributedAt: string;
}

export interface DcbSyncResult {
  ok: boolean;
  voucherId: string;
  syncedAt: string;
  mock: boolean;
  posted?: boolean;
  needsReview?: boolean;
  duplicate?: boolean;
  error?: string;
}

/** In-memory mock DCB ledger for local development */
export const mockDcbEntries: Array<DcbContributionPayload & { id: string; receivedAt: string }> = [];

export function buildVoucherNumber(transactionId: string): string {
  const suffix = transactionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || String(Date.now()).slice(-8);
  return `AWC-VOUCH-${suffix}`;
}

function resolveDcbIngestUrl(): string {
  const configured = env.awcDcbApiUrl.replace(/\/$/, '');
  if (!configured) return '';
  if (configured.includes('/api/')) return configured;
  return `${configured}/api/public/giving/contributions`;
}

/** HMAC headers matching DCB verifyAwcServiceAuth */
function signAwcServiceRequest(rawBody: string): Record<string, string> {
  const secret = env.awcDcbServiceSecret;
  if (!secret) {
    throw new Error('AWC_DCB_SERVICE_SECRET (or AWC_DCB_API_KEY) is not configured');
  }
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-AWC-Timestamp': timestamp,
    'X-AWC-Signature': signature,
  };
}

export async function postContributionToDcb(payload: DcbContributionPayload): Promise<DcbSyncResult> {
  const syncedAt = new Date().toISOString();
  const ingestUrl = resolveDcbIngestUrl();

  if (!ingestUrl) {
    const id = `dcb-mock-${Date.now()}`;
    mockDcbEntries.unshift({ ...payload, id, receivedAt: syncedAt });
    return {
      ok: true,
      voucherId: payload.voucherNumber,
      syncedAt,
      mock: true,
      posted: true,
      needsReview: false,
    };
  }

  try {
    const rawBody = JSON.stringify(payload);
    const headers = signAwcServiceRequest(rawBody);
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers,
      body: rawBody,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        voucherId: payload.voucherNumber,
        syncedAt,
        mock: false,
        error: `DCB API ${response.status}: ${text.slice(0, 200)}`,
      };
    }

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
      voucherId = json.voucherId || json.voucherNumber || json.id || payload.voucherNumber;
      posted = json.posted !== false;
      needsReview = !!json.needsReview;
      duplicate = !!json.duplicate;
    } catch {
      // non-JSON success body is fine
    }

    return { ok: true, voucherId, syncedAt, mock: false, posted, needsReview, duplicate };
  } catch (err) {
    return {
      ok: false,
      voucherId: payload.voucherNumber,
      syncedAt,
      mock: false,
      error: err instanceof Error ? err.message : 'Unknown DCB sync error',
    };
  }
}
