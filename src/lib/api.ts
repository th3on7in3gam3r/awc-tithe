export type IntegrationMode = 'live' | 'sandbox' | 'not_configured';

export interface IntegrationStatus {
  configured: boolean;
  mode: IntegrationMode;
}

export interface ApiConfig {
  product: string;
  stripePublishableKey: string | null;
  integrations: {
    stripe: IntegrationStatus;
    database?: IntegrationStatus;
  };
  giftStore?: 'neon' | 'memory';
  church?: {
    name?: string;
    legalEntityName?: string;
    address?: string;
    cityStateZip?: string;
    ein?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
}

export interface ServerDonor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId?: string;
  lifetimeGiving: number;
  totalGiftsCount: number;
  firstGiftDate: string;
  lastGiftDate: string;
  recurringActive: boolean;
  recurringAmount?: number;
  recurringFrequency?: string;
  gdprConsent: boolean;
  gdprConsentDate: string;
  isAnonymized?: boolean;
}

export interface ServerDonation {
  id: string;
  transactionId: string;
  receiptNumber: string;
  donorId: string;
  donorName: string;
  donorEmail: string;
  donorAddress?: string;
  amount: number;
  feeCovered: boolean;
  feeAmount: number;
  totalCharged: number;
  frequency: string;
  fundId: string;
  fundName: string;
  fundCode: string;
  paymentMethod: string;
  cardBrand?: string;
  cardLast4?: string;
  status: string;
  refundedAmount?: number;
  dedication?: string;
  isAnonymous: boolean;
  timestamp: string;
  nextBillingDate?: string;
  stripePaymentIntentId?: string;
  plaidTransferId?: string;
  plaidInstitution?: string;
  plaidAccountMask?: string;
  awcDcbVoucher?: string;
  awcSynced: boolean;
  encryptedToken: string;
  envelopeNumber?: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`);
    (err as Error & { code?: string; status?: number }).code = data.error;
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data;
}

export async function fetchApiConfig(): Promise<ApiConfig | null> {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        return (await res.json()) as ApiConfig;
      }
    } catch {
      // retry below
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  return null;
}

export async function createStripePaymentIntent(body: {
  /** Gift principal in dollars (server recomputes fee + total). */
  amount: number;
  coverFees?: boolean;
  donorName: string;
  donorEmail: string;
  fundId: string;
  fundCode: string;
  fundName: string;
  envelopeNumber?: string;
  frequency: string;
  isAnonymous?: boolean;
  turnstileToken?: string | null;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  principalAmount: number;
  feeAmount: number;
  totalCharged: number;
}> {
  const res = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function updateStripePaymentIntent(body: {
  paymentIntentId: string;
  coverFees: boolean;
  paymentMethodType: string;
}): Promise<{ feeAmount: number; totalCharged: number; principalAmount: number }> {
  const res = await fetch('/api/stripe/update-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchStripePaymentStatus(paymentIntentId: string): Promise<{
  status: string;
  receiptNumber?: string;
}> {
  const res = await fetch(`/api/stripe/payment-status/${encodeURIComponent(paymentIntentId)}`, {
    credentials: 'include',
  });
  return parseJson(res);
}

export async function pollStripePaymentStatus(paymentIntentId: string): Promise<{
  status: string;
  receiptNumber?: string;
}> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await fetchStripePaymentStatus(paymentIntentId);
    if (status.status === 'completed' || status.status === 'failed' || status.receiptNumber) return status;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return fetchStripePaymentStatus(paymentIntentId);
}

/** Session-bound My Giving gifts (requires Better Auth cookie). */
export async function fetchDonorBillingProfile(): Promise<{
  hasStripeCustomer: boolean;
  stripeCustomerId?: string;
}> {
  const res = await fetch('/api/donor/me/billing', { credentials: 'include' });
  if (res.status === 401) return { hasStripeCustomer: false };
  const data = await parseJson<{
    ok: boolean;
    hasStripeCustomer: boolean;
    stripeCustomerId?: string;
  }>(res);
  return {
    hasStripeCustomer: Boolean(data.hasStripeCustomer),
    stripeCustomerId: data.stripeCustomerId,
  };
}

export async function openStripeCustomerPortal(): Promise<{ url: string }> {
  const res = await fetch('/api/stripe/customer-portal', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await parseJson<{ ok: boolean; url: string }>(res);
  return { url: data.url };
}

export async function fetchMyGifts(): Promise<{
  donor: ServerDonor | null;
  donations: ServerDonation[];
  mode: 'neon' | 'memory';
  email: string;
}> {
  const res = await fetch('/api/donor/me/gifts', { credentials: 'include' });
  const data = await parseJson<{
    ok: boolean;
    mode: 'neon' | 'memory';
    donor: ServerDonor | null;
    donations: ServerDonation[];
    email: string;
  }>(res);
  return {
    donor: data.donor,
    donations: data.donations,
    mode: data.mode,
    email: data.email,
  };
}

/** Anti-enumeration OTP request — response is identical for known/unknown emails. */
export async function requestDonorCode(
  email: string,
  turnstileToken?: string | null
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/donor/request-code', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, turnstileToken: turnstileToken || undefined }),
  });
  return parseJson(res);
}

export async function acceptStaffInvite(token: string): Promise<{ ok: boolean; role?: 'admin' | 'staff'; message?: string }> {
  const res = await fetch('/api/staff/invites/accept', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; role?: 'admin' | 'staff' };
  if (!res.ok) return { ok: false, message: data.message || 'Invite could not be accepted.' };
  return { ok: true, role: data.role };
}

export async function auditStaffTwoFactor(event: 'enrolled'): Promise<void> {
  const res = await fetch('/api/staff/2fa/audit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  });
  await parseJson(res);
}

export async function inviteStaffMember(email: string, role: 'admin' | 'staff'): Promise<{ expiresAt?: string }> {
  const res = await fetch('/api/staff/invites', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  return parseJson(res);
}

export async function deactivateStaffAccount(id: string): Promise<void> {
  const res = await fetch(`/api/staff/accounts/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    credentials: 'include',
  });
  await parseJson(res);
}

export async function resetStaffAuthenticator(id: string): Promise<void> {
  const res = await fetch(`/api/staff/accounts/${encodeURIComponent(id)}/reset-2fa`, {
    method: 'POST',
    credentials: 'include',
  });
  await parseJson(res);
}

export async function fetchPublicFunds(): Promise<
  Array<{ id: string; name: string; description: string; sortOrder: number }>
> {
  const res = await fetch('/api/funds');
  const data = await parseJson<{ ok: boolean; funds: Array<{ id: string; name: string; description: string; sortOrder: number }> }>(res);
  return data.funds || [];
}

export async function fetchAdminGivingGoals(year: number): Promise<{
  year: number;
  progress: Array<{
    fundId: string;
    fundName: string;
    year: number;
    goalAmount: number | null;
    totalReceived: number;
    percent: number | null;
  }>;
}> {
  const res = await fetch(`/api/funds/admin/goals?year=${year}`, { credentials: 'include' });
  return parseJson(res);
}

export async function putAdminGivingGoal(body: {
  fundId: string;
  year: number;
  goalAmount: number | null;
}): Promise<unknown> {
  const res = await fetch('/api/funds/admin/goals', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchAdminFunds(): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
    sortOrder: number;
    code: string;
    glCode: string;
  }>
> {
  const res = await fetch('/api/funds/admin', { credentials: 'include' });
  const data = await parseJson<{ ok: boolean; funds: Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
    sortOrder: number;
    code: string;
    glCode: string;
  }> }>(res);
  return (data.funds || []).map((f) => ({
    ...f,
    glCode: f.glCode ?? f.code ?? '',
    code: f.glCode ?? f.code ?? '',
  }));
}

export async function createAdminFund(body: {
  name: string;
  description?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<unknown> {
  const res = await fetch('/api/funds/admin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function patchAdminFund(
  id: string,
  body: Partial<{ name: string; description: string; active: boolean; sortOrder: number; glCode: string }>
): Promise<unknown> {
  const res = await fetch(`/api/funds/admin/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function createAdminOfflineGift(body: {
  fundId: string;
  amount: number;
  giftDate: string;
  note?: string;
  enteredBy?: string;
}): Promise<unknown> {
  const res = await fetch('/api/funds/admin/offline-gifts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchAdminOfflineGifts(year: number): Promise<
  Array<{
    id: string;
    fundId: string;
    amount: number;
    giftDate: string;
    enteredBy: string;
    note: string;
  }>
> {
  const res = await fetch(`/api/funds/admin/offline-gifts?year=${year}`, { credentials: 'include' });
  const data = await parseJson<{ ok: boolean; gifts: Array<{
    id: string;
    fundId: string;
    amount: number;
    giftDate: string;
    enteredBy: string;
    note: string;
  }> }>(res);
  return data.gifts || [];
}

export async function fetchStaffAccounts(): Promise<
  Array<{ id: string; label: string; email?: string; role: 'admin' | 'staff'; active: boolean; status?: string }>
> {
  const res = await fetch('/api/staff/accounts', { credentials: 'include' });
  const data = await parseJson<{
    ok: boolean;
    accounts: Array<{ id: string; label: string; email?: string; role: 'admin' | 'staff'; active: boolean; status?: string }>;
  }>(res);
  return data.accounts || [];
}

export async function patchStaffAccountRole(
  id: string,
  role: 'admin' | 'staff'
): Promise<unknown> {
  const res = await fetch(`/api/staff/accounts/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return parseJson(res);
}

export async function fetchStaffLedger(limit = 500): Promise<{
  donations: ServerDonation[];
  donors: ServerDonor[];
  mode: 'neon' | 'memory';
}> {
  const res = await fetch(`/api/gifts?limit=${limit}`, { credentials: 'include' });
  if (res.status === 401) {
    throw new Error('Staff session required. Unlock Staff Portal again.');
  }
  const data = await parseJson<{
    ok: boolean;
    mode: 'neon' | 'memory';
    donations: ServerDonation[];
    donors: ServerDonor[];
  }>(res);
  return { donations: data.donations || [], donors: data.donors || [], mode: data.mode };
}

export async function recordOfflineGift(body: {
  amount: number;
  donorName: string;
  donorEmail: string;
  fundId: string;
  fundName: string;
  fundCode?: string;
  paymentMethod: string;
  frequency?: string;
  cardBrand?: string;
  dedication?: string;
  isAnonymous?: boolean;
  transactionId?: string;
  contributedAt?: string;
}): Promise<{
  donor?: ServerDonor;
  donation?: ServerDonation;
  mode: 'neon' | 'memory';
  dcb: { ok: boolean; voucherId?: string; mock?: boolean; error?: string };
  offline?: { id: string };
}> {
  const res = await fetch('/api/gifts/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error('Staff session required. Unlock Staff Portal again.');
  }
  const data = await parseJson<{
    ok: boolean;
    mode?: 'neon' | 'memory';
    donor?: ServerDonor;
    donation?: ServerDonation;
    offline?: { id: string };
    dcb?: { ok: boolean; voucherId?: string; mock?: boolean; error?: string };
  }>(res);
  return {
    donor: data.donor,
    donation: data.donation,
    mode: data.mode || 'neon',
    dcb: data.dcb || { ok: true },
    offline: data.offline,
  };
}

export async function fetchChurchSettings(): Promise<{
  name: string;
  legalEntityName: string;
  address: string;
  cityStateZip: string;
  ein: string;
  phone: string;
  email: string;
  website: string;
  seniorPastor: string;
  financialOfficer: string;
  taxExemptStatus: string;
}> {
  const res = await fetch('/api/church');
  const data = await parseJson<{
    ok: boolean;
    settings: {
      name: string;
      legalEntityName: string;
      address: string;
      cityStateZip: string;
      ein: string;
      phone: string;
      email: string;
      website: string;
      seniorPastor: string;
      financialOfficer: string;
      taxExemptStatus: string;
    };
  }>(res);
  return data.settings;
}

export async function patchChurchSettings(body: Record<string, string>): Promise<unknown> {
  const res = await fetch('/api/church', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchActivityAudit(): Promise<
  Array<{
    id: string;
    at: string;
    actorLabel: string;
    actorRole: string;
    action: string;
    resource: string;
    details: string;
    ipAddress: string;
  }>
> {
  const res = await fetch('/api/audit', { credentials: 'include' });
  const data = await parseJson<{
    ok: boolean;
    entries: Array<{
      id: string;
      at: string;
      actorLabel: string;
      actorRole: string;
      action: string;
      resource: string;
      details: string;
      ipAddress: string;
    }>;
  }>(res);
  return data.entries || [];
}

export async function previewYearEndStatements(year: number) {
  const res = await fetch(`/api/statements/year-end/preview?year=${year}`, { credentials: 'include' });
  return parseJson<{
    year: number;
    donorCount: number;
    sample: {
      donorEmail: string;
      donorName: string;
      total: number;
      lines: Array<{ date: string; fund: string; amount: number }>;
      alreadySent: boolean;
    } | null;
    html: string;
  }>(res);
}

export async function sendYearEndStatements(body: { year: number; resendEmail?: string }) {
  const res = await fetch('/api/statements/year-end/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson<{ sent: number; skipped: number; failed: number }>(res);
}

export async function fetchStaffSession(): Promise<{
  authenticated: boolean;
  role: 'admin' | 'staff' | null;
  label?: string;
  email?: string;
  needsEnrollment: boolean;
  twoFactorEnabled: boolean;
  mfaRequired: boolean;
  error?: string;
}> {
  const res = await fetch('/api/staff/session', { credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as {
    authenticated?: boolean;
    role?: 'admin' | 'staff' | null;
    label?: string;
    email?: string;
    needsEnrollment?: boolean;
    twoFactorEnabled?: boolean;
    mfaRequired?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return {
      authenticated: false,
      role: null,
      needsEnrollment: false,
      twoFactorEnabled: false,
      mfaRequired: false,
      error: data.error,
    };
  }
  return {
    authenticated: Boolean(data.authenticated),
    role: data.role || null,
    label: data.label,
    email: data.email,
    needsEnrollment: Boolean(data.needsEnrollment),
    twoFactorEnabled: Boolean(data.twoFactorEnabled),
    mfaRequired: Boolean(data.mfaRequired),
  };
}

export async function logoutStaff(): Promise<void> {
  await fetch('/api/staff/logout', { method: 'POST', credentials: 'include' });
}

// ---------------------------------------------------------------------------
// DCB Outbox — admin retry panel
// ---------------------------------------------------------------------------

export type DcbOutboxStatus = 'pending' | 'sent' | 'failed' | 'needs_review';

export interface DcbOutboxRow {
  id: string;
  donationId: string;
  eventType: 'contribution' | 'refund';
  status: DcbOutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  dcbVoucherId: string | null;
  createdAt: string;
  /** Joined from donations table */
  donorName: string;
  amount: number;
  fundName: string;
  timestamp: string;
}

export async function fetchDcbOutbox(): Promise<DcbOutboxRow[]> {
  const res = await fetch('/api/dcb/outbox', { credentials: 'include' });
  if (res.status === 401 || res.status === 403) return [];
  const data = await parseJson<{ ok: boolean; rows: DcbOutboxRow[] }>(res);
  return data.rows || [];
}

export async function retryDcbOutboxRow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/dcb/outbox/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.message || data.error || `Retry failed (${res.status})`);
  }
  return (await res.json()) as { ok: boolean };
}
