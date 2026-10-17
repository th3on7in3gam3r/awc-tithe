import { listGiftsByEmail } from './store';

/**
 * Anti-enumeration gate for My giving sign-in codes: only email addresses the
 * church already has a gift for receive a code. Counts card/bank gifts, cash
 * and check gifts recorded by staff, and Zelle/Venmo gifts the donor reported
 * sending (so they can sign in and watch Finance confirm them).
 */
export async function emailHasPriorGifts(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;

  const result = await listGiftsByEmail(normalized);
  if (result.donor || result.donations.length > 0) return true;

  const { listOfflineGiftsByEmail } = await import('../funds/store');
  if ((await listOfflineGiftsByEmail(normalized)).length > 0) return true;

  const { listManualGiftsForDonor } = await import('../manualGifts/store');
  return (await listManualGiftsForDonor(normalized)).length > 0;
}
