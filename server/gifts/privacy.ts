import { listGiftsByEmail } from './store';

/** Server-only: whether this email has any prior gifts (no public leak). */
export async function emailHasPriorGifts(email: string): Promise<boolean> {
  const result = await listGiftsByEmail(email);
  return Boolean(result.donor || result.donations.length > 0);
}
