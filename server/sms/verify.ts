/**
 * Phone sign-in codes for My Giving, sent and checked by Twilio Verify.
 *
 * Verify sends from Twilio's own pre-approved senders, so the church's
 * toll-free number stays reserved for text-to-give. Twilio charges only for
 * successful verifications (plus the SMS), and Verify itself limits wrong
 * guesses per code.
 */
import { env } from '../config';

export function phoneSignInEnabled(): boolean {
  return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioVerifyServiceSid);
}

/**
 * US / NANP mobile-style numbers only, returned as E.164 (+15085551234).
 * Rejects toll-free, premium (900/976) and malformed numbers, so codes can only
 * go to ordinary US phones (keeps cost and SMS-pumping risk down).
 */
export function normalizeUsPhone(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || !/^[2-9]\d\d$/.test(exchange)) return null;
  if (/^(800|833|844|855|866|877|888|900|976)$/.test(area)) return null;
  if (area[1] === '1' && area[2] === '1') return null; // N11 service codes
  return `+1${digits}`;
}

/** "+15085551234" → "(•••) •••-1234" for display. */
export function maskE164(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? `(•••) •••-${digits.slice(-4)}` : null;
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);
/** Tests swap in a fake Twilio. */
export function setVerifyFetchForTests(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

async function verifyRequest(path: string, form: Record<string, string>): Promise<{ status?: string }> {
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(env.twilioVerifyServiceSid)}/${path}`;
  const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  if (!res.ok) {
    // 404 on a check = no pending code (expired, used, or too many tries)
    if (path === 'VerificationCheck' && res.status === 404) return { status: 'expired' };
    throw new Error(`Twilio Verify ${path} ${res.status}${data.code ? ` (${data.code})` : ''}`);
  }
  return data;
}

/** Text a 6-digit code to an E.164 number. */
export async function sendPhoneCode(phoneE164: string): Promise<void> {
  if (!phoneSignInEnabled()) throw new Error('Phone sign-in is not configured');
  await verifyRequest('Verifications', { To: phoneE164, Channel: 'sms' });
}

/** True only when Twilio approves the code for that number. */
export async function checkPhoneCode(phoneE164: string, code: string): Promise<boolean> {
  if (!phoneSignInEnabled()) return false;
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length < 4 || clean.length > 10) return false;
  try {
    const result = await verifyRequest('VerificationCheck', { To: phoneE164, Code: clean });
    return result.status === 'approved';
  } catch (err) {
    console.warn('[phone] verify check failed', err instanceof Error ? err.message : err);
    return false;
  }
}
