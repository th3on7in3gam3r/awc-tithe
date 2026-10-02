export type IntegrationMode = 'live' | 'sandbox' | 'simulator';

export interface IntegrationStatus {
  configured: boolean;
  mode: IntegrationMode;
}

export interface ApiConfig {
  product: string;
  stripePublishableKey: string | null;
  integrations: {
    stripe: IntegrationStatus;
    plaid: IntegrationStatus;
    dcb: IntegrationStatus;
    database?: IntegrationStatus;
  };
  dcbBookId: string;
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
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return null;
    return (await res.json()) as ApiConfig;
  } catch {
    return null;
  }
}

export async function createStripePaymentIntent(body: {
  amount: number;
  donorName: string;
  donorEmail: string;
  fundId: string;
  fundCode: string;
  fundName: string;
  feeAmount: number;
  envelopeNumber?: string;
  frequency: string;
  isAnonymous?: boolean;
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const res = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function confirmStripeAndSync(paymentIntentId: string): Promise<{
  paymentIntentId: string;
  amount: number;
  voucherNumber: string;
  awcSynced: boolean;
  donation?: ServerDonation;
  donor?: ServerDonor;
}> {
  const res = await fetch('/api/stripe/confirm-and-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId }),
  });
  return parseJson(res);
}

export async function createPlaidLinkToken(donorEmail: string, donorName: string): Promise<{ linkToken: string }> {
  const res = await fetch('/api/plaid/create-link-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ donorEmail, donorName }),
  });
  return parseJson(res);
}

export async function exchangePlaidPublicToken(publicToken: string, donorEmail: string): Promise<{
  itemId: string;
  institutionName: string;
  accountMask: string;
  accountId: string;
  accessTokenKey: string;
}> {
  const res = await fetch('/api/plaid/exchange-public-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicToken, donorEmail }),
  });
  return parseJson(res);
}

export async function createPlaidTransfer(body: {
  accessTokenKey: string;
  amount: number;
  donorName: string;
  donorEmail: string;
  fundId?: string;
  fundCode: string;
  fundName: string;
  feeAmount: number;
  envelopeNumber?: string;
  accountId?: string;
  institutionName?: string;
  accountMask?: string;
  isAnonymous?: boolean;
  frequency?: string;
}): Promise<{
  transferId: string;
  institutionName: string;
  accountMask: string;
  voucherNumber: string;
  awcSynced: boolean;
  donation?: ServerDonation;
  donor?: ServerDonor;
}> {
  const res = await fetch('/api/plaid/create-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function recordGift(body: {
  amount: number;
  feeCovered: boolean;
  feeAmount?: number;
  frequency: string;
  fundId: string;
  fundName: string;
  fundCode?: string;
  donorName: string;
  donorEmail: string;
  donorAddress?: string;
  paymentMethod: string;
  cardBrand?: string;
  cardLast4?: string;
  dedication?: string;
  isAnonymous?: boolean;
  stripePaymentIntentId?: string;
  plaidTransferId?: string;
  plaidInstitution?: string;
  plaidAccountMask?: string;
  awcDcbVoucher?: string;
  awcSynced?: boolean;
  transactionId?: string;
}): Promise<{ donor: ServerDonor; donation: ServerDonation; mode: 'neon' | 'memory' }> {
  const res = await fetch('/api/gifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    ok: boolean;
    mode: 'neon' | 'memory';
    donor: ServerDonor;
    donation: ServerDonation;
  }>(res);
  return { donor: data.donor, donation: data.donation, mode: data.mode };
}

export async function fetchGiftsByEmail(email: string): Promise<{
  donor: ServerDonor | null;
  donations: ServerDonation[];
  mode: 'neon' | 'memory';
}> {
  const res = await fetch(`/api/gifts/by-email?email=${encodeURIComponent(email)}`);
  const data = await parseJson<{
    ok: boolean;
    mode: 'neon' | 'memory';
    donor: ServerDonor | null;
    donations: ServerDonation[];
  }>(res);
  return { donor: data.donor, donations: data.donations, mode: data.mode };
}

export async function submitVaultInterest(body: {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  source?: string;
  notes?: string;
}): Promise<{
  ok: boolean;
  leadId: string;
  forwarded: boolean;
  setupUrl: string;
  message: string;
}> {
  const res = await fetch('/api/vault/interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function verifyStaffPortalAccess(body: {
  inviteCode: string;
  authenticatorCode: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  const res = await fetch('/api/staff/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || 'Staff Portal access denied.',
    };
  }
  return { ok: true, message: data.message };
}

export async function syncDonationsToDcb(
  donations: Array<{
    donorName: string;
    donorEmail: string;
    amount: number;
    feeAmount?: number;
    fundCode?: string;
    fundName?: string;
    paymentMethod?: string;
    transactionId?: string;
    voucherNumber?: string;
    envelopeNumber?: string;
    contributedAt?: string;
  }>
): Promise<{ synced: number; failed: number }> {
  const res = await fetch('/api/dcb/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ donations }),
  });
  return parseJson(res);
}
