import { fetchGiftsByEmail } from './api';

/** My Giving soft-session — shared so Give can prefill returning donors. */
export const DONOR_PORTAL_EMAIL_KEY = 'awc_donor_portal_email';

export type DonorProfileSource = 'session' | 'lookup' | 'manual' | null;

export interface DonorProfilePrefill {
  email: string;
  name: string;
  address: string;
  phone: string;
  found: boolean;
  source: Exclude<DonorProfileSource, 'manual' | null>;
}

export interface LocalDonorHint {
  email: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface LocalGiftHint {
  donorEmail: string;
  donorName: string;
  donorAddress?: string;
  isAnonymous?: boolean;
}

export function normalizeDonorEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getDonorSessionEmail(): string | null {
  try {
    const raw = sessionStorage.getItem(DONOR_PORTAL_EMAIL_KEY);
    if (!raw) return null;
    const normalized = normalizeDonorEmail(raw);
    return normalized.includes('@') ? normalized : null;
  } catch {
    return null;
  }
}

export function setDonorSessionEmail(email: string): void {
  try {
    sessionStorage.setItem(DONOR_PORTAL_EMAIL_KEY, normalizeDonorEmail(email));
  } catch {
    // ignore quota / private mode
  }
}

export function clearDonorSessionEmail(): void {
  try {
    sessionStorage.removeItem(DONOR_PORTAL_EMAIL_KEY);
  } catch {
    // ignore
  }
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'Anonymous' || trimmed === 'Anonymous Donor') return '';
  return trimmed;
}

function profileFromLocal(
  normalized: string,
  source: 'session' | 'lookup',
  local?: { donors?: LocalDonorHint[]; donations?: LocalGiftHint[] }
): DonorProfilePrefill | null {
  if (!local) return null;
  const donor = local.donors?.find((d) => normalizeDonorEmail(d.email) === normalized);
  const gifts = (local.donations || []).filter(
    (g) => normalizeDonorEmail(g.donorEmail) === normalized
  );
  if (!donor && gifts.length === 0) return null;

  const latest = gifts[0];
  const name =
    sanitizeName(donor?.name || '') ||
    (latest && !latest.isAnonymous ? sanitizeName(latest.donorName) : '');
  const address = (donor?.address || latest?.donorAddress || '').trim();
  const phone = (donor?.phone || '').trim();

  return {
    email: normalized,
    name,
    address,
    phone,
    found: true,
    source,
  };
}

/**
 * Load name/address for an email from the gift ledger (API),
 * falling back to in-browser donors/donations when the server has no match.
 */
export async function loadDonorProfileByEmail(
  email: string,
  source: 'session' | 'lookup' = 'lookup',
  local?: { donors?: LocalDonorHint[]; donations?: LocalGiftHint[] }
): Promise<DonorProfilePrefill> {
  const normalized = normalizeDonorEmail(email);
  if (!normalized.includes('@')) {
    return { email: normalized, name: '', address: '', phone: '', found: false, source };
  }

  try {
    const result = await fetchGiftsByEmail(normalized);
    const latest = result.donations[0];
    const name =
      sanitizeName(result.donor?.name || '') ||
      (latest && !latest.isAnonymous ? sanitizeName(latest.donorName || '') : '');
    const address =
      (result.donor?.address || '').trim() ||
      (latest?.donorAddress || '').trim();
    const phone = (result.donor?.phone || '').trim();
    const found = Boolean(result.donor || result.donations.length > 0);

    if (found) {
      return {
        email: normalized,
        name,
        address,
        phone,
        found: true,
        source,
      };
    }
  } catch {
    // fall through to local
  }

  const localProfile = profileFromLocal(normalized, source, local);
  if (localProfile) return localProfile;

  return {
    email: normalized,
    name: '',
    address: '',
    phone: '',
    found: false,
    source,
  };
}
