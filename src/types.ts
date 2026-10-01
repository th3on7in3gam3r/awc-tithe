export type DonationFrequency = 'one-time' | 'weekly' | 'bi-weekly' | 'monthly' | 'annually';

export type PaymentMethod = 'card' | 'ach' | 'apple_pay' | 'plaid';

export type DonationStatus = 'completed' | 'pending' | 'refunded' | 'failed';

export type UserRole = 'donor' | 'pastor' | 'admin' | 'bookkeeper' | 'auditor';

export interface Fund {
  id: string;
  name: string;
  code: string;
  description: string;
  goalAmount: number;
  currentAmount: number;
  category: 'General' | 'Capital' | 'Missions' | 'Outreach';
  image?: string;
  active: boolean;
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
  routingNumber: string;
  accountNumberMask: string;
  accountType: 'checking' | 'savings';
  settlementSchedule: 'daily_auto_deposit' | 'weekly_batch';
  status: 'active' | 'pending_verification' | 'disabled';
  lastSettlementTimestamp?: string;
  totalSettledToDate: number;
  stripeFinancialConnectionsAccountId?: string;
  stripeFinancialConnectionsSessionId?: string;
  financialConnectionsStatus?: 'linked' | 'pending' | 'unlinked';
  plaidIntegrationStatus?: 'active' | 'configuring' | 'disabled';
  autoReconcileEnabled?: boolean;
  liveAvailableBalance?: number;
  liveCurrentBalance?: number;
  lastFinancialConnectionsSync?: string;
}

export interface DcuBankDeposit {
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
  stripeMode: 'test_simulator' | 'live_key';
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
  method: 'cash' | 'check' | 'card_kiosk';
  checkNumber?: string;
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

export interface AnnualPledge {
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

export interface FundPledgeGap {
  fundId: string;
  fundName: string;
  totalPledged: number;
  totalReceived: number;
  gapAmount: number;
  percentFulfilled: number;
  pledgeCount: number;
}

export interface PledgeGapSummary {
  taxYear: number;
  totalPledged: number;
  totalReceived: number;
  netGap: number;
  percentFulfilled: number;
  totalPledgesCount: number;
  fulfilledPledgesCount: number;
  activePledgesCount: number;
  fundBreakdown: FundPledgeGap[];
}

export type AppPortalMode = 'public' | 'admin';


