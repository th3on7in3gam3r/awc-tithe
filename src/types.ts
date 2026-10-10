export type DonationFrequency = 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'annually';

export type PaymentMethod =
  | 'card'
  | 'ach'
  | 'apple_pay'
  | 'cash'
  | 'check'
  | 'cash_app'
  | 'zelle'
  | 'venmo';

export type DonationStatus = 'completed' | 'pending' | 'refunded' | 'failed';

export type UserRole = 'donor' | 'admin' | 'staff';

/** Server-enforced Staff Portal roles (loaded from staff_accounts on each request). */
export type StaffPortalRole = 'admin' | 'staff';

/** Staff-logged contribution channels (Offline Sync / Contribution Log). */
export type StaffContributionMethod =
  | 'cash'
  | 'check'
  | 'cash_app'
  | 'zelle'
  | 'venmo';

export interface Fund {
  id: string;
  name: string;
  /** @deprecated Prefer glCode; kept for localStorage compatibility. */
  code: string;
  /** Optional admin-assigned general-ledger code; empty by default. */
  glCode?: string;
  description: string;
  /** Admin-only annual goals live on the server; kept optional for local compatibility. */
  goalAmount: number;
  currentAmount: number;
  category: 'General' | 'Capital' | 'Missions' | 'Outreach';
  image?: string;
  active: boolean;
  sortOrder?: number;
}

export interface Donation {
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
  frequency: DonationFrequency;
  fundId: string;
  fundName: string;
  paymentMethod: PaymentMethod;
  cardBrand?: string;
  cardLast4?: string;
  status: DonationStatus;
  dedication?: string;
  isAnonymous: boolean;
  timestamp: string;
  nextBillingDate?: string;
  stripePaymentIntentId: string;
  encryptedToken: string;
  envelopeNumber?: string;
  awcDcbVoucher?: string;
  awcSynced?: boolean;
  dcuSettlementRef?: string;
  plaidInstitution?: string;
  plaidAccountMask?: string;
  plaidTransferId?: string;
}

export interface Donor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId?: string;
  envelopeNumber?: string;
  lifetimeGiving: number;
  totalGiftsCount: number;
  firstGiftDate: string;
  lastGiftDate: string;
  recurringActive: boolean;
  recurringAmount?: number;
  recurringFrequency?: DonationFrequency;
  gdprConsent: boolean;
  gdprConsentDate: string;
  isAnonymized?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
  integrityHash: string;
}

export interface DcuBankConfig {
  institutionName: string;
  accountType: 'checking' | 'savings';
  settlementSchedule: 'daily_auto_deposit' | 'weekly_batch';
  status: 'active' | 'pending_verification' | 'disabled';
  lastSettlementTimestamp?: string;
  totalSettledToDate: number;
  financialConnectionsStatus?: 'linked' | 'pending' | 'unlinked';
  autoReconcileEnabled?: boolean;
  liveAvailableBalance?: number;
  liveCurrentBalance?: number;
  lastFinancialConnectionsSync?: string;
}

export interface BankSettlement {
  // formerly DcuBankDeposit

  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'card_batch_settlement' | 'plaid_bank_transfer' | 'member_direct_deposit' | 'ach_recurring';
  batchReference: string;
  dcuTraceNumber: string;
  status: 'cleared' | 'settled' | 'pending_bank_clearance';
  matchedAwcVoucherId?: string;
}

export interface ReconciliationDiscrepancy {
  id: string;
  dcuDepositId?: string;
  awcVoucherNumber?: string;
  donorName?: string;
  envelopeNumber?: string;
  dcuAmount: number;
  awcAmount: number;
  varianceAmount: number;
  discrepancyType: 'fee_variance' | 'unmatched_bank_deposit' | 'pending_bank_clearance' | 'envelope_mismatch' | 'timing_delay';
  status: 'flagged' | 'in_review' | 'resolved';
  details: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  timestamp: string;
}

export interface AwcDcbConfig {
  bookId: string;
  status: 'connected' | 'syncing' | 'error';
  autoSyncOnTransaction: boolean;
  lastSyncTimestamp: string;
  syncedRecordsCount: number;
  apiEndpoint: string;
}

export interface AwcDcbEntry {
  id: string;
  voucherNumber: string;
  donationId: string;
  donorName: string;
  donorEmail: string;
  envelopeNumber: string;
  fundCode: string;
  fundName: string;
  grossAmount: number;
  feeAmount: number;
  netDepositToDcu: number;
  cardBrand: string;
  cardLast4: string;
  dcuBatchReference: string;
  syncedAt: string;
  status: 'reconciled' | 'pending_settlement';
}

export interface ChurchConfig {
  name: string;
  legalEntityName: string;
  ein: string;
  address: string;
  cityStateZip: string;
  phone: string;
  email: string;
  website: string;
  seniorPastor: string;
  financialOfficer: string;
  taxExemptStatus: string;
  currency: string;
  stripePublishableKey: string;
  dcuBank: DcuBankConfig;
  awcDcb: AwcDcbConfig;
}


export interface OfflineGift {
  id: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  fundId: string;
  frequency: DonationFrequency;
  method: StaffContributionMethod;
  /** Check number, Cash App cashtag, Zelle confirmation, Venmo name, etc. */
  checkNumber?: string;
  channelReference?: string;
  note?: string;
  timestamp: string;
  synced: boolean;
}

export interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

export interface AnnualCommitment {
  // formerly AnnualPledge

  id: string;
  donorId: string;
  donorName: string;
  donorEmail: string;
  taxYear: number;
  fundId: string;
  fundName: string;
  committedAmount: number;
  fulfilledAmount: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'fulfilled' | 'behind' | 'ahead';
  notes?: string;
}

export interface FundCommitmentGap {
  fundId: string;
  fundName: string;
  totalCommitted: number;
  totalReceived: number;
  gapAmount: number;
  percentFulfilled: number;
  commitmentCount: number;
}

export interface CommitmentGapSummary {
  taxYear: number;
  totalCommitted: number;
  totalReceived: number;
  netGap: number;
  percentFulfilled: number;
  totalCommitmentsCount: number;
  fulfilledCommitmentsCount: number;
  activeCommitmentsCount: number;
  fundBreakdown: FundCommitmentGap[];
}

export type AppPortalMode = 'public' | 'admin';



/** @deprecated aliases */
export type AnnualPledge = AnnualCommitment;
export type DcuBankDeposit = BankSettlement;
export type PledgeGapSummary = CommitmentGapSummary;
export type FundPledgeGap = FundCommitmentGap;
