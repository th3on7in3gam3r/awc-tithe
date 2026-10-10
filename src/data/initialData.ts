import { ChurchConfig, Fund, Donor, Donation, AuditLog, AnnualCommitment, BankSettlement, ReconciliationDiscrepancy } from '../types';

export const initialChurchConfig: ChurchConfig = {
  name: 'Anointed Worship Center',
  legalEntityName: 'Anointed Worship Center Inc.',
  ein: '',
  address: '4 School St',
  cityStateZip: 'Acton, MA 01720',
  phone: '',
  email: 'stewardship@anointedworshipcenter.com',
  website: 'https://anointedworshipcenter.com',
  seniorPastor: 'Pastor Kenneth Mutegyeki',
  financialOfficer: '',
  taxExemptStatus: '501(c)(3) Public Religious Organization',
  currency: 'USD',
  stripePublishableKey: '',
  dcuBank: {
    institutionName: '',
    accountType: 'checking',
    settlementSchedule: 'daily_auto_deposit',
    status: 'pending_verification',
    lastSettlementTimestamp: '',
    totalSettledToDate: 0,
    financialConnectionsStatus: 'unlinked',
    autoReconcileEnabled: false,
    liveAvailableBalance: 0,
    liveCurrentBalance: 0,
    lastFinancialConnectionsSync: '',
  },
  awcDcb: {
    bookId: '',
    status: 'error',
    autoSyncOnTransaction: true,
    lastSyncTimestamp: '',
    syncedRecordsCount: 0,
    apiEndpoint: '',
  },
};

/** Fallback until /api/funds loads. Matches Neon seed: Tithes & Offerings only. */
export const initialFunds: Fund[] = [
  {
    id: 'fund-tithes',
    name: 'Tithes & Offerings',
    code: '',
    description: 'General tithes and offerings supporting worship and church ministry.',
    goalAmount: 0,
    currentAmount: 0,
    category: 'General',
    active: true,
    sortOrder: 0,
  },
];

export const initialDonors: Donor[] = [];

export const initialDonations: Donation[] = [];

export const initialAuditLogs: AuditLog[] = [];

export const initialAnnualCommitments: AnnualCommitment[] = [];

export const initialBankSettlements: BankSettlement[] = [];

export const initialReconciliationDiscrepancies: ReconciliationDiscrepancy[] = [];
