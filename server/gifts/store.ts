import { ensureSchema, getSql, hasDatabaseUrl } from '../db';

export type GiftFrequency = 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'annually';
export type GiftPaymentMethod =
  | 'card'
  | 'ach'
  | 'apple_pay'
  | 'plaid'
  | 'cash'
  | 'check'
  | 'cash_app'
  | 'zelle'
  | 'venmo';

export interface StoredDonor {
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
  recurringFrequency?: GiftFrequency;
  gdprConsent: boolean;
  gdprConsentDate: string;
  isAnonymized?: boolean;
}

export interface StoredDonation {
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
  frequency: GiftFrequency;
  fundId: string;
  fundName: string;
  fundCode: string;
  paymentMethod: GiftPaymentMethod;
  cardBrand?: string;
  cardLast4?: string;
  status: 'completed' | 'pending' | 'refunded' | 'failed';
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

export interface CreateGiftInput {
  amount: number;
  feeCovered: boolean;
  feeAmount?: number;
  frequency: GiftFrequency;
  fundId: string;
  fundName: string;
  fundCode?: string;
  donorName: string;
  donorEmail: string;
  donorAddress?: string;
  paymentMethod: GiftPaymentMethod;
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
  contributedAt?: string;
}

const memoryDonors = new Map<string, StoredDonor>();
const memoryDonations: StoredDonation[] = [];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapDonorRow(row: Record<string, unknown>): StoredDonor {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: String(row.phone || ''),
    address: String(row.address || ''),
    taxId: row.tax_id ? String(row.tax_id) : undefined,
    lifetimeGiving: num(row.lifetime_giving),
    totalGiftsCount: Number(row.total_gifts_count || 0),
    firstGiftDate: new Date(String(row.first_gift_date)).toISOString(),
    lastGiftDate: new Date(String(row.last_gift_date)).toISOString(),
    recurringActive: Boolean(row.recurring_active),
    recurringAmount: row.recurring_amount != null ? num(row.recurring_amount) : undefined,
    recurringFrequency: row.recurring_frequency
      ? (String(row.recurring_frequency) as GiftFrequency)
      : undefined,
    gdprConsent: Boolean(row.gdpr_consent),
    gdprConsentDate: new Date(String(row.gdpr_consent_date || row.first_gift_date)).toISOString(),
    isAnonymized: Boolean(row.is_anonymized),
  };
}

function mapDonationRow(row: Record<string, unknown>): StoredDonation {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    receiptNumber: String(row.receipt_number),
    donorId: String(row.donor_id),
    donorName: String(row.donor_name),
    donorEmail: String(row.donor_email),
    donorAddress: row.donor_address ? String(row.donor_address) : undefined,
    amount: num(row.amount),
    feeCovered: Boolean(row.fee_covered),
    feeAmount: num(row.fee_amount),
    totalCharged: num(row.total_charged),
    frequency: String(row.frequency) as GiftFrequency,
    fundId: String(row.fund_id),
    fundName: String(row.fund_name),
    fundCode: String(row.fund_code || '1001-OPS'),
    paymentMethod: String(row.payment_method) as GiftPaymentMethod,
    cardBrand: row.card_brand ? String(row.card_brand) : undefined,
    cardLast4: row.card_last4 ? String(row.card_last4) : undefined,
    status: String(row.status || 'completed') as StoredDonation['status'],
    dedication: row.dedication ? String(row.dedication) : undefined,
    isAnonymous: Boolean(row.is_anonymous),
    timestamp: new Date(String(row.contributed_at)).toISOString(),
    nextBillingDate: row.next_billing_date
      ? new Date(String(row.next_billing_date)).toISOString()
      : undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id
      ? String(row.stripe_payment_intent_id)
      : undefined,
    plaidTransferId: row.plaid_transfer_id ? String(row.plaid_transfer_id) : undefined,
    plaidInstitution: row.plaid_institution ? String(row.plaid_institution) : undefined,
    plaidAccountMask: row.plaid_account_mask ? String(row.plaid_account_mask) : undefined,
    awcDcbVoucher: row.awc_dcb_voucher ? String(row.awc_dcb_voucher) : undefined,
    awcSynced: Boolean(row.awc_synced),
    encryptedToken: String(row.encrypted_token || ''),
    envelopeNumber: row.envelope_number ? String(row.envelope_number) : undefined,
  };
}

export async function initGiftStore(): Promise<{ mode: 'neon' | 'memory'; error?: string }> {
  const result = await ensureSchema();
  return { mode: result.mode, error: result.error };
}

export function giftStoreMode(): 'neon' | 'memory' {
  return hasDatabaseUrl() ? 'neon' : 'memory';
}

async function findDonorByEmailNeon(email: string): Promise<StoredDonor | null> {
  const client = getSql();
  if (!client) return null;
  const rows = await client`
    SELECT * FROM donors WHERE LOWER(email) = ${normalizeEmail(email)} LIMIT 1
  `;
  if (!rows.length) return null;
  return mapDonorRow(rows[0] as Record<string, unknown>);
}

function findDonorByEmailMemory(email: string): StoredDonor | null {
  const normalized = normalizeEmail(email);
  for (const donor of memoryDonors.values()) {
    if (normalizeEmail(donor.email) === normalized) return donor;
  }
  return null;
}

export async function createGift(input: CreateGiftInput): Promise<{
  donor: StoredDonor;
  donation: StoredDonation;
  mode: 'neon' | 'memory';
}> {
  const now = input.contributedAt ? new Date(input.contributedAt) : new Date();
  const timestamp = now.toISOString();
  const email = normalizeEmail(input.donorEmail);
  if (!email || !email.includes('@')) {
    throw new Error('A valid donor email is required');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Gift amount must be greater than zero');
  }

  const feeAmount =
    input.feeAmount != null
      ? Number(input.feeAmount)
      : input.feeCovered
        ? Number((input.amount * 0.029 + 0.3).toFixed(2))
        : 0;
  const totalCharged = Number((input.amount + feeAmount).toFixed(2));
  const isAnonymous = Boolean(input.isAnonymous);
  const displayName = isAnonymous ? 'Anonymous' : input.donorName.trim() || 'Anonymous';

  let nextBillingDate: string | undefined;
  if (input.frequency !== 'one-time') {
    const next = new Date(now);
    if (input.frequency === 'weekly') next.setDate(now.getDate() + 7);
    else if (input.frequency === 'bi-weekly') next.setDate(now.getDate() + 14);
    else if (input.frequency === 'monthly') next.setMonth(now.getMonth() + 1);
    else if (input.frequency === 'annually') next.setFullYear(now.getFullYear() + 1);
    nextBillingDate = next.toISOString();
  }

  const transactionId =
    input.transactionId ||
    input.stripePaymentIntentId ||
    input.plaidTransferId ||
    `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const receiptNumber = `REC-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const donationId = `don-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fundCode = input.fundCode || '1001-OPS';

  const client = getSql();
  const mode = client ? 'neon' : 'memory';

  if (client) {
    let donor = await findDonorByEmailNeon(email);
    if (donor) {
      const recurringActive = input.frequency !== 'one-time' ? true : donor.recurringActive;
      await client`
        UPDATE donors SET
          name = ${isAnonymous ? donor.name : displayName},
          address = ${input.donorAddress || donor.address},
          lifetime_giving = ${donor.lifetimeGiving + input.amount},
          total_gifts_count = ${donor.totalGiftsCount + 1},
          last_gift_date = ${timestamp},
          recurring_active = ${recurringActive},
          recurring_amount = ${input.frequency !== 'one-time' ? input.amount : donor.recurringAmount ?? null},
          recurring_frequency = ${input.frequency !== 'one-time' ? input.frequency : donor.recurringFrequency ?? null},
          updated_at = NOW()
        WHERE id = ${donor.id}
      `;
      donor = (await findDonorByEmailNeon(email))!;
    } else {
      const donorId = `donor-${Date.now()}`;
      await client`
        INSERT INTO donors (
          id, name, email, phone, address, lifetime_giving, total_gifts_count,
          first_gift_date, last_gift_date, recurring_active, recurring_amount,
          recurring_frequency, gdpr_consent, gdpr_consent_date
        ) VALUES (
          ${donorId},
          ${displayName},
          ${email},
          ${''},
          ${input.donorAddress || ''},
          ${input.amount},
          ${1},
          ${timestamp},
          ${timestamp},
          ${input.frequency !== 'one-time'},
          ${input.frequency !== 'one-time' ? input.amount : null},
          ${input.frequency !== 'one-time' ? input.frequency : null},
          ${true},
          ${timestamp}
        )
      `;
      donor = (await findDonorByEmailNeon(email))!;
    }

    // Idempotent on transaction_id (Stripe/Plaid retries)
    const existing = await client`
      SELECT * FROM donations WHERE transaction_id = ${transactionId} LIMIT 1
    `;
    if (existing.length) {
      return {
        donor,
        donation: mapDonationRow(existing[0] as Record<string, unknown>),
        mode,
      };
    }

    await client`
      INSERT INTO donations (
        id, transaction_id, receipt_number, donor_id, donor_name, donor_email, donor_address,
        amount, fee_covered, fee_amount, total_charged, frequency, fund_id, fund_name, fund_code,
        payment_method, card_brand, card_last4, status, dedication, is_anonymous, contributed_at,
        next_billing_date, stripe_payment_intent_id, plaid_transfer_id, plaid_institution,
        plaid_account_mask, awc_dcb_voucher, awc_synced, encrypted_token, envelope_number
      ) VALUES (
        ${donationId},
        ${transactionId},
        ${receiptNumber},
        ${donor.id},
        ${displayName},
        ${email},
        ${input.donorAddress || null},
        ${input.amount},
        ${input.feeCovered},
        ${feeAmount},
        ${totalCharged},
        ${input.frequency},
        ${input.fundId},
        ${input.fundName},
        ${fundCode},
        ${input.paymentMethod},
        ${input.cardBrand || null},
        ${input.cardLast4 || null},
        ${'completed'},
        ${input.dedication || null},
        ${isAnonymous},
        ${timestamp},
        ${nextBillingDate || null},
        ${input.stripePaymentIntentId || null},
        ${input.plaidTransferId || null},
        ${input.plaidInstitution || null},
        ${input.plaidAccountMask || null},
        ${input.awcDcbVoucher || null},
        ${Boolean(input.awcSynced)},
        ${`enc_${Math.random().toString(36).slice(2, 14)}`},
        ${null}
      )
    `;

    const donationRows = await client`
      SELECT * FROM donations WHERE id = ${donationId} LIMIT 1
    `;
    return {
      donor,
      donation: mapDonationRow(donationRows[0] as Record<string, unknown>),
      mode,
    };
  }

  // Memory fallback (no DATABASE_URL)
  let donor = findDonorByEmailMemory(email);
  if (donor) {
    donor = {
      ...donor,
      name: isAnonymous ? donor.name : displayName,
      address: input.donorAddress || donor.address,
      lifetimeGiving: donor.lifetimeGiving + input.amount,
      totalGiftsCount: donor.totalGiftsCount + 1,
      lastGiftDate: timestamp,
      recurringActive: input.frequency !== 'one-time' ? true : donor.recurringActive,
      recurringAmount: input.frequency !== 'one-time' ? input.amount : donor.recurringAmount,
      recurringFrequency: input.frequency !== 'one-time' ? input.frequency : donor.recurringFrequency,
    };
    memoryDonors.set(donor.id, donor);
  } else {
    donor = {
      id: `donor-${Date.now()}`,
      name: displayName,
      email,
      phone: '',
      address: input.donorAddress || '',
      lifetimeGiving: input.amount,
      totalGiftsCount: 1,
      firstGiftDate: timestamp,
      lastGiftDate: timestamp,
      recurringActive: input.frequency !== 'one-time',
      recurringAmount: input.frequency !== 'one-time' ? input.amount : undefined,
      recurringFrequency: input.frequency !== 'one-time' ? input.frequency : undefined,
      gdprConsent: true,
      gdprConsentDate: timestamp,
    };
    memoryDonors.set(donor.id, donor);
  }

  const existingMem = memoryDonations.find((d) => d.transactionId === transactionId);
  if (existingMem) {
    return { donor, donation: existingMem, mode };
  }

  const donation: StoredDonation = {
    id: donationId,
    transactionId,
    receiptNumber,
    donorId: donor.id,
    donorName: displayName,
    donorEmail: email,
    donorAddress: input.donorAddress,
    amount: input.amount,
    feeCovered: input.feeCovered,
    feeAmount,
    totalCharged,
    frequency: input.frequency,
    fundId: input.fundId,
    fundName: input.fundName,
    fundCode,
    paymentMethod: input.paymentMethod,
    cardBrand: input.cardBrand,
    cardLast4: input.cardLast4,
    status: 'completed',
    dedication: input.dedication,
    isAnonymous,
    timestamp,
    nextBillingDate,
    stripePaymentIntentId: input.stripePaymentIntentId,
    plaidTransferId: input.plaidTransferId,
    plaidInstitution: input.plaidInstitution,
    plaidAccountMask: input.plaidAccountMask,
    awcDcbVoucher: input.awcDcbVoucher,
    awcSynced: Boolean(input.awcSynced),
    encryptedToken: `enc_${Math.random().toString(36).slice(2, 14)}`,
  };
  memoryDonations.unshift(donation);
  return { donor, donation, mode };
}

export async function listGiftsByEmail(email: string): Promise<{
  donor: StoredDonor | null;
  donations: StoredDonation[];
  mode: 'neon' | 'memory';
}> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) {
    return { donor: null, donations: [], mode: giftStoreMode() };
  }

  const client = getSql();
  if (client) {
    const donor = await findDonorByEmailNeon(normalized);
    const rows = await client`
      SELECT * FROM donations
      WHERE LOWER(donor_email) = ${normalized}
      ORDER BY contributed_at DESC
    `;
    return {
      donor,
      donations: rows.map((r) => mapDonationRow(r as Record<string, unknown>)),
      mode: 'neon',
    };
  }

  const donor = findDonorByEmailMemory(normalized);
  const donations = memoryDonations.filter((d) => normalizeEmail(d.donorEmail) === normalized);
  return { donor, donations, mode: 'memory' };
}

/** Staff ledger — recent gifts across all donors (Neon or memory). */
export async function listAllGifts(limit = 500): Promise<{
  donations: StoredDonation[];
  donors: StoredDonor[];
  mode: 'neon' | 'memory';
}> {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const client = getSql();
  if (client) {
    const donationRows = await client`
      SELECT * FROM donations
      ORDER BY contributed_at DESC
      LIMIT ${safeLimit}
    `;
    const donorRows = await client`
      SELECT * FROM donors
      ORDER BY last_gift_date DESC NULLS LAST
      LIMIT ${safeLimit}
    `;
    return {
      donations: donationRows.map((r) => mapDonationRow(r as Record<string, unknown>)),
      donors: donorRows.map((r) => mapDonorRow(r as Record<string, unknown>)),
      mode: 'neon',
    };
  }

  const donations = [...memoryDonations]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, safeLimit);
  const donors = [...memoryDonors.values()].slice(0, safeLimit);
  return { donations, donors, mode: 'memory' };
}
