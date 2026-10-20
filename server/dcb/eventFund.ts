/**
 * Event RSVP gifts (AWC Vault rsvp:<id> references) are reported in DCB under the
 * event's own fund, e.g. "Thanksgiving Dinner 2026", with a short note.
 */
import type { DcbContributionPayload } from './client';

export function isEventRsvpRef(ref: string | null | undefined): boolean {
  return Boolean(ref && ref.startsWith('rsvp:'));
}

/** The payload to send to DCB, marked as an event payment when the gift came from an RSVP. */
export function withEventFund(payload: DcbContributionPayload, ref: string | null | undefined): DcbContributionPayload {
  if (!isEventRsvpRef(ref)) return payload;
  const fundName = String(payload.fundName || '').trim();
  if (!fundName) return payload;
  return { ...payload, eventFund: true, memo: `${fundName} RSVP`.slice(0, 80) };
}
