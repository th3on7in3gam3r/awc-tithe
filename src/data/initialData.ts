import { ChurchConfig, Fund, Donor, Donation, AuditLog, AnnualPledge, DcuBankDeposit, ReconciliationDiscrepancy } from '../types';

export const initialChurchConfig: ChurchConfig = {
  name: 'Anointed Worship Center',
  legalEntityName: 'Anointed Worship Center Inc.',
  ein: '',
  address: '',
  cityStateZip: '',
  phone: '',
  email: 'stewardship@anointedworshipcenter.com',
  website: 'https://anointedworshipcenter.com',
  seniorPastor: 'Pastor Kenneth Mutegyeki',
  financialOfficer: '',
  taxExemptStatus: '501(c)(3) Public Religious Organization',
  currency: 'USD',
  stripeMode: 'test_simulator',
  stripePublishableKey: '',
  dcuBank: {
    institutionName: 'DCU Credit Union (Digital Federal Credit Union)',
    routingNumber: '',
    accountNumberMask: '',
    accountType: 'checking',
    settlementSchedule: 'daily_auto_deposit',
    status: 'pending_verification',
    lastSettlementTimestamp: '',
    totalSettledToDate: 0,
    stripeFinancialConnectionsAccountId: '',
    stripeFinancialConnectionsSessionId: '',
    financialConnectionsStatus: 'unlinked',
    plaidIntegrationStatus: 'disabled',
    autoReconcileEnabled: false,
    liveAvailableBalance: 0,
    liveCurrentBalance: 0,
    lastFinancialConnectionsSync: '',
  },
  awcDcb: {
    bookId: 'AWC-DCB-2026-GCC',
    status: 'error',
    autoSyncOnTransaction: true,
    lastSyncTimestamp: '',
    syncedRecordsCount: 0,
    apiEndpoint: '',
  },
};

export const initialFunds: Fund[] = [
  {
    id: 'fund-tithes',
    name: 'General Tithes & Offerings',
    code: '1001-OPS',
    description: 'Sustaining worship services, pastoral care, biblical education, and ongoing ministry operations.',
    goalAmount: 450000,
    currentAmount: 0,
    category: 'General',
    image: '/assets/images/church_sanctuary_hero_1790791320226.jpg',
    active: true,
  },
  {
    id: 'fund-building',
    name: 'Faith Horizon Building Campaign',
    code: '2001-CAP',
    description: 'Funding the new youth educational wing, acoustic sanctuary upgrades, and accessibility ramps.',
    goalAmount: 250000,
    currentAmount: 0,
    category: 'Capital',
    image: '/assets/images/church_building_expansion_1790791341801.jpg',
    active: true,
  },
  {
    id: 'fund-missions',
    name: 'Global Compassion & Missions',
    code: '3001-MIS',
    description: 'Supporting missionary partners, disaster relief initiatives, and clean water wells across partner nations.',
    goalAmount: 120000,
    currentAmount: 0,
    category: 'Missions',
    image: '/assets/images/outreach_mission_work_1790791331412.jpg',
    active: true,
  },
  {
    id: 'fund-benevolence',
    name: 'Community Benevolence & Food Pantry',
    code: '4001-BEN',
    description: 'Emergency grocery assistance, utility stipends, and hot meals for vulnerable local neighborhood families.',
    goalAmount: 80000,
    currentAmount: 0,
    category: 'Outreach',
    image: '/assets/images/outreach_mission_work_1790791331412.jpg',
    active: true,
  },
];

export const initialDonors: Donor[] = [];

export const initialDonations: Donation[] = [];

export const initialAuditLogs: AuditLog[] = [];

export const initialPledges: AnnualPledge[] = [];

export const initialDcuDeposits: DcuBankDeposit[] = [];

export const initialReconciliationDiscrepancies: ReconciliationDiscrepancy[] = [];
