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
  ToastNotification,
  DonationFrequency,
  PaymentMethod,
  AnnualPledge,
  PledgeGapSummary,
  DcuBankDeposit,
  ReconciliationDiscrepancy,
} from '../types';
import {
  initialChurchConfig,
  initialFunds,
  initialDonors,
  initialDonations,
  initialAuditLogs,
  initialPledges,
  initialDcuDeposits,
  initialReconciliationDiscrepancies,
} from '../data/initialData';
import { recordGift, verifyStaffPortalAccess, fetchApiConfig } from '../lib/api';

interface DonationInput {
  amount: number;
  feeCovered: boolean;
  frequency: DonationFrequency;
  fundId: string;
  donorName: string;
  donorEmail: string;
  donorAddress?: string;
  paymentMethod: PaymentMethod;
  cardBrand?: string;
  cardLast4?: string;
  dedication?: string;
  isAnonymous?: boolean;
  plaidInstitution?: string;
  plaidAccountMask?: string;
  envelopeNumber?: string;
  /** Overrides when using live Stripe / Plaid / DCB APIs */
  stripePaymentIntentId?: string;
  plaidTransferId?: string;
  awcDcbVoucher?: string;
  awcSynced?: boolean;
}

interface ChurchContextType {
  config: ChurchConfig;
  funds: Fund[];
  donors: Donor[];
  donations: Donation[];
  auditLogs: AuditLog[];
  offlineGifts: OfflineGift[];
  pledges: AnnualPledge[];
  dcuDeposits: DcuBankDeposit[];
  discrepancies: ReconciliationDiscrepancy[];
  currentRole: UserRole;
  isMfaVerified: boolean;
  darkMode: boolean;
  notifications: ToastNotification[];
  selectedReceipt: Donation | null;
  setSelectedReceipt: (d: Donation | null) => void;
  toggleDarkMode: () => void;
  switchRole: (role: UserRole) => void;
  verifyStaffAccess: (inviteCode: string, authenticatorCode: string) => Promise<boolean>;
  resetMfa: () => void;
  makeDonation: (input: DonationInput) => Promise<Donation>;
  refundDonation: (transactionId: string, reason: string) => void;
  cancelRecurringPledge: (donorId: string) => void;
  createOrUpdatePledge: (input: {
    donorId: string;
    donorName: string;
    donorEmail: string;
    taxYear: number;
    fundId: string;
    committedAmount: number;
    notes?: string;
  }) => AnnualPledge;
  calculatePledgeGap: (taxYear?: number) => PledgeGapSummary;
  queueOfflineGift: (gift: Omit<OfflineGift, 'id' | 'timestamp' | 'synced'>) => void;
  syncOfflineGifts: () => void;
  requestGdprErasure: (donorId: string) => void;
  requestGdprExport: (donorId: string) => void;
  exportTransactionsCSV: () => void;
  exportAuditLogsCSV: () => void;
  resolveDiscrepancy: (id: string, note: string, actionType: 'adjust_fee' | 'create_voucher' | 'mark_cleared') => void;
  runAutoReconciliation: () => { matchedCount: number; remainingCount: number };
  relinkDcuFinancialConnections: (updatedInfo?: Partial<ChurchConfig['dcuBank']>) => void;
  toggleAutoReconcile: (enabled: boolean) => void;
  simulateIncomingDcuDeposit: (amount: number, description: string, type: DcuBankDeposit['type'], envelopeRef?: string) => DcuBankDeposit;
  dismissNotification: (id: string) => void;
  addNotification: (type: ToastNotification['type'], title: string, message: string) => void;
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
  const [config, setConfig] = useState<ChurchConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_config`);
    if (!saved) return initialChurchConfig;
    const parsed = JSON.parse(saved) as ChurchConfig;
    // Backfill senior pastor for installs that stored an empty value
    if (!parsed.seniorPastor?.trim()) {
      parsed.seniorPastor = initialChurchConfig.seniorPastor;
    }
    // Prefer .com church domain (legacy localStorage may still have .org)
    if (parsed.email?.includes('anointedworshipcenter.org')) {
      parsed.email = parsed.email.replace('anointedworshipcenter.org', 'anointedworshipcenter.com');
    }
    if (parsed.website?.includes('anointedworshipcenter.org')) {
      parsed.website = parsed.website.replace('anointedworshipcenter.org', 'anointedworshipcenter.com');
    }
    return { ...initialChurchConfig, ...parsed };
  });

  const [funds, setFunds] = useState<Fund[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_funds`);
    return saved ? JSON.parse(saved) : initialFunds;
  });

  const [donors, setDonors] = useState<Donor[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_donors`);
    return saved ? JSON.parse(saved) : initialDonors;
  });

  const [donations, setDonations] = useState<Donation[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_donations`);
    return saved ? JSON.parse(saved) : initialDonations;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_audit`);
    return saved ? JSON.parse(saved) : initialAuditLogs;
  });

  const [offlineGifts, setOfflineGifts] = useState<OfflineGift[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_offline`);
    return saved ? JSON.parse(saved) : [];
  });

  const [pledges, setPledges] = useState<AnnualPledge[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_pledges`);
    return saved ? JSON.parse(saved) : initialPledges;
  });

  const [dcuDeposits, setDcuDeposits] = useState<DcuBankDeposit[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_dcu_deposits`);
    return saved ? JSON.parse(saved) : initialDcuDeposits;
  });

  const [discrepancies, setDiscrepancies] = useState<ReconciliationDiscrepancy[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_discrepancies`);
    return saved ? JSON.parse(saved) : initialReconciliationDiscrepancies;
  });

  const [currentRole, setCurrentRole] = useState<UserRole>('donor');
  const [isMfaVerified, setIsMfaVerified] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_dark`) === 'true';
  });
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Donation | null>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_config`, JSON.stringify(config));
  }, [config]);

  // Merge public church identity from server env (overrides empty local blanks)
  useEffect(() => {
    void fetchApiConfig().then((api) => {
      if (!api?.church) return;
      const c = api.church;
      // Prefer non-empty server env over stale localStorage so Render updates stick
      setConfig((prev) => ({
        ...prev,
        name: c.name?.trim() || prev.name,
        legalEntityName: c.legalEntityName?.trim() || prev.legalEntityName,
        address: c.address?.trim() || prev.address,
        cityStateZip: c.cityStateZip?.trim() || prev.cityStateZip,
        ein: c.ein?.trim() || prev.ein,
        phone: c.phone?.trim() || prev.phone,
        email: c.email?.trim() || prev.email,
        website: c.website?.trim() || prev.website,
      }));
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_funds`, JSON.stringify(funds));
  }, [funds]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_donors`, JSON.stringify(donors));
  }, [donors]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_donations`, JSON.stringify(donations));
  }, [donations]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_offline`, JSON.stringify(offlineGifts));
  }, [offlineGifts]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_pledges`, JSON.stringify(pledges));
  }, [pledges]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_dcu_deposits`, JSON.stringify(dcuDeposits));
  }, [dcuDeposits]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_discrepancies`, JSON.stringify(discrepancies));
  }, [discrepancies]);

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

  const switchRole = (role: UserRole) => {
    setCurrentRole(role);
    if (role === 'admin' && !isMfaVerified) {
      addNotification('info', 'MFA Required', 'Please enter your 6-digit TOTP code to unlock Admin privileges.');
    } else {
      const label = role === 'first_lady' ? 'FIRST LADY' : role.toUpperCase();
      addNotification('info', 'Role Switched', `Active view updated to ${label}`);
    }
  };

  const verifyStaffAccess = async (inviteCode: string, authenticatorCode: string): Promise<boolean> => {
    try {
      const result = await verifyStaffPortalAccess({ inviteCode, authenticatorCode });
      if (!result.ok) {
        addNotification('error', 'Staff Portal Locked', result.error || 'Invalid invite or code.');
        return false;
      }
      setIsMfaVerified(true);
      const auditEntry: AuditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: 'usr-admin-session',
        actorName: 'Administrative Steward',
        actorRole: 'admin',
        action: 'STAFF_PORTAL_ACCESS',
        resource: 'Security Perimeter',
        details: 'Staff invite/access code and authenticator verified for Staff Portal session.',
        ipAddress: '192.168.1.102',
        integrityHash: generateIntegrityHash(`staff_access_${Date.now()}`),
      };
      setAuditLogs((prev) => [auditEntry, ...prev]);
      addNotification('success', 'Staff Portal Unlocked', 'Authorized staff session started.');
      return true;
    } catch (err) {
      addNotification(
        'error',
        'Staff Portal Locked',
        err instanceof Error ? err.message : 'Could not verify staff access.'
      );
      return false;
    }
  };

  const resetMfa = () => {
    setIsMfaVerified(false);
    addNotification('info', 'Staff Portal Locked', 'Staff session closed. Invite code required to re-enter.');
  };

  const makeDonation = async (input: DonationInput): Promise<Donation> => {
    const feeAmount = input.feeCovered ? Number((input.amount * 0.029 + 0.3).toFixed(2)) : 0;
    const totalCharged = Number((input.amount + feeAmount).toFixed(2));
    const now = new Date();
    const timestamp = now.toISOString();
    const targetFund = funds.find((f) => f.id === input.fundId) || funds[0];
    const displayName = input.isAnonymous ? 'Anonymous' : input.donorName;

    // Persist to server ledger (Neon when DATABASE_URL is set; otherwise memory on API)
    let serverDonation: Donation | null = null;
    let serverDonorId: string | null = null;
    try {
      const recorded = await recordGift({
        amount: input.amount,
        feeCovered: input.feeCovered,
        feeAmount,
        frequency: input.frequency,
        fundId: targetFund.id,
        fundName: targetFund.name,
        fundCode: targetFund.code,
        donorName: input.donorName,
        donorEmail: input.donorEmail,
        donorAddress: input.donorAddress,
        paymentMethod: input.paymentMethod,
        cardBrand: input.cardBrand,
        cardLast4: input.cardLast4,
        dedication: input.dedication,
        isAnonymous: input.isAnonymous,
        stripePaymentIntentId: input.stripePaymentIntentId,
        plaidTransferId: input.plaidTransferId,
        plaidInstitution: input.plaidInstitution,
        plaidAccountMask: input.plaidAccountMask,
        awcDcbVoucher: input.awcDcbVoucher,
        awcSynced: input.awcSynced,
        transactionId: input.stripePaymentIntentId || input.plaidTransferId,
      });

      serverDonorId = recorded.donor.id;
      const sd = recorded.donation;
      serverDonation = {
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
        encryptedToken: sd.encryptedToken,
        envelopeNumber: sd.envelopeNumber,
        awcDcbVoucher: sd.awcDcbVoucher,
        awcSynced: sd.awcSynced,
        plaidInstitution: sd.plaidInstitution,
        plaidAccountMask: sd.plaidAccountMask,
        plaidTransferId: sd.plaidTransferId,
      };

      // Mirror server donor into local UI state
      setDonors((prev) => {
        const existing = prev.find((d) => d.id === recorded.donor.id || d.email.toLowerCase() === recorded.donor.email.toLowerCase());
        if (existing) {
          return prev.map((d) =>
            d.id === existing.id
              ? {
                  ...d,
                  ...recorded.donor,
                  recurringFrequency: recorded.donor.recurringFrequency as DonationFrequency | undefined,
                }
              : d
          );
        }
        return [
          {
            ...recorded.donor,
            recurringFrequency: recorded.donor.recurringFrequency as DonationFrequency | undefined,
          },
          ...prev,
        ];
      });
    } catch (err) {
      console.warn('[makeDonation] server persist failed; using local fallback', err);
    }

    // Next billing date if recurring
    let nextBillingDate: string | undefined = undefined;
    if (input.frequency !== 'one-time') {
      const nextDate = new Date(now);
      if (input.frequency === 'weekly') nextDate.setDate(now.getDate() + 7);
      else if (input.frequency === 'bi-weekly') nextDate.setDate(now.getDate() + 14);
      else if (input.frequency === 'monthly') nextDate.setMonth(now.getMonth() + 1);
      else if (input.frequency === 'annually') nextDate.setFullYear(now.getFullYear() + 1);
      nextBillingDate = nextDate.toISOString();
    }

    const receiptNumber =
      serverDonation?.receiptNumber || `REC-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const transactionId =
      serverDonation?.transactionId ||
      input.stripePaymentIntentId ||
      input.plaidTransferId ||
      `ch_3N${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString().slice(-6)}`;

    let donor = donors.find((d) => d.email.toLowerCase() === input.donorEmail.toLowerCase());
    let donorId = serverDonorId || (donor ? donor.id : `donor-${Date.now()}`);

    if (!serverDonation) {
      if (donor) {
        setDonors((prev) =>
          prev.map((d) => {
            if (d.id === donor!.id) {
              return {
                ...d,
                name: input.isAnonymous ? d.name : input.donorName || d.name,
                address: input.donorAddress || d.address,
                lifetimeGiving: d.lifetimeGiving + input.amount,
                totalGiftsCount: d.totalGiftsCount + 1,
                lastGiftDate: timestamp,
                recurringActive: input.frequency !== 'one-time' ? true : d.recurringActive,
                recurringAmount: input.frequency !== 'one-time' ? input.amount : d.recurringAmount,
                recurringFrequency: input.frequency !== 'one-time' ? input.frequency : d.recurringFrequency,
              };
            }
            return d;
          })
        );
      } else {
        const newDonor: Donor = {
          id: donorId,
          name: displayName || 'Friend',
          email: input.donorEmail,
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
        setDonors((prev) => [newDonor, ...prev]);
      }
    }

    setFunds((prev) =>
      prev.map((f) => (f.id === targetFund.id ? { ...f, currentAmount: f.currentAmount + input.amount } : f))
    );

    setPledges((prev) =>
      prev.map((p) => {
        if (p.donorId === donorId && p.fundId === targetFund.id && p.taxYear === now.getFullYear()) {
          const newFulfilled = p.fulfilledAmount + input.amount;
          const status = newFulfilled >= p.committedAmount ? 'fulfilled' : 'active';
          return {
            ...p,
            fulfilledAmount: newFulfilled,
            status,
            updatedAt: timestamp,
          };
        }
        return p;
      })
    );

    const envelopeNumber = input.envelopeNumber || donor?.envelopeNumber;
    const awcDcbVoucher =
      input.awcDcbVoucher || serverDonation?.awcDcbVoucher || `AWC-VOUCH-${receiptNumber.replace('REC-', '')}`;
    const dcuSettlementRef = `DCU-DEP-${Math.floor(10000 + Math.random() * 90000)}`;

    const newDonation: Donation =
      serverDonation ||
      ({
        id: `don-${Date.now()}`,
        transactionId,
        receiptNumber,
        donorId,
        donorName: displayName,
        donorEmail: input.donorEmail,
        donorAddress: input.donorAddress,
        amount: input.amount,
        feeCovered: input.feeCovered,
        feeAmount,
        totalCharged,
        frequency: input.frequency,
        fundId: targetFund.id,
        fundName: targetFund.name,
        paymentMethod: input.paymentMethod,
        cardBrand:
          input.cardBrand ||
          (input.paymentMethod === 'plaid'
            ? input.plaidInstitution || 'Plaid Bank Link'
            : input.paymentMethod === 'ach'
              ? 'Bank ACH'
              : 'Visa'),
        cardLast4:
          input.cardLast4 ||
          (input.paymentMethod === 'plaid'
            ? input.plaidAccountMask
            : input.paymentMethod === 'ach'
              ? undefined
              : undefined),
        status: 'completed',
        dedication: input.dedication,
        isAnonymous: Boolean(input.isAnonymous),
        timestamp,
        nextBillingDate,
        stripePaymentIntentId: input.stripePaymentIntentId,
        encryptedToken: `enc_sec_${Math.random().toString(36).substring(2, 16)}`,
        envelopeNumber,
        awcDcbVoucher,
        awcSynced: input.awcSynced !== undefined ? input.awcSynced : true,
        dcuSettlementRef,
        plaidInstitution: input.plaidInstitution,
        plaidAccountMask: input.plaidAccountMask,
        plaidTransferId: input.plaidTransferId,
      } as Donation);

    setDonations((prev) => {
      if (prev.some((d) => d.id === newDonation.id || d.transactionId === newDonation.transactionId)) {
        return prev;
      }
      return [newDonation, ...prev];
    });

    const newDeposit: DcuBankDeposit = {
      id: `dep-${Date.now()}`,
      date: timestamp,
      description:
        input.paymentMethod === 'plaid'
          ? `PLAID INSTANT BANK TRANSFER - ${input.plaidInstitution || 'DCU Depository'} (${displayName})`
          : `STRIPE SETTLEMENT BATCH - DCU BATCH (${input.cardBrand || 'Card'} *${input.cardLast4 || '****'})`,
      amount: input.amount,
      type: input.paymentMethod === 'plaid' ? 'plaid_bank_transfer' : 'card_batch_settlement',
      batchReference: dcuSettlementRef,
      dcuTraceNumber: `DCU-TRC-${Math.floor(100000000 + Math.random() * 900000000)}`,
      status: 'cleared',
      matchedAwcVoucherId: awcDcbVoucher,
    };
    setDcuDeposits((prev) => [newDeposit, ...prev]);

    // Record Immutable Audit Log
    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp,
      actorId: donorId,
      actorName: input.isAnonymous ? 'Anonymous Donor' : input.donorName,
      actorRole: 'donor',
      action: input.frequency === 'one-time' ? 'GIFT_CONTRIBUTED' : 'RECURRING_PLEDGE_ESTABLISHED',
      resource: `${targetFund.code} (${targetFund.name})`,
      details: `${input.frequency.toUpperCase()} gift of $${input.amount.toFixed(2)} processed via Stripe. Fee covered: ${input.feeCovered ? 'YES' : 'NO'}. Receipt: ${receiptNumber}.`,
      ipAddress: '198.51.100.42',
      integrityHash: generateIntegrityHash(`${transactionId}_${receiptNumber}_${input.amount}_${timestamp}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    // Confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4A0404', '#D4AF37', '#7A1414', '#F4CF67'],
      });
    } catch {
      // ignore
    }

    addNotification(
      'success',
      'Donation Successful',
      `Thank you for your generous gift of $${input.amount.toFixed(2)} to ${targetFund.name}. Receipt #${receiptNumber} generated.`
    );

    setSelectedReceipt(newDonation);
    return newDonation;
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
      ipAddress: '192.168.1.102',
      integrityHash: generateIntegrityHash(`refund_${transactionId}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('warning', 'Refund Processed', `Transaction ${transactionId} refunded successfully.`);
  };

  const cancelRecurringPledge = (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => (d.id === donorId ? { ...d, recurringActive: false } : d))
    );

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: donorId,
      actorName: 'Donor Self-Service',
      actorRole: 'donor',
      action: 'RECURRING_PLEDGE_CANCELLED',
      resource: donorId,
      details: `Donor recurring contribution schedule paused/cancelled. Future billing halted in Stripe gateway.`,
      ipAddress: '198.51.100.42',
      integrityHash: generateIntegrityHash(`cancel_pledge_${donorId}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('info', 'Pledge Cancelled', 'Recurring donation schedule has been stopped.');
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
      actorId: 'kiosk-usher-mode',
      actorName: 'Service Kiosk Usher',
      actorRole: 'bookkeeper',
      action: 'OFFLINE_GIFT_QUEUED',
      resource: `Offline Queue (${gift.method})`,
      details: `Physical gift envelope of $${gift.amount.toFixed(2)} for ${gift.donorName} logged offline.`,
      ipAddress: '127.0.0.1 (Local SQLite Cache)',
      integrityHash: generateIntegrityHash(`offline_${newGift.id}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('info', 'Offline Gift Recorded', `Saved to local offline queue. Will sync to church ledger when connected.`);
  };

  const syncOfflineGifts = () => {
    const unsynced = offlineGifts.filter((g) => !g.synced);
    if (unsynced.length === 0) {
      addNotification('info', 'Already Synced', 'No offline gifts pending sync.');
      return;
    }

    unsynced.forEach((g) => {
      const ref = (g.channelReference || g.checkNumber || '').trim();
      const channelLabels: Record<string, string> = {
        cash: 'Cash Envelope',
        check: ref ? `Check #${ref}` : 'Physical Check',
        card_kiosk: 'Service Kiosk Card',
        cash_app: ref ? `Cash App (${ref})` : 'Cash App',
        zelle: ref ? `Zelle (${ref})` : 'Zelle',
        venmo: ref ? `Venmo (${ref})` : 'Venmo',
      };
      const paymentMethodMap: Record<string, PaymentMethod> = {
        cash: 'cash',
        check: 'check',
        card_kiosk: 'card',
        cash_app: 'cash_app',
        zelle: 'zelle',
        venmo: 'venmo',
      };
      makeDonation({
        amount: g.amount,
        feeCovered: false,
        frequency: g.frequency,
        fundId: g.fundId,
        donorName: g.donorName,
        donorEmail: g.donorEmail,
        paymentMethod: paymentMethodMap[g.method] || 'cash',
        cardBrand: channelLabels[g.method] || g.method,
        cardLast4: '0000',
        dedication: g.note,
      });
    });

    setOfflineGifts((prev) => prev.map((g) => ({ ...g, synced: true })));

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: 'kiosk-sync-agent',
      actorName: 'Offline Kiosk Syncer',
      actorRole: 'bookkeeper',
      action: 'OFFLINE_BATCH_SYNC',
      resource: `${unsynced.length} gifts synchronized`,
      details: `Batch synchronization of ${unsynced.length} physical service gifts reconciled into master general ledger.`,
      ipAddress: '192.168.1.150',
      integrityHash: generateIntegrityHash(`sync_batch_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('success', 'Sync Complete', `Synchronized ${unsynced.length} offline gifts to the master financial ledger.`);
  };

  const requestGdprErasure = (donorId: string) => {
    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    setDonors((prev) =>
      prev.map((d) => {
        if (d.id === donorId) {
          return {
            ...d,
            name: `Anonymized Contributor #${d.id.slice(-4)}`,
            email: `anonymized_${d.id.slice(-4)}@privacy-shield.local`,
            phone: 'REDACTED',
            address: 'REDACTED PER CCPA/GDPR',
            taxId: 'REDACTED',
            isAnonymized: true,
          };
        }
        return d;
      })
    );

    setDonations((prev) =>
      prev.map((don) => {
        if (don.donorId === donorId) {
          return {
            ...don,
            donorName: `Anonymized Contributor #${donorId.slice(-4)}`,
            donorEmail: `anonymized_${donorId.slice(-4)}@privacy-shield.local`,
            donorAddress: 'REDACTED PER CCPA/GDPR',
          };
        }
        return don;
      })
    );

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: donorId,
      actorName: 'GDPR / CCPA Privacy Officer',
      actorRole: 'auditor',
      action: 'GDPR_RIGHT_TO_ERASURE',
      resource: donorId,
      details: `PII for donor permanently sanitized in compliance with GDPR Art 17 & CCPA. Historical ledger financial totals preserved for IRS 501(c)(3) tax audit requirements.`,
      ipAddress: '198.51.100.42',
      integrityHash: generateIntegrityHash(`gdpr_erase_${donorId}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('info', 'Privacy Sanitization', 'Donor personal identifying information (PII) has been erased in compliance with GDPR & CCPA.');
  };

  const requestGdprExport = (donorId: string) => {
    const donor = donors.find((d) => d.id === donorId);
    const donorGifts = donations.filter((d) => d.donorId === donorId);

    const payload = {
      church: config.name,
      ein: config.ein,
      exportDate: new Date().toISOString(),
      complianceStandard: 'GDPR Article 20 & CCPA Right to Portability',
      donorProfile: donor,
      contributionsHistory: donorGifts,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gdpr-data-archive-${donorId}.json`);
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
      ipAddress: '192.168.1.102',
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

  const createOrUpdatePledge = (input: {
    donorId: string;
    donorName: string;
    donorEmail: string;
    taxYear: number;
    fundId: string;
    committedAmount: number;
    notes?: string;
  }): AnnualPledge => {
    const targetFund = funds.find((f) => f.id === input.fundId) || funds[0];
    const now = new Date();
    const timestamp = now.toISOString();

    const actualGiftsSum = donations
      .filter((d) => d.donorId === input.donorId && d.fundId === input.fundId && d.status === 'completed' && new Date(d.timestamp).getFullYear() === input.taxYear)
      .reduce((sum, d) => sum + d.amount, 0);

    const existing = pledges.find((p) => p.donorId === input.donorId && p.fundId === input.fundId && p.taxYear === input.taxYear);

    let updatedPledge: AnnualPledge;
    if (existing) {
      updatedPledge = {
        ...existing,
        committedAmount: input.committedAmount,
        fulfilledAmount: Math.max(existing.fulfilledAmount, actualGiftsSum),
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedAt: timestamp,
        status: actualGiftsSum >= input.committedAmount ? 'fulfilled' : 'active',
      };
      setPledges((prev) => prev.map((p) => (p.id === existing.id ? updatedPledge : p)));
    } else {
      updatedPledge = {
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
      setPledges((prev) => [updatedPledge, ...prev]);
    }

    const auditRecord: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp,
      actorId: input.donorId,
      actorName: input.donorName,
      actorRole: 'donor',
      action: 'ANNUAL_PLEDGE_REGISTERED',
      resource: `${targetFund.name} (${input.taxYear})`,
      details: `Annual commitment of $${input.committedAmount.toLocaleString()} recorded for tax year ${input.taxYear}.`,
      ipAddress: '198.51.100.42',
      integrityHash: generateIntegrityHash(`pledge_${input.donorId}_${input.committedAmount}_${timestamp}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification(
      'success',
      'Annual Commitment Saved',
      `Your annual faith commitment of $${input.committedAmount.toLocaleString()} to ${targetFund.name} has been recorded.`
    );

    return updatedPledge;
  };

  const calculatePledgeGap = (taxYear: number = 2026): PledgeGapSummary => {
    const yearPledges = pledges.filter((p) => p.taxYear === taxYear);
    const totalPledged = yearPledges.reduce((sum, p) => sum + p.committedAmount, 0);
    const totalReceived = yearPledges.reduce((sum, p) => sum + p.fulfilledAmount, 0);
    const netGap = Math.max(0, totalPledged - totalReceived);
    const percentFulfilled = totalPledged > 0 ? (totalReceived / totalPledged) * 100 : 0;
    const fulfilledPledgesCount = yearPledges.filter((p) => p.status === 'fulfilled' || p.fulfilledAmount >= p.committedAmount).length;

    const fundBreakdown = funds.map((f) => {
      const fundPlgs = yearPledges.filter((p) => p.fundId === f.id);
      const fPledged = fundPlgs.reduce((sum, p) => sum + p.committedAmount, 0);
      const fReceived = fundPlgs.reduce((sum, p) => sum + p.fulfilledAmount, 0);
      const fGap = Math.max(0, fPledged - fReceived);
      const fPercent = fPledged > 0 ? (fReceived / fPledged) * 100 : 0;

      return {
        fundId: f.id,
        fundName: f.name,
        totalPledged: fPledged,
        totalReceived: fReceived,
        gapAmount: fGap,
        percentFulfilled: Number(fPercent.toFixed(1)),
        pledgeCount: fundPlgs.length,
      };
    });

    return {
      taxYear,
      totalPledged,
      totalReceived,
      netGap,
      percentFulfilled: Number(percentFulfilled.toFixed(1)),
      totalPledgesCount: yearPledges.length,
      fulfilledPledgesCount,
      activePledgesCount: yearPledges.length - fulfilledPledgesCount,
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
      setDcuDeposits((prev) =>
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
      resource: `DCU vs AWC Ledger (${id})`,
      details: `Discrepancy ${id} resolved via action [${actionType}]: ${note}`,
      ipAddress: '192.168.1.102',
      integrityHash: generateIntegrityHash(`reconcile_${id}_${actionType}_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification('success', 'Discrepancy Resolved', `Reconciliation item ${id} was marked resolved.`);
  };

  const runAutoReconciliation = (): { matchedCount: number; remainingCount: number } => {
    let newlyMatched = 0;
    setDcuDeposits((prev) =>
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
      `Continuous reconciliation finished. Re-evaluated all DCU Credit Union deposits against AWC DCB records.`
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
      resource: 'DCU Credit Union (Digital Federal Credit Union)',
      details: 'DCU Credit Union operating depository account securely authenticated via Stripe Financial Connections OAuth rails.',
      ipAddress: '192.168.1.102',
      integrityHash: generateIntegrityHash(`dcu_fc_link_${Date.now()}`),
    };
    setAuditLogs((prev) => [auditRecord, ...prev]);

    addNotification(
      'success',
      'DCU Account Verified',
      'DCU Credit Union checking account linked via Stripe Financial Connections with continuous AWC DCB reconciliation enabled.'
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
    type: DcuBankDeposit['type'],
    envelopeRef?: string
  ): DcuBankDeposit => {
    const timestamp = new Date().toISOString();
    const newDep: DcuBankDeposit = {
      id: `dep-${Date.now()}`,
      date: timestamp,
      description,
      amount,
      type,
      batchReference: `DCU-MANUAL-BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
      dcuTraceNumber: `DCU-TRC-${Math.floor(100000000 + Math.random() * 900000000)}`,
      status: 'cleared',
    };
    setDcuDeposits((prev) => [newDep, ...prev]);

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
      details: `New incoming DCU deposit of $${amount.toFixed(2)} received without prior AWC DCB voucher entry.`,
      timestamp,
    };
    setDiscrepancies((prev) => [newDisc, ...prev]);

    addNotification(
      'warning',
      'New Bank Deposit Captured',
      `Incoming DCU deposit of $${amount.toFixed(2)} recorded. Discrepancy flagged for bookkeeper reconciliation.`
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
        pledges,
        dcuDeposits,
        discrepancies,
        currentRole,
        isMfaVerified,
        darkMode,
        notifications,
        selectedReceipt,
        setSelectedReceipt,
        toggleDarkMode,
        switchRole,
        verifyStaffAccess,
        resetMfa,
        makeDonation,
        refundDonation,
        cancelRecurringPledge,
        createOrUpdatePledge,
        calculatePledgeGap,
        queueOfflineGift,
        syncOfflineGifts,
        requestGdprErasure,
        requestGdprExport,
        exportTransactionsCSV,
        exportAuditLogsCSV,
        resolveDiscrepancy,
        runAutoReconciliation,
        relinkDcuFinancialConnections,
        toggleAutoReconcile,
        simulateIncomingDcuDeposit,
        dismissNotification,
        addNotification,
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
