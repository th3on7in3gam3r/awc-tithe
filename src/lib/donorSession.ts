/** Helpers for verified donor session — no public email enumeration. */

export const DONOR_PORTAL_EMAIL_KEY = 'awc_donor_portal_email';

export type DonorProfileSource = 'session' | 'manual' | null;

export interface DonorProfilePrefill {
  email: string;
  name: string;
  address: string;
  phone: string;
  found: boolean;
  source: 'session';
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

/**
 * Prefill Give form from a verified Better Auth session only
 * (GET /api/donor/me/profile — 401 if not signed in).
 */
export async function loadVerifiedDonorProfile(): Promise<DonorProfilePrefill | null> {
  try {
    const res = await fetch('/api/donor/me/profile', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      profile?: {
        email: string;
        name: string;
        address: string;
        phone: string;
        found: boolean;
      };
    };
    if (!data.profile?.email) return null;
    return {
      email: normalizeDonorEmail(data.profile.email),
      name: sanitizeName(data.profile.name || ''),
      address: (data.profile.address || '').trim(),
      phone: (data.profile.phone || '').trim(),
      found: Boolean(data.profile.found),
      source: 'session',
    };
  } catch {
    return null;
  }
}
