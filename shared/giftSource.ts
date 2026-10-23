/**
 * Where a donor came from before reaching the giving page (?from=sms, etc.).
 * Saved on the Stripe payment as metadata.giftSource so Finance and DCB can
 * report text-to-give separately. Only known values are kept.
 */
export const GIFT_SOURCES = ['sms', 'connect', 'website', 'vault', 'qr'] as const;

export type GiftSource = (typeof GIFT_SOURCES)[number];

export function normalizeGiftSource(raw: unknown): GiftSource | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return (GIFT_SOURCES as readonly string[]).includes(value) ? (value as GiftSource) : null;
}
