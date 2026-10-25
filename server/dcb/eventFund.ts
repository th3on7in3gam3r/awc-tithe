/**
 * Event RSVP gifts (AWC Vault rsvp:<id> references) are reported in DCB under the
 * event's own fund, e.g. "Thanksgiving Dinner 2026", with a short note.
 */
import type { DcbContributionPayload } from './client';

export function isEventRsvpRef(ref: string | null | undefined): boolean {
  return Boolean(ref && ref.startsWith('rsvp:'));
}

/**
 * The payload to send to DCB, marked as an event payment when the gift came from
 * an RSVP — or was given straight to an event fund on the giving page — so DCB
 * files it under that event's fund (creating it if needed) instead of Needs review.
 */
export function withEventFund(
  payload: DcbContributionPayload,
  ref: string | null | undefined,
  opts: { isEventFund?: boolean } = {}
): DcbContributionPayload {
  const fromRsvp = isEventRsvpRef(ref);
  if (!fromRsvp && !opts.isEventFund) return payload;
  const fundName = String(payload.fundName || '').trim();
  if (!fundName) return payload;
  return { ...payload, eventFund: true, memo: (fromRsvp ? `${fundName} RSVP` : fundName).slice(0, 80) };
}
