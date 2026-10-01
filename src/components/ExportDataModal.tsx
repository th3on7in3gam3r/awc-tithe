import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { Donation } from '../types';
import {
  Download,
  X,
  FileSpreadsheet,
  Filter,
  Calendar,
  Layers,
  CreditCard,
  CheckCircle2,
  Building2,
  Table,
} from 'lucide-react';

interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type AccountingPreset = 'awc_dcb' | 'quickbooks' | 'shelby' | 'generic';

export const ExportDataModal: React.FC<ExportDataModalProps> = ({ isOpen, onClose }) => {
  const { donations, funds, config, currentRole, addNotification } = useChurch();

  const [preset, setPreset] = useState<AccountingPreset>('awc_dcb');
  const [dateRange, setDateRange] = useState<string>('2026_ytd');
  const [fundFilter, setFundFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('completed');

  if (!isOpen) return null;

  // Filter donations according to user selection
  const filteredDonations = donations.filter((d) => {
    // Status filter
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;

    // Fund filter
    if (fundFilter !== 'all' && d.fundId !== fundFilter) return false;

    // Payment method filter
    if (methodFilter !== 'all') {
      if (methodFilter === 'card' && d.paymentMethod !== 'card') return false;
      if (methodFilter === 'ach' && d.paymentMethod !== 'ach') return false;
      if (methodFilter === 'apple_pay' && d.paymentMethod !== 'apple_pay') return false;
    }

    // Date range filter
    const giftDate = new Date(d.timestamp);
    const now = new Date();
    if (dateRange === '30_days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (giftDate < thirtyDaysAgo) return false;
    } else if (dateRange === '90_days') {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      if (giftDate < ninetyDaysAgo) return false;
    } else if (dateRange === '2026_ytd') {
      if (giftDate.getFullYear() !== 2026) return false;
    } else if (dateRange === '2025') {
      if (giftDate.getFullYear() !== 2025) return false;
    }

    return true;
  });

  const totalFilteredAmount = filteredDonations.reduce((sum, d) => sum + d.amount, 0);
  const totalFilteredFees = filteredDonations.reduce((sum, d) => sum + d.feeAmount, 0);
  const netDepositAmount = totalFilteredAmount; // When fees covered or settled directly to DCU

  const handleDownloadCsv = () => {
    if (filteredDonations.length === 0) {
      addNotification('warning', 'No Records', 'No transaction logs match the selected filter criteria.');
      return;
    }

    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filenameSuffix = preset;

    if (preset === 'awc_dcb') {
      // AWC Digital Contribution Book (AWC DCB) Format
      headers = [
        'AWC Voucher Number',
        'Member Envelope #',
        'Transaction Date',
        'Donor Full Name',
        'Donor Email Address',
        'Fund Code',
        'Fund Designation',
        'Gross Contribution (USD)',
        'Stripe Fee Covered',
        'Processing Fee (USD)',
        'Net Deposit to DCU Credit Union (USD)',
        'DCU Batch Reference',
        'Payment Instrument',
        'Church Tax EIN',
        'Status',
      ];

      rows = filteredDonations.map((d) => [
        `"${d.awcDcbVoucher || `AWC-VOUCH-${d.receiptNumber.replace('REC-', '')}`}"`,
        `"${d.envelopeNumber || 'ENV-1004'}"`,
        `"${new Date(d.timestamp).toISOString().slice(0, 10)}"`,
        `"${d.donorName.replace(/"/g, '""')}"`,
        `"${d.donorEmail}"`,
        `"${d.fundId === 'fund-tithes' ? '1001-OPS' : d.fundId === 'fund-building' ? '2001-CAP' : '3001-MIS'}"`,
        `"${d.fundName.replace(/"/g, '""')}"`,
        d.amount.toFixed(2),
        d.feeCovered ? 'YES' : 'NO',
        d.feeAmount.toFixed(2),
        d.amount.toFixed(2),
        `"${d.dcuSettlementRef || 'DCU-DEP-BATCH-8492'}"`,
        `"${d.paymentMethod.toUpperCase()} (${d.cardBrand || 'Card'} ****${d.cardLast4 || '4242'})"`,
        `"${config.ein}"`,
        `"${d.status.toUpperCase()}"`,
      ]);
    } else if (preset === 'quickbooks') {
      // Intuit QuickBooks General Ledger Format
      headers = ['Type', 'Date', 'Num', 'Name', 'Memo', 'Account', 'Clr', 'Split', 'Amount'];
      rows = filteredDonations.map((d) => [
        'Deposit',
        `"${new Date(d.timestamp).toLocaleDateString('en-US')}"`,
        `"${d.receiptNumber}"`,
        `"${d.donorName.replace(/"/g, '""')}"`,
        `"${d.fundName} - ${d.dedication || 'Contribution'}"`,
        `"DCU Credit Union Checking (...8492)"`,
        'C',
        `"4010 - ${d.fundName}"`,
        d.amount.toFixed(2),
      ]);
    } else if (preset === 'shelby') {
      // Shelby Systems / ACS Church Tech Format
      headers = ['Donor ID', 'Envelope #', 'Date', 'Fund Name', 'SubFund', 'Pledge Flag', 'Amount', 'DCU Deposit Batch'];
      rows = filteredDonations.map((d) => [
        d.donorId,
        `"${d.envelopeNumber || 'ENV-1004'}"`,
        `"${new Date(d.timestamp).toISOString().slice(0, 10)}"`,
        `"${d.fundName.replace(/"/g, '""')}"`,
        'General',
        d.frequency !== 'one-time' ? 'Y' : 'N',
        d.amount.toFixed(2),
        `"DCU-DEP-${new Date(d.timestamp).toISOString().slice(0, 10)}"`,
      ]);
    } else {
      // Universal Standard CPA Ledger
      headers = [
        'Transaction ID',
        'Receipt Number',
        'Timestamp',
        'Donor Name',
        'Donor Email',
        'Donor Address',
        'Fund Name',
        'Gross Amount',
        'Fee Covered',
        'Fee Amount',
        'Total Charged',
        'Frequency',
        'Payment Method',
        'Card Brand',
        'Card Last 4',
        'DCU Deposit Ref',
        'AWC Voucher',
        'Status',
      ];
      rows = filteredDonations.map((d) => [
        d.transactionId,
        d.receiptNumber,
        d.timestamp,
        `"${d.donorName.replace(/"/g, '""')}"`,
        d.donorEmail,
        `"${(d.donorAddress || '').replace(/"/g, '""')}"`,
        `"${d.fundName.replace(/"/g, '""')}"`,
        d.amount.toFixed(2),
        d.feeCovered ? 'YES' : 'NO',
        d.feeAmount.toFixed(2),
        d.totalCharged.toFixed(2),
        d.frequency,
        d.paymentMethod,
        d.cardBrand || '',
        d.cardLast4 || '',
        `"${d.dcuSettlementRef || 'DCU-DEP-8492'}"`,
        `"${d.awcDcbVoucher || 'AWC-DCB-VOUCH'}"`,
        d.status,
      ]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `grace-church-export-${filenameSuffix}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification(
      'success',
      'Export Complete',
      `Downloaded ${filteredDonations.length} transaction records formatted for ${preset.toUpperCase()}.`
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto no-print">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 my-8 space-y-6">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-church-burgundy dark:text-church-gold uppercase tracking-wider">
                External Accounting Integration
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                DCU &amp; AWC DCB Ready
              </span>
            </div>
            <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Export Filtered Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Filter donor gift records and export as CSV formatted for church general ledger software.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 1. Accounting Software Format Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-church-gold-dark dark:text-church-gold" />
            <span>Select External Accounting Software Format:</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => setPreset('awc_dcb')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'awc_dcb'
                  ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold ring-2 ring-church-gold/20'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                AWC DCB
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Digital Contribution Book &amp; DCU Bank
              </span>
            </button>

            <button
              onClick={() => setPreset('quickbooks')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'quickbooks'
                  ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold ring-2 ring-church-gold/20'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                QuickBooks
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Intuit IIF / GL Deposits
              </span>
            </button>

            <button
              onClick={() => setPreset('shelby')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'shelby'
                  ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold ring-2 ring-church-gold/20'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                Shelby / ACS
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Church Management (ChMS)
              </span>
            </button>

            <button
              onClick={() => setPreset('generic')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'generic'
                  ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold ring-2 ring-church-gold/20'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                Standard CPA
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Universal Excel CSV
              </span>
            </button>
          </div>
        </div>

        {/* 2. Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Date Range */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Date Range:</span>
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="2026_ytd">2026 Year-to-Date (Current)</option>
              <option value="30_days">Trailing 30 Days</option>
              <option value="90_days">Trailing 90 Days</option>
              <option value="2025">Tax Year 2025 (Full Year)</option>
              <option value="all">All-Time Historical Ledger</option>
            </select>
          </div>

          {/* Ministry Fund Filter */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span>Ministry Fund Designation:</span>
            </label>
            <select
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">All Ministry Funds Combined</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
              <span>Payment Instrument:</span>
            </label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">All Methods (Credit, Debit &amp; ACH)</option>
              <option value="card">Credit &amp; Debit Cards Only</option>
              <option value="ach">Bank ACH Direct Debits</option>
              <option value="apple_pay">Apple Pay &amp; Digital Wallets</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Settlement Status:</span>
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="completed">Completed &amp; Settled Only</option>
              <option value="all">All (Including Refunds &amp; Pending)</option>
              <option value="refunded">Refunded Transactions Only</option>
            </select>
          </div>
        </div>

        {/* 3. Live Matching Records Summary Box */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block mb-2">
            Export Summary Preview
          </span>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-slate-500 block text-[10px]">Matched Records</span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {filteredDonations.length} contributions
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Gross Dollar Volume</span>
              <span className="font-mono text-base font-bold text-church-burgundy dark:text-church-gold-light">
                ${totalFilteredAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">DCU Credit Union Deposit</span>
              <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                ${netDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-400">
            Exported by role: <strong className="uppercase text-slate-700 dark:text-slate-300">{currentRole}</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={filteredDonations.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Download Filtered CSV</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
