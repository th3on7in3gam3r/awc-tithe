import React from 'react';
import { Donation } from '../types';
import { useChurch } from '../context/ChurchContext';
import { Printer, Download, X, CheckCircle, ShieldCheck } from 'lucide-react';

interface TaxReceiptModalProps {
  donation: Donation | null;
  onClose: () => void;
}

export const TaxReceiptModal: React.FC<TaxReceiptModalProps> = ({ donation, onClose }) => {
  const { config, addNotification } = useChurch();

  if (!donation) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleEmailCopy = () => {
    addNotification(
      'success',
      'Receipt Emailed',
      `Official IRS receipt has been resent to ${donation.donorEmail}.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto no-print">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        
        {/* Modal Controls Header (hidden during print) */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Official Tax Deductible Receipt
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEmailCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Resend Email</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-church-burgundy hover:bg-church-burgundy-light rounded shadow-sm dark:bg-church-burgundy-light dark:hover:bg-church-burgundy-light transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              aria-label="Close receipt modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Official Printable Receipt Content */}
        <div id="printable-receipt" className="p-8 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">
          
          {/* Church Letterhead */}
          <div className="border-b-2 border-slate-900 pb-6 dark:border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="font-serif-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                {config.name}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {config.legalEntityName}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {config.address} · {config.cityStateZip}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {config.phone} · {config.website}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block">
                Federal Tax Exemption
              </span>
              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 block">
                EIN: {config.ein}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 block mt-0.5">
                {config.taxExemptStatus}
              </span>
            </div>
          </div>

          {/* Receipt Identification Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 block uppercase tracking-wider text-[10px]">Receipt Serial</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{donation.receiptNumber}</span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase tracking-wider text-[10px]">Contribution Date</span>
              <span className="font-mono font-medium">{new Date(donation.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase tracking-wider text-[10px]">Payment Method</span>
              <span className="capitalize">{donation.cardBrand || donation.paymentMethod} (****{donation.cardLast4 || '0000'})</span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase tracking-wider text-[10px]">Giving Frequency</span>
              <span className="capitalize font-medium text-church-burgundy dark:text-church-gold">{donation.frequency}</span>
            </div>
          </div>

          {/* Donor Information */}
          <div className="py-4 border-b border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Donor Record
            </span>
            <p className="font-semibold text-sm text-slate-950 dark:text-white">
              {donation.donorName}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {donation.donorEmail}
            </p>
            {donation.donorAddress && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {donation.donorAddress}
              </p>
            )}
            {donation.dedication && (
              <p className="text-xs italic text-slate-600 dark:text-slate-400 mt-1">
                Dedication: "{donation.dedication}"
              </p>
            )}
          </div>

          {/* Contribution Breakdown Ledger */}
          <div className="py-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-left text-[11px] text-slate-500 uppercase">
                  <th className="pb-2 font-medium">Designated Fund</th>
                  <th className="pb-2 font-medium text-right">Deductible Principal</th>
                  <th className="pb-2 font-medium text-right">Covered Fee</th>
                  <th className="pb-2 font-medium text-right">Total Transacted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-3 font-medium text-slate-900 dark:text-slate-100">
                    {donation.fundName}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    ${donation.amount.toFixed(2)}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-500">
                    ${donation.feeAmount.toFixed(2)}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums font-bold text-slate-950 dark:text-white">
                    ${donation.totalCharged.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Statutory Tax Disclaimer */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs text-slate-600 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300 leading-relaxed mb-6">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>IRS Section 170(f)(8) Compliance Attestation</span>
            </div>
            <p>
              {config.name} is an exempt religious organization under Section 501(c)(3) of the Internal Revenue Code. No goods or services were provided in whole or partial exchange for this contribution other than intangible religious benefits. Please retain this official receipt for your federal and state tax deduction records.
            </p>
          </div>

          {/* Authorized Officer Signature & Verification */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-end gap-6 text-xs">
            <div className="w-full sm:w-auto">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Stripe Gateway Authorization</span>
              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 block truncate max-w-xs">
                Ref: {donation.transactionId}
              </span>
              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-xs">
                Security Hash: {donation.encryptedToken}
              </span>
            </div>
            <div className="text-left sm:text-right border-t border-slate-300 dark:border-slate-700 pt-2 min-w-[180px]">
              <p className="font-serif-display italic font-semibold text-slate-900 dark:text-white text-sm">
                {config.financialOfficer}
              </p>
              <p className="text-[11px] text-slate-500">Stewardship &amp; Finance Director</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
