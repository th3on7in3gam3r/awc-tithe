/**
 * Text-to-give: a member texts GIVE to the church's Twilio number and gets the
 * AWC Tithe giving link back.
 *
 * An SMS never creates, updates or completes a gift. Gifts are recorded only by
 * the Stripe webhook and Finance's manual reconciliation.
 *
 * STOP / START / UNSTOP / HELP keywords are answered by Twilio's Advanced
 * Opt-Out (it also blocks further texts to anyone who replied STOP). We return
 * an empty reply for them so members never get two answers.
 */
import crypto from 'crypto';

export type SmsKeyword = 'give' | 'help' | 'opt_out' | 'opt_in' | 'other';

const GIVE_WORDS = ['GIVE', 'TITHE', 'OFFERING', 'DONATE', 'GIVING'];
const OPT_OUT_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'];
const OPT_IN_WORDS = ['START', 'UNSTOP', 'YES'];
const HELP_WORDS = ['HELP', 'INFO'];

/** First word of the text, upper-cased, without punctuation ("give!" → GIVE). */
export function classifySms(body: unknown): SmsKeyword {
  const word = String(body ?? '')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!word) return 'other';
  if (OPT_OUT_WORDS.includes(word)) return 'opt_out';
  if (OPT_IN_WORDS.includes(word)) return 'opt_in';
  if (HELP_WORDS.includes(word)) return 'help';
  if (GIVE_WORDS.includes(word)) return 'give';
  return 'other';
}

/** The giving page with ?from=sms so Stripe records the gift's source. */
export function smsGivingUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('from', 'sms');
  return url.toString();
}

/** Reply text for a keyword, or null when Twilio answers it (STOP/START). */
export function smsReply(keyword: SmsKeyword, opts: { churchName: string; givingUrl: string }): string | null {
  const { churchName, givingUrl } = opts;
  switch (keyword) {
    case 'give':
      return `Thank you for giving to ${churchName}! Give securely here: ${givingUrl} Reply STOP to opt out.`;
    case 'help':
      return `${churchName} giving line. Text an amount (like 50) to give, or GIVE for our giving page. Msg & data rates may apply. Reply STOP to opt out.`;
    case 'opt_out':
    case 'opt_in':
      return null;
    default:
      return `Text an amount (like 50) to give to ${churchName}, or text GIVE for our secure giving page.`;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function twiml(message: string | null): string {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/**
 * Twilio's request signature: HMAC-SHA1 (auth token) over the full webhook URL
 * followed by each POST param name+value, sorted by name; base64-encoded.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, unknown>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const value = params[key];
      const values = Array.isArray(value) ? value : [value];
      return acc + values.map((v) => key + String(v ?? '')).join('');
    }, url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, unknown>
): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** "+15085551234" → "***1234" for logs. */
export function maskPhone(phone: unknown): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
}
