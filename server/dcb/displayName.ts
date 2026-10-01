/** Normalize donor display name for AWC-DCB (never send blank). */
export function dcbDonorDisplayName(options: {
  isAnonymous?: boolean;
  donorName?: string | null;
}): string {
  if (options.isAnonymous) return 'Anonymous';
  const name = (options.donorName || '').trim();
  if (!name || /^anonymous/i.test(name)) return 'Anonymous';
  return name;
}
