import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { Donation, Donor } from '../types';
import {
  Download,
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';

interface AnnualGivingSummaryCardProps {
  donor: Donor;
  /** Prefer API-loaded gifts so year-end totals match My Giving ledger. */
  gifts?: Donation[];
  onOpenStatementModal: (year: number) => void;
}

export const AnnualGivingSummaryCard: React.FC<AnnualGivingSummaryCardProps> = ({
  donor,
  gifts,
  onOpenStatementModal,
}) => {
  const { donations, config, addNotification } = useChurch();
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  const sourceGifts = gifts ?? donations;
  const donorDonations = sourceGifts.filter(
    (d) =>
      (d.donorId === donor.id || d.donorEmail?.toLowerCase() === donor.email.toLowerCase()) &&
      d.status === 'completed'
  );
  const yearGifts = donorDonations.filter((d) => {
    const giftYear = new Date(d.timestamp).getFullYear();
    return giftYear === selectedYear;
  });

  const totalDeductible = yearGifts.reduce((sum, d) => sum + d.amount, 0);

  const fundAllocations: { [fundName: string]: number } = {};
  yearGifts.forEach((g) => {
    fundAllocations[g.fundName] = (fundAllocations[g.fundName] || 0) + g.amount;
  });

  const handleExportTaxCsv = () => {
    if (yearGifts.length === 0) {
      addNotification('info', 'No Tax Records', `No contributions on record for tax year ${selectedYear}.`);
      return;
    }

    const headers = [
      'Tax Year',
      'Receipt Number',
      'Transaction Date',
      'Fund Designation',
      'Payment Method',
      'Gift Amount (USD)',
      'Tax Deductible',
      'Legal Entity',
      'EIN',
    ];

    const rows = yearGifts.map((g) => [
      selectedYear,
      `"${g.receiptNumber}"`,
      `"${new Date(g.timestamp).toLocaleDateString()}"`,
      `"${g.fundName}"`,
      `"${g.paymentMethod.toUpperCase()}"`,
      g.amount.toFixed(2),
      'YES (100% Deductible)',
      `"${config.legalEntityName || config.name}"`,
      `"${config.ein?.trim() || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${donor.name.replace(/\s+/g, '_')}_Tax_Giving_Report_${selectedYear}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('success', 'Tax CSV Exported', `Generated CPA-ready contribution records for ${selectedYear}.`);
  };

  const handleDownloadPdf = () => {
    onOpenStatementModal(selectedYear);
  };

  return (
    <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 sm:p-7 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-church-burgundy via-church-gold-dark to-church-gold" />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between pb-5 border-b border-[#E8E2D9] dark:border-slate-800 gap-4">
        <div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tax Documentation
          </span>
          <h3 className="font-serif-display text-xl font-semibold text-slate-900 dark:text-white mt-1">
            Annual Giving Summary
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Official annual contribution statement for your records and CPA.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Tax Year</span>
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-[#E8E2D9] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-church-gold/40"
          >
            <option value={2026}>2026 (YTD)</option>
            <option value={2025}>2025 Calendar Year</option>
            <option value={2024}>2024 Calendar Year</option>
          </select>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="h-full flex flex-col">
          <span className="text-[11px] uppercase font-medium text-slate-500 tracking-wider">
            Total {selectedYear} Giving
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-semibold text-church-burgundy dark:text-church-gold-light mt-2 block tabular-nums tracking-tight">
            ${totalDeductible.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400 mt-auto pt-2">
            Across {yearGifts.length} gift{yearGifts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="h-full flex flex-col">
          <span className="text-[11px] uppercase font-medium text-slate-500 tracking-wider">
            Tax Deductible Portion
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mt-2 block tabular-nums tracking-tight">
            ${totalDeductible.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400 mt-auto pt-2">100% deductible</span>
        </div>

        <div className="h-full flex flex-col">
          <span className="text-[11px] uppercase font-medium text-slate-500 tracking-wider">
            Non-Deductible Benefits
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white mt-2 block tabular-nums tracking-tight">
            $0.00
          </span>
          <span className="text-[11px] text-slate-400 mt-auto pt-2">IRC § 170(f)(8)</span>
        </div>

        <div className="h-full flex flex-col">
          <span className="text-[11px] uppercase font-medium text-slate-500 tracking-wider">
            Church EIN
          </span>
          <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white mt-2 block">
            {config.ein?.trim() || 'On file with church'}
          </span>
          <span className="text-[11px] text-slate-400 mt-auto pt-2">501(c)(3) Public Charity</span>
        </div>
      </div>

      {yearGifts.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[#E8E2D9] dark:border-slate-800">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-3">
            Ministry Fund Allocation ({selectedYear})
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(fundAllocations).map(([fundName, amount]) => {
              const share = totalDeductible > 0 ? (amount / totalDeductible) * 100 : 0;
              return (
                <div key={fundName} className="py-2">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {fundName}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-[#E8E2D9]/80 dark:bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-church-burgundy dark:bg-church-gold h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">{share.toFixed(0)}% of annual giving</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-[#E8E2D9] dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>Verified church acknowledgment for your tax file</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportTaxCsv}
            disabled={yearGifts.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 rounded-xl border border-[#E8E2D9] dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            <span>Export CSV (CPA)</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={yearGifts.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Download PDF Annual Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
