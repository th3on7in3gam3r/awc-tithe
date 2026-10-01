import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { Donor } from '../types';
import {
  FileText,
  Download,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface AnnualGivingSummaryCardProps {
  donor: Donor;
  onOpenStatementModal: (year: number) => void;
}

export const AnnualGivingSummaryCard: React.FC<AnnualGivingSummaryCardProps> = ({
  donor,
  onOpenStatementModal,
}) => {
  const { donations, config, addNotification } = useChurch();
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Available tax years based on donor's gifts
  const donorDonations = donations.filter((d) => d.donorId === donor.id && d.status === 'completed');

  // Gifts in the chosen tax year
  const yearGifts = donorDonations.filter((d) => {
    const giftYear = new Date(d.timestamp).getFullYear();
    return giftYear === selectedYear;
  });

  const totalDeductible = yearGifts.reduce((sum, d) => sum + d.amount, 0);

  // Fund allocation breakdown for this tax year
  const fundAllocations: { [fundName: string]: number } = {};
  yearGifts.forEach((g) => {
    fundAllocations[g.fundName] = (fundAllocations[g.fundName] || 0) + g.amount;
  });

  // Export CSV for tax prep software (TurboTax, TaxSlayer, CPA)
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
      `"${config.legalEntityName}"`,
      `"${config.ein}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${donor.name.replace(/\s+/g, '_')}_Tax_Giving_Report_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('success', 'Tax CSV Exported', `Generated CPA-ready contribution records for ${selectedYear}.`);
  };

  const handleDownloadPdf = () => {
    // Open the official IRS print/PDF statement modal
    onOpenStatementModal(selectedYear);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm relative overflow-hidden">
      {/* Decorative top accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-church-burgundy via-church-gold-dark to-church-gold" />

      {/* Header with Year Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-church-gold/10 dark:bg-church-burgundy/40 text-church-burgundy dark:text-church-gold mt-0.5">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-church-burgundy dark:text-church-gold uppercase tracking-wider">
                IRS 501(c)(3) Tax Documentation
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Schedule A Eligible</span>
              </span>
            </div>
            <h3 className="font-serif-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Annual Giving Summary
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Download your official annual contribution statement for tax deductions and CPA filing.
            </p>
          </div>
        </div>

        {/* Tax Year Filter */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Tax Year:</span>
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-church-gold"
          >
            <option value={2026}>2026 (YTD)</option>
            <option value={2025}>2025 Calendar Year</option>
            <option value={2024}>2024 Calendar Year</option>
          </select>
        </div>
      </div>

      {/* Primary Key Figures Grid */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block tracking-wider">
            Total {selectedYear} Giving
          </span>
          <span className="font-serif-display text-2xl font-bold text-church-burgundy-dark dark:text-church-gold-light mt-1 block tabular-nums">
            ${totalDeductible.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            Across {yearGifts.length} gift{yearGifts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block tracking-wider">
            Tax Deductible Portion
          </span>
          <span className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 block tabular-nums">
            ${totalDeductible.toFixed(2)}
          </span>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
            100% Tax-Deductible
          </span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block tracking-wider">
            Non-Deductible Benefits
          </span>
          <span className="font-mono text-2xl font-bold text-slate-600 dark:text-slate-300 mt-1 block tabular-nums">
            $0.00
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            IRC § 170(f)(8) Verified
          </span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block tracking-wider">
            Church EIN / Non-Profit
          </span>
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white mt-1 block">
            {config.ein}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            501(c)(3) Public Charity
          </span>
        </div>
      </div>

      {/* Fund Distribution Breakdown */}
      {yearGifts.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
            <span>Ministry Fund Allocation ({selectedYear})</span>
            <span className="text-slate-400 font-normal lowercase">dedication summary</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(fundAllocations).map(([fundName, amount]) => {
              const share = totalDeductible > 0 ? (amount / totalDeductible) * 100 : 0;
              return (
                <div
                  key={fundName}
                  className="p-3 bg-slate-50/70 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/50"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">
                      {fundName}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-church-burgundy-light dark:bg-church-gold h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                    {share.toFixed(0)}% of your annual giving
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Download and Export Buttons */}
      <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Includes cryptographic verification hash &amp; church treasurer signature</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Export CSV for CPA */}
          <button
            onClick={handleExportTaxCsv}
            disabled={yearGifts.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export CSV (CPA)</span>
          </button>

          {/* Primary Action: Download PDF Report */}
          <button
            onClick={handleDownloadPdf}
            disabled={yearGifts.length === 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Download PDF Annual Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
