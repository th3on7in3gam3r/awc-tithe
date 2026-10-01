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
  };
  dcbBookId: string;
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
  fundCode: string;
  fundName: string;
  feeAmount: number;
  envelopeNumber?: string;
  accountId?: string;
  institutionName?: string;
  accountMask?: string;
}): Promise<{
  transferId: string;
  institutionName: string;
  accountMask: string;
  voucherNumber: string;
  awcSynced: boolean;
}> {
  const res = await fetch('/api/plaid/create-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
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
