/**
 * External references let another AWC app (AWC Vault) hand a donor to Tithe and
 * later ask whether that gift was received.
 *
 * Accepted:
 *   rsvp:<uuid>               — an event RSVP gift
 *   frm:<fundraiser>.<member> — a member's open balance in a Vault fundraiser
 *   fre:<fundraiser>.<entry>  — a visitor's pledge / fun charge in a Vault fundraiser
 * The reference never marks anything paid by
 * itself: Tithe reports a gift as paid only after the Stripe webhook wrote a
 * completed donation, or Finance verified a Zelle / Venmo / Cash App gift.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RSVP_REF = new RegExp(`^rsvp:${UUID}$`);
const FUNDRAISER_REF = new RegExp(`^fr[me]:${UUID}\\.${UUID}$`);

export function normalizeExternalRef(raw: unknown): string | null {
  const ref = String(raw ?? '').trim().toLowerCase();
  if (!ref || ref.length > 100) return null;
  return RSVP_REF.test(ref) || FUNDRAISER_REF.test(ref) ? ref : null;
}

/** True for a Vault fundraiser balance reference. */
export function isFundraiserRef(ref: string | null | undefined): boolean {
  return Boolean(ref && FUNDRAISER_REF.test(ref));
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
