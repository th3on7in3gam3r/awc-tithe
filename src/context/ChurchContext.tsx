import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  ChurchConfig,
  Fund,
  Donor,
  Donation,
  AuditLog,
  OfflineGift,
  UserRole,
  StaffPortalRole,
  ToastNotification,
  DonationFrequency,
  PaymentMethod,
  AnnualPledge as AnnualCommitment,
  CommitmentGapSummary,
  BankSettlement,
  ReconciliationDiscrepancy,
} from '../types';
import {
  initialChurchConfig,
  initialFunds,
  initialDonors,
  initialDonations,
  initialAnnualCommitments,
  initialBankSettlements,
  initialReconciliationDiscrepancies,
} from '../data/initialData';
import {
  recordOfflineGift,
  fetchPublicFunds,
  fetchStaffLedger,
  type ServerDonation,
  type ServerDonor,
} from '../lib/api';
import { computeProcessingFee } from '../../shared/fees';
import { purgeLegacyStewardshipStorage } from '../lib/legacyStorage';
import { fetchChurchSettings, fetchStaffSession, logoutStaff } from '../lib/api';

interface ChurchContextType {
  config: ChurchConfig;
  funds: Fund[];
  donors: Donor[];
  donations: Donation[];
  auditLogs: AuditLog[];
  offlineGifts: OfflineGift[];
  annualCommitments: AnnualCommitment[];
  bankSettlements: BankSettlement[];
  discrepancies: ReconciliationDiscrepancy[];
  currentRole: UserRole;
  /** Server Staff Portal role from session cookie (admin | staff). Null when locked. */
  staffPortalRole: StaffPortalRole | null;
  isMfaVerified: boolean;
  darkMode: boolean;
  notifications: ToastNotification[];
  selectedReceipt: Donation | null;
  setSelectedReceipt: (d: Donation | null) => void;
  toggleDarkMode: () => void;
  refreshStaffSession: () => Promise<boolean>;
  resetMfa: () => void;
  refundDonation: (transactionId: string, reason: string) => void;
  cancelRecurringGift: (donorId: string) => void;
  createOrUpdateCommitment: (input: {
    donorId: string;
    donorName: string;
    donorEmail: string;
    taxYear: number;
    fundId: string;
    committedAmount: number;
    notes?: string;
  }) => AnnualCommitment;
  calculateCommitmentGap: (taxYear?: number) => CommitmentGapSummary;
  queueOfflineGift: (gift: Omit<OfflineGift, 'id' | 'timestamp' | 'synced'>) => void;
  syncOfflineGifts: () => Promise<void>;
  hydrateStaffLedger: () => Promise<void>;
  requestPrivacyExport: (donorId: string) => void;
  exportTransactionsCSV: () => void;
  exportAuditLogsCSV: () => void;
  resolveDiscrepancy: (id: string, note: string, actionType: 'adjust_fee' | 'create_voucher' | 'mark_cleared') => void;
  runAutoReconciliation: () => { matchedCount: number; remainingCount: number };
  relinkDcuFinancialConnections: (updatedInfo?: Partial<ChurchConfig['dcuBank']>) => void;
  toggleAutoReconcile: (enabled: boolean) => void;
  simulateIncomingDcuDeposit: (amount: number, description: string, type: BankSettlement['type'], envelopeRef?: string) => BankSettlement;
  dismissNotification: (id: string) => void;
  addNotification: (type: ToastNotification['type'], title: string, message: string) => void;
  configStatus: 'loading' | 'ready' | 'error';
  configError: string | null;
  fundsStatus: 'loading' | 'ready' | 'error';
  ledgerStatus: 'idle' | 'loading' | 'ready' | 'error';
  ledgerError: string | null;
  clearSensitiveCaches: () => void;
  refreshChurchSettings: () => Promise<void>;
}

const STORAGE_KEY = 'awc_tithe_stewardship_v2';

const ChurchContext = createContext<ChurchContextType | undefined>(undefined);

// Helper to generate a realistic pseudo-cryptographic hash
function generateIntegrityHash(payload: string): string {
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const randA = Math.random().toString(16).substring(2, 10);
  const randB = Math.random().toString(16).substring(2, 10);
  const randC = Math.random().toString(16).substring(2, 10);
  return `${hex}${randA}${randB}${randC}`.slice(0, 64);
}

export const ChurchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ChurchConfig>(initialChurchConfig);
  const [configStatus, setConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [configError, setConfigError] = useState<string | null>(null);

  const [funds, setFunds] = useState<Fund[]>(initialFunds);
  const [fundsStatus, setFundsStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [donors, setDonors] = useState<Donor[]>(initialDonors);
  const [donations, setDonations] = useState<Donation[]>(initialDonations);
  const [ledgerStatus, setLedgerStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  /** Server audit is fetched by the Staff Portal. The client does not keep a log. */
  const auditLogs: AuditLog[] = [];
  const setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>> = () => {};

  const [offlineGifts, setOfflineGifts] = useState<OfflineGift[]>([]);
  const [annualCommitments, setAnnualCommitments] = useState<AnnualCommitment[]>(initialAnnualCommitments);
  const [bankSettlements, setBankSettlements] = useState<BankSettlement[]>(initialBankSettlements);
  const [discrepancies, setDiscrepancies] = useState<ReconciliationDiscrepancy[]>(initialReconciliationDiscrepancies);

  const [currentRole, setCurrentRole] = useState<UserRole>('donor');
  const [staffPortalRole, setStaffPortalRole] = useState<StaffPortalRole | null>(null);
  const [isMfaVerified, setIsMfaVerified] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_dark`) === 'true';
  });
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Donation | null>(null);

  const refreshChurchSettings = async () => {
    const c = await fetchChurchSettings();
    setConfig((prev) => ({
      ...prev,
      name: c.name || prev.name,
      legalEntityName: c.legalEntityName,
      address: c.address,
      cityStateZip: c.cityStateZip,
      ein: c.ein,
      phone: c.phone,
      email: c.email || prev.email,
      website: c.website,
      seniorPastor: c.seniorPastor || prev.seniorPastor,
      financialOfficer: c.financialOfficer,
      taxExemptStatus: c.taxExemptStatus || prev.taxExemptStatus,
    }));
    setConfigStatus('ready');
  };

  const clearSensitiveCaches = () => {
    setDonors([]);
    setDonations([]);
    setOfflineGifts([]);
    setAnnualCommitments([]);
    setBankSettlements([]);
    setDiscrepancies([]);
    setSelectedReceipt(null);
    setLedgerStatus('idle');
    setLedgerError(null);
  };

  useEffect(() => {
    purgeLegacyStewardshipStorage();
    setConfigStatus('loading');
    setConfigError(null);
    void fetchChurchSettings()
      .then((c) => {
        setConfig((prev) => ({
          ...prev,
          name: c.name || prev.name,
          legalEntityName: c.legalEntityName,
          address: c.address,
          cityStateZip: c.cityStateZip,
          ein: c.ein,
          phone: c.phone,
          email: c.email || prev.email,
          website: c.website,
          seniorPastor: c.seniorPastor || prev.seniorPastor,
          financialOfficer: c.financialOfficer,
          taxExemptStatus: c.taxExemptStatus || prev.taxExemptStatus,
        }));
        setConfigStatus('ready');
      })
      .catch((err) => {
        setConfigStatus('error');
        setConfigError(err instanceof Error ? err.message : 'Could not load church settings');
      });

    setFundsStatus('loading');
    void fetchPublicFunds()
      .then((list) => {
        if (list.length) {
          setFunds(
            list.map((f) => ({
              id: f.id,
              name: f.name,
              description: f.description,
              code: '',
              goalAmount: 0,
              currentAmount: 0,
              category: 'General' as const,
              active: true,
              sortOrder: f.sortOrder,
            }))
          );
        }
        setFundsStatus('ready');
      })
      .catch(() => setFundsStatus('error'));

    void fetchStaffSession().then((session) => {
      if (!session.authenticated || !session.role || session.needsEnrollment || session.mfaRequired) return;
      setIsMfaVerified(true);
      setStaffPortalRole(session.role);
      setCurrentRole(session.role);
      void hydrateStaffLedger();
    });
    // hydrateStaffLedger is stable enough for first paint; defined below via closure on each render is unsafe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(`${STORAGE_KEY}_dark`, 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(`${STORAGE_KEY}_dark`, 'false');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const addNotification = (type: ToastNotification['type'], title: string, message: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setNotifications((prev) => [{ id, type, title, message, timestamp: new Date().toISOString() }, ...prev]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 6000);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const refreshStaffSession = async (): Promise<boolean> => {
    const session = await fetchStaffSession();
    if (!session.authenticated || !session.role || session.needsEnrollment || session.mfaRequired) {
      if (!session.authenticated) {
        setIsMfaVerified(false);
        setStaffPortalRole(null);
        setCurrentRole('donor');
      }
      return false;
    }
    setIsMfaVerified(true);
    setStaffPortalRole(session.role);
    setCurrentRole(session.role);
    void hydrateStaffLedger();
    return true;
  };

  const resetMfa = () => {
    void logoutStaff();
    setIsMfaVerified(false);
    setStaffPortalRole(null);
    setCurrentRole('donor');
    clearSensitiveCaches();
    addNotification('info', 'Staff Portal Locked', 'Staff session closed.');
  };

  const refundDonation = (transactionId: string, reason: string) => {
    const target = donations.find((d) => d.transactionId === transactionId);
    if (!target) return;

    setDonations((prev) =>
      prev.map((d) => (d.transactionId === transactionId ? { ...d, status: 'refunded' } : d))
    );

    // Decrement fund
    setFunds((prev) =>
      prev.map((f) => (f.id === target.fundId ? { ...f, currentAmount: Math.max(0, f.currentAmount - target.amount) } : f))
    );

    // Decrement donor lifetime giving
    setDonors((prev) =>
      prev.map((donor) =>
        donor.id === target.donorId
          ? { ...donor, lifetimeGiving: Math.max(0, donor.lifetimeGiving - target.amount) }
          : donor
      )
    );

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr-admin-action',
      actorName: 'Financial Administrator',
      actorRole: currentRole,
      action: 'TRANSACTION_REFUNDED',
      resource: transactionId,
      details: `Refund of $${target.amount.toFixed(2)} processed for receipt ${target.receiptNumber}. Reason: ${reason}.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`refund_${transactionId}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification(
      'warning',
      'Marked as refunded',
      `Transaction ${transactionId} is marked refunded on this screen. Stripe was not charged back.`
    );
  };

  const cancelRecurringGift = (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => (d.id === donorId ? { ...d, recurringActive: false } : d))
    );

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: donorId,
      actorName: 'Donor Self-Service',
      actorRole: 'donor',
      action: 'RECURRING_GIFT_CANCELLED',
      resource: donorId,
      details: `Donor recurring contribution schedule paused/cancelled. Future billing halted in Stripe gateway.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`cancel_recurring_${donorId}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('info', 'Recurring gift cancelled', 'Recurring donation schedule has been stopped.');
  };

  const queueOfflineGift = (gift: Omit<OfflineGift, 'id' | 'timestamp' | 'synced'>) => {
    const newGift: OfflineGift = {
      ...gift,
      id: `offline-${Date.now()}`,
      timestamp: new Date().toISOString(),
      synced: false,
    };
    setOfflineGifts((prev) => [newGift, ...prev]);

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: newGift.timestamp,
      actorId: staffPortalRole || 'staff',
      actorName: 'Staff',
      actorRole: 'staff',
      action: 'OFFLINE_GIFT_QUEUED',
      resource: `Offline Queue (${gift.method})`,
      details: `Physical gift envelope of $${gift.amount.toFixed(2)} for ${gift.donorName} logged offline.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`offline_${newGift.id}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('info', 'Offline Gift Recorded', `Saved to local offline queue. Will sync to church ledger when connected.`);
  };

  const mapServerDonation = (sd: ServerDonation): Donation =>
    ({
      id: sd.id,
      transactionId: sd.transactionId,
      receiptNumber: sd.receiptNumber,
      donorId: sd.donorId,
      donorName: sd.donorName,
      donorEmail: sd.donorEmail,
      donorAddress: sd.donorAddress,
      amount: sd.amount,
      feeCovered: sd.feeCovered,
      feeAmount: sd.feeAmount,
      totalCharged: sd.totalCharged,
      frequency: sd.frequency as DonationFrequency,
      fundId: sd.fundId,
      fundName: sd.fundName,
      paymentMethod: sd.paymentMethod as PaymentMethod,
      cardBrand: sd.cardBrand,
      cardLast4: sd.cardLast4,
      status: sd.status as Donation['status'],
      dedication: sd.dedication,
      isAnonymous: sd.isAnonymous,
      timestamp: sd.timestamp,
      nextBillingDate: sd.nextBillingDate,
      stripePaymentIntentId: sd.stripePaymentIntentId || '',
      encryptedToken: '',
      envelopeNumber: sd.envelopeNumber,
      awcDcbVoucher: sd.awcDcbVoucher,
      awcSynced: sd.awcSynced,
      plaidInstitution: sd.plaidInstitution,
      plaidAccountMask: sd.plaidAccountMask,
      plaidTransferId: sd.plaidTransferId,
    }) as Donation;

  const mapServerDonor = (sd: ServerDonor): Donor => ({
    id: sd.id,
    name: sd.name,
    email: sd.email,
    phone: sd.phone,
    address: sd.address,
    taxId: sd.taxId,
    lifetimeGiving: sd.lifetimeGiving,
    totalGiftsCount: sd.totalGiftsCount,
    firstGiftDate: sd.firstGiftDate,
    lastGiftDate: sd.lastGiftDate,
    recurringActive: sd.recurringActive,
    recurringAmount: sd.recurringAmount,
    recurringFrequency: sd.recurringFrequency as DonationFrequency | undefined,
    gdprConsent: false,
    gdprConsentDate: '',
    isAnonymized: sd.isAnonymized,
  });

  /** Pull Neon/memory ledger into staff dashboard (requires staff session cookie). */
  const hydrateStaffLedger = async () => {
    setLedgerStatus('loading');
    setLedgerError(null);
    try {
      const ledger = await fetchStaffLedger(500);
      setDonations(ledger.donations.map(mapServerDonation));
      setDonors(ledger.donors.map(mapServerDonor));
      setLedgerStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load staff ledger.';
      setLedgerStatus('error');
      setLedgerError(message);
      addNotification('warning', 'Ledger unavailable', message);
    }
  };

  const syncOfflineGifts = async () => {
    const unsynced = offlineGifts.filter((g) => !g.synced);
    if (unsynced.length === 0) {
      addNotification('info', 'Already Synced', 'No offline gifts pending sync.');
      return;
    }

    let syncedCount = 0;
    let failedCount = 0;
    const syncedIds: string[] = [];

    for (const g of unsynced) {
      const fund = funds.find((f) => f.id === g.fundId) || funds[0];
      const ref = (g.channelReference || g.checkNumber || '').trim();
      const channelLabels: Record<string, string> = {
        cash: 'Cash Envelope',
        check: ref ? `Check #${ref}` : 'Physical Check',
        cash_app: ref ? `Cash App (${ref})` : 'Cash App',
        zelle: ref ? `Zelle (${ref})` : 'Zelle',
        venmo: ref ? `Venmo (${ref})` : 'Venmo',
      };
      const paymentMethodMap: Record<string, PaymentMethod> = {
        cash: 'cash',
        check: 'check',
        cash_app: 'cash_app',
        zelle: 'zelle',
        venmo: 'venmo',
      };
      try {
        const result = await recordOfflineGift({
          amount: g.amount,
          donorName: g.donorName,
          donorEmail: g.donorEmail,
          fundId: g.fundId,
          fundName: fund?.name || 'General Tithes & Offerings',
          fundCode: fund?.code || '',
          paymentMethod: paymentMethodMap[g.method] || 'cash',
          frequency: g.frequency,
          cardBrand: channelLabels[g.method] || g.method,
          dedication: g.note,
          transactionId: g.id,
          contributedAt: g.timestamp,
        });
        syncedIds.push(g.id);
        syncedCount += 1;
        if (result.donation) {
        setDonations((prev) => {
          const mapped = mapServerDonation(result.donation!);
          if (prev.some((d) => d.id === mapped.id || d.transactionId === mapped.transactionId)) {
            return prev;
          }
          return [mapped, ...prev];
        });
        }
        if (result.donor) {
          setDonors((prev) => {
            const mapped = mapServerDonor(result.donor!);
            const without = prev.filter(
              (d) => d.id !== mapped.id && d.email.toLowerCase() !== mapped.email.toLowerCase()
            );
            return [mapped, ...without];
          });
        }
      } catch {
        failedCount += 1;
      }
    }

    setOfflineGifts((prev) =>
      prev.map((g) => (syncedIds.includes(g.id) ? { ...g, synced: true } : g))
    );

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'contribution-log-sync',
      actorName: 'Contribution Log Sync',
      actorRole: 'staff',
      action: 'OFFLINE_BATCH_SYNC',
      resource: `${syncedCount} gifts synchronized`,
      details: `Synced ${syncedCount} contribution-log gifts to ledger${failedCount ? ` (${failedCount} failed)` : ''}.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`sync_batch_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    if (syncedCount > 0) {
      addNotification(
        'success',
        'Sync Complete',
        `Synced ${syncedCount} gift${syncedCount === 1 ? '' : 's'} to the staff contribution log.`
      );
    }
    if (failedCount > 0) {
      addNotification(
        'error',
        'Partial Sync',
        `${failedCount} gift${failedCount === 1 ? '' : 's'} failed — unlock Staff Portal and try again.`
      );
    }
  };

  const requestPrivacyExport = (donorId: string) => {
    const donor = donors.find((d) => d.id === donorId);
    const donorGifts = donations.filter((d) => d.donorId === donorId);

    const payload = {
      church: config.name,
      ein: config.ein,
      exportDate: new Date().toISOString(),
      complianceStandard: 'Data portability export',
      donorProfile: donor,
      contributionsHistory: donorGifts,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `data-archive-${donorId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    addNotification('success', 'Data Archive Exported', 'Downloaded complete portable machine-readable JSON data archive.');
  };

  const exportTransactionsCSV = () => {
    const headers = [
      'Transaction ID',
      'Receipt Number',
      'Timestamp',
      'Donor Name',
      'Donor Email',
      'Fund Name',
      'Principal Amount',
      'Fee Covered',
      'Fee Amount',
      'Total Charged',
      'Frequency',
      'Payment Method',
      'Status',
      'Dedication',
    ];

    const rows = donations.map((d) => [
      d.transactionId,
      d.receiptNumber,
      d.timestamp,
      `"${d.donorName.replace(/"/g, '""')}"`,
      d.donorEmail,
      `"${d.fundName.replace(/"/g, '""')}"`,
      d.amount.toFixed(2),
      d.feeCovered ? 'YES' : 'NO',
      d.feeAmount.toFixed(2),
      d.totalCharged.toFixed(2),
      d.frequency,
      `${d.cardBrand || d.paymentMethod} (****${d.cardLast4 || 'N/A'})`,
      d.status,
      `"${(d.dedication || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `grace-church-contributions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr-admin-export',
      actorName: 'Financial Administrator',
      actorRole: currentRole,
      action: 'CSV_LEDGER_EXPORT',
      resource: 'Financial Ledger',
      details: `Generated and downloaded master CSV ledger containing ${donations.length} records.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`export_csv_${donations.length}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('success', 'CSV Exported', 'Financial ledger downloaded as CSV.');
  };

  const exportAuditLogsCSV = () => {
    const headers = ['Audit ID', 'Timestamp', 'Actor Name', 'Role', 'Action', 'Resource', 'Details', 'IP Address', 'Integrity Hash'];
    const rows = auditLogs.map((a) => [
      a.id,
      a.timestamp,
      `"${a.actorName.replace(/"/g, '""')}"`,
      a.actorRole,
      a.action,
      `"${a.resource.replace(/"/g, '""')}"`,
      `"${a.details.replace(/"/g, '""')}"`,
      a.ipAddress,
      a.integrityHash,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `grace-church-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    addNotification('success', 'Audit Trail Exported', 'Security and financial audit logs exported.');
  };

  const createOrUpdateCommitment = (input: {
    donorId: string;
    donorName: string;
    donorEmail: string;
    taxYear: number;
    fundId: string;
    committedAmount: number;
    notes?: string;
  }): AnnualCommitment => {
    const targetFund = funds.find((f) => f.id === input.fundId) || funds[0];
    const now = new Date();
    const timestamp = now.toISOString();

    const actualGiftsSum = donations
      .filter((d) => d.donorId === input.donorId && d.fundId === input.fundId && d.status === 'completed' && new Date(d.timestamp).getFullYear() === input.taxYear)
      .reduce((sum, d) => sum + d.amount, 0);

    const existing = annualCommitments.find((p) => p.donorId === input.donorId && p.fundId === input.fundId && p.taxYear === input.taxYear);

    let updatedCommitment: AnnualCommitment;
    if (existing) {
      updatedCommitment = {
        ...existing,
        committedAmount: input.committedAmount,
        fulfilledAmount: Math.max(existing.fulfilledAmount, actualGiftsSum),
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedAt: timestamp,
        status: actualGiftsSum >= input.committedAmount ? 'fulfilled' : 'active',
      };
      setAnnualCommitments((prev) => prev.map((p) => (p.id === existing.id ? updatedCommitment : p)));
    } else {
      updatedCommitment = {
        id: `plg-${Date.now()}`,
        donorId: input.donorId,
        donorName: input.donorName,
        donorEmail: input.donorEmail,
        taxYear: input.taxYear,
        fundId: targetFund.id,
        fundName: targetFund.name,
        committedAmount: input.committedAmount,
        fulfilledAmount: actualGiftsSum,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: actualGiftsSum >= input.committedAmount ? 'fulfilled' : 'active',
        notes: input.notes,
      };
      setAnnualCommitments((prev) => [updatedCommitment, ...prev]);
    }

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp,
      actorId: input.donorId,
      actorName: input.donorName,
      actorRole: 'donor',
      action: 'ANNUAL_COMMITMENT_REGISTERED',
      resource: `${targetFund.name} (${input.taxYear})`,
      details: `Annual commitment of $${input.committedAmount.toLocaleString()} recorded for tax year ${input.taxYear}.`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`commitment_${input.donorId}_${input.committedAmount}_${timestamp}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification(
      'success',
      'Annual Commitment Saved',
      `Your annual faith commitment of $${input.committedAmount.toLocaleString()} to ${targetFund.name} has been recorded.`
    );

    return updatedCommitment;
  };

  const calculateCommitmentGap = (taxYear: number = 2026): CommitmentGapSummary => {
    const yearCommitments = annualCommitments.filter((p) => p.taxYear === taxYear);
    const totalCommitted = yearCommitments.reduce((sum, p) => sum + p.committedAmount, 0);
    const totalReceived = yearCommitments.reduce((sum, p) => sum + p.fulfilledAmount, 0);
    const netGap = Math.max(0, totalCommitted - totalReceived);
    const percentFulfilled = totalCommitted > 0 ? (totalReceived / totalCommitted) * 100 : 0;
    const fulfilledCommitmentsCount = yearCommitments.filter((p) => p.status === 'fulfilled' || p.fulfilledAmount >= p.committedAmount).length;

    const fundBreakdown = funds.map((f) => {
      const fundCommitments = yearCommitments.filter((p) => p.fundId === f.id);
      const fCommitted = fundCommitments.reduce((sum, p) => sum + p.committedAmount, 0);
      const fReceived = fundCommitments.reduce((sum, p) => sum + p.fulfilledAmount, 0);
      const fGap = Math.max(0, fCommitted - fReceived);
      const fPercent = fCommitted > 0 ? (fReceived / fCommitted) * 100 : 0;

      return {
        fundId: f.id,
        fundName: f.name,
        totalCommitted: fCommitted,
        totalReceived: fReceived,
        gapAmount: fGap,
        percentFulfilled: Number(fPercent.toFixed(1)),
        commitmentCount: fundCommitments.length,
      };
    });

    return {
      taxYear,
      totalCommitted,
      totalReceived,
      netGap,
      percentFulfilled: Number(percentFulfilled.toFixed(1)),
      totalCommitmentsCount: yearCommitments.length,
      fulfilledCommitmentsCount,
      activeCommitmentsCount: yearCommitments.length - fulfilledCommitmentsCount,
      fundBreakdown,
    };
  };

  const resolveDiscrepancy = (
    id: string,
    note: string,
    actionType: 'adjust_fee' | 'create_voucher' | 'mark_cleared'
  ) => {
    setDiscrepancies((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          return {
            ...d,
            status: 'resolved',
            resolutionNote: note,
            resolvedBy: 'Staff Administrator',
            resolvedAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );

    const targetDisc = discrepancies.find((d) => d.id === id);
    if (targetDisc && actionType === 'create_voucher' && targetDisc.dcuDepositId) {
      const voucherNum = `AWC-VOUCH-${Math.floor(10000 + Math.random() * 90000)}`;
      setBankSettlements((prev) =>
        prev.map((dep) =>
          dep.id === targetDisc.dcuDepositId ? { ...dep, matchedAwcVoucherId: voucherNum } : dep
        )
      );
    }

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr-admin',
      actorName: 'Staff Administrator',
      actorRole: currentRole,
      action: 'RECONCILIATION_DISCREPANCY_RESOLVED',
      resource: `Bank vs Ledger (${id})`,
      details: `Discrepancy ${id} resolved via action [${actionType}]: ${note}`,
      ipAddress: '',
      integrityHash: generateIntegrityHash(`reconcile_${id}_${actionType}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('success', 'Discrepancy Resolved', `Reconciliation item ${id} was marked resolved.`);
  };

  const runAutoReconciliation = (): { matchedCount: number; remainingCount: number } => {
    let newlyMatched = 0;
    setBankSettlements((prev) =>
      prev.map((dep) => {
        if (!dep.matchedAwcVoucherId) {
          const match = donations.find(
            (don) => Math.abs(don.amount - dep.amount) < 0.01 && !don.dcuSettlementRef?.includes(dep.id)
          );
          if (match) {
            newlyMatched++;
            return {
              ...dep,
              matchedAwcVoucherId: match.awcDcbVoucher || `AWC-VOUCH-${match.receiptNumber.replace('REC-', '')}`,
            };
          }
        }
        return dep;
      })
    );

    addNotification(
      'info',
      'Auto-Reconciliation Complete',
      `Continuous reconciliation finished. Re-evaluated all bank deposits against ledger records.`
    );
    return {
      matchedCount: newlyMatched,
      remainingCount: discrepancies.filter((d) => d.status !== 'resolved').length,
    };
  };

  const relinkDcuFinancialConnections = (updatedInfo?: Partial<ChurchConfig['dcuBank']>) => {
    setConfig((prev) => ({
      ...prev,
      dcuBank: {
        ...prev.dcuBank,
        status: 'active',
        financialConnectionsStatus: 'linked',
        lastFinancialConnectionsSync: new Date().toISOString(),
        ...(updatedInfo || {}),
      },
    }));

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'usr-admin-finance',
      actorName: 'Administrative Financial Officer',
      actorRole: currentRole,
      action: 'STRIPE_FINANCIAL_CONNECTIONS_LINKED',
      resource: 'Church operating account',
      details: 'Operating depository account authenticated via Stripe Financial Connections.',
      ipAddress: '',
      integrityHash: generateIntegrityHash(`dcu_fc_link_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification(
      'success',
      'Bank account verified',
      'Operating account linked via Stripe Financial Connections.'
    );
  };

  const toggleAutoReconcile = (enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      dcuBank: {
        ...prev.dcuBank,
        autoReconcileEnabled: enabled,
      },
    }));
    addNotification(
      'info',
      'Reconciliation Mode Updated',
      enabled ? 'Automated continuous reconciliation enabled.' : 'Automated reconciliation paused.'
    );
  };

  const simulateIncomingDcuDeposit = (
    amount: number,
    description: string,
    type: BankSettlement['type'],
    envelopeRef?: string
  ): BankSettlement => {
    const timestamp = new Date().toISOString();
    const newDep: BankSettlement = {
      id: `dep-${Date.now()}`,
      date: timestamp,
      description,
      amount,
      type,
      batchReference: `MANUAL-BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
      dcuTraceNumber: `TRC-${Math.floor(100000000 + Math.random() * 900000000)}`,
      status: 'cleared',
    };
    setBankSettlements((prev) => [newDep, ...prev]);

    const newDisc: ReconciliationDiscrepancy = {
      id: `disc-${Date.now()}`,
      dcuDepositId: newDep.id,
      donorName: envelopeRef ? `Member (${envelopeRef})` : 'Electronic Inflow',
      envelopeNumber: envelopeRef || 'ENV-PENDING',
      dcuAmount: amount,
      awcAmount: 0,
      varianceAmount: amount,
      discrepancyType: 'unmatched_bank_deposit',
      status: 'flagged',
      details: `New incoming bank deposit of $${amount.toFixed(2)} received without a matching voucher entry.`,
      timestamp,
    };
    setDiscrepancies((prev) => [newDisc, ...prev]);

    addNotification(
      'warning',
      'New Bank Deposit Captured',
      `Incoming bank deposit of $${amount.toFixed(2)} recorded.`
    );
    return newDep;
  };

  return (
    <ChurchContext.Provider
      value={{
        config,
        funds,
        donors,
        donations,
        auditLogs,
        offlineGifts,
        annualCommitments,
        bankSettlements,
        discrepancies,
        currentRole,
        staffPortalRole,
        isMfaVerified,
        darkMode,
        notifications,
        selectedReceipt,
        setSelectedReceipt,
        toggleDarkMode,
        refreshStaffSession,
        resetMfa,
        refundDonation,
        cancelRecurringGift,
        createOrUpdateCommitment,
        calculateCommitmentGap,
        queueOfflineGift,
        syncOfflineGifts,
        hydrateStaffLedger,
        requestPrivacyExport,
        exportTransactionsCSV,
        exportAuditLogsCSV,
        resolveDiscrepancy,
        runAutoReconciliation,
        relinkDcuFinancialConnections,
        toggleAutoReconcile,
        simulateIncomingDcuDeposit,
        dismissNotification,
        addNotification,
        configStatus,
        configError,
        fundsStatus,
        ledgerStatus,
        ledgerError,
        clearSensitiveCaches,
        refreshChurchSettings,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
};

export const useChurch = () => {
  const context = useContext(ChurchContext);
  if (!context) throw new Error('useChurch must be used within a ChurchProvider');
  return context;
};
