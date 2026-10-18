/**
 * External references let another AWC app (today: AWC Vault event RSVPs)
 * hand a donor to Tithe and later ask whether that gift was received.
 *
 * Only `rsvp:<uuid>` is accepted. The reference never marks anything paid by
 * itself: Tithe reports a gift as paid only after the Stripe webhook wrote a
 * completed donation, or Finance verified a Zelle / Venmo / Cash App gift.
 */

const RSVP_REF = /^rsvp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeExternalRef(raw: unknown): string | null {
  const ref = String(raw ?? '').trim().toLowerCase();
  if (!ref || ref.length > 64) return null;
  return RSVP_REF.test(ref) ? ref : null;
}

/** Short label shown on the Give page ("Thanksgiving 2026 RSVP"). Plain text only. */
export function normalizeRefLabel(raw: unknown): string | null {
  const label = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '&.,:()\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return label.length >= 2 ? label : null;
}
