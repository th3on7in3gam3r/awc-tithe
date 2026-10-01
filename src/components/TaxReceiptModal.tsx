import React from 'react';
import { Donation } from '../types';
import { useChurch } from '../context/ChurchContext';
import { Printer, Download, X, CheckCircle } from 'lucide-react';

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

  const letterDate = new Date(donation.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const pastorName = config.seniorPastor || 'Pastor Kenneth Mutegyeki';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Screen-only chrome */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Official Contribution Receipt
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEmailCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Resend Email</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded shadow-sm transition-colors"
              style={{ backgroundColor: '#4A0404' }}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              aria-label="Close receipt modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Professional letter — this is what prints */}
        <div
          id="printable-receipt"
          className="bg-white text-slate-900 p-8 sm:p-10"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {/* Letterhead */}
          <header className="flex items-start gap-4 pb-5" style={{ borderBottom: '2px solid #4A0404' }}>
            <img
              src="/images/awc-crest.png"
              alt="Anointed Worship Center"
              className="h-20 w-20 sm:h-24 sm:w-24 object-contain shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/images/awc-logo.png';
              }}
            />
            <div className="min-w-0 flex-1">
              <h1
                className="text-xl sm:text-2xl font-bold tracking-tight"
                style={{ color: '#4A0404', fontFamily: 'Georgia, serif' }}
              >
                {config.name}
              </h1>
              <p
                className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: '#D4AF37' }}
              >
                Where Everybody is Somebody
              </p>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                {config.legalEntityName}
                {config.address ? ` · ${config.address}` : ''}
                {config.cityStateZip ? `, ${config.cityStateZip}` : ''}
              </p>
              <p className="text-xs text-slate-600">
                {config.phone ? `${config.phone} · ` : ''}
                {config.email}
                {config.website ? ` · ${config.website}` : ''}
              </p>
              {config.ein ? (
                <p className="mt-1 text-[11px] font-mono text-slate-500">EIN: {config.ein}</p>
              ) : null}
            </div>
          </header>

          {/* Date & receipt meta */}
          <div className="mt-8 flex flex-col sm:flex-row sm:justify-between gap-2 text-sm">
            <p>{letterDate}</p>
            <p className="font-mono text-xs sm:text-sm">
              Receipt No. <strong>{donation.receiptNumber}</strong>
            </p>
          </div>

          {/* Recipient */}
          <div className="mt-6 text-sm leading-relaxed">
            <p className="font-semibold">{donation.donorName}</p>
            {donation.donorAddress ? <p>{donation.donorAddress}</p> : null}
            <p>{donation.donorEmail}</p>
          </div>

          <p className="mt-8 text-sm">Dear {donation.isAnonymous ? 'Friend' : donation.donorName.split(' ')[0] || 'Friend'},</p>

          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              On behalf of Anointed Worship Center, thank you for your faithful generosity. Your contribution
              strengthens worship, pastoral care, and the ministries that serve our congregation and community.
            </p>

            <div
              className="my-6 py-4 px-4"
              style={{ borderLeft: '3px solid #D4AF37', backgroundColor: 'rgba(74,4,4,0.04)' }}
            >
              <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#4A0404' }}>
                Contribution summary
              </p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-slate-600">Amount (tax-deductible)</td>
                    <td className="py-1 text-right font-mono font-semibold">${donation.amount.toFixed(2)}</td>
                  </tr>
                  {donation.feeAmount > 0 && (
                    <tr>
                      <td className="py-1 text-slate-600">Processing fee covered</td>
                      <td className="py-1 text-right font-mono">${donation.feeAmount.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-1 text-slate-600">Total charged</td>
                    <td className="py-1 text-right font-mono font-semibold">${donation.totalCharged.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Designated fund</td>
                    <td className="py-1 text-right font-medium">{donation.fundName}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Frequency</td>
                    <td className="py-1 text-right capitalize">{donation.frequency}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Payment method</td>
                    <td className="py-1 text-right capitalize">
                      {donation.cardBrand || donation.paymentMethod}
                      {donation.cardLast4 ? ` ····${donation.cardLast4}` : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
              {donation.dedication ? (
                <p className="mt-3 text-xs italic text-slate-600">Dedication: “{donation.dedication}”</p>
              ) : null}
            </div>

            <p>
              This letter serves as your official acknowledgment for tax purposes. {config.name} is a{' '}
              {config.taxExemptStatus}. No goods or services were provided in exchange for this contribution other
              than intangible religious benefits, in accordance with Internal Revenue Code Section 170(f)(8).
            </p>

            <p>
              May the Lord bless you for sowing into His work. We are grateful to partner with you in the gospel.
            </p>
          </div>

          {/* Pastoral closing */}
          <div className="mt-10 text-sm">
            <p>With gratitude in Christ,</p>
            <div className="mt-8">
              <p
                className="text-lg italic"
                style={{ color: '#4A0404', fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {pastorName}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Senior Pastor
              </p>
              <p className="text-xs text-slate-500">{config.name}</p>
            </div>
          </div>

          {/* Footer meta */}
          <footer
            className="mt-12 pt-4 text-[10px] text-slate-500 leading-relaxed"
            style={{ borderTop: '1px solid rgba(212,175,55,0.5)' }}
          >
            <p>
              Transaction reference: {donation.transactionId}
              {donation.awcDcbVoucher ? ` · AWC DCB voucher: ${donation.awcDcbVoucher}` : ''}
            </p>
            <p className="mt-1">
              Please retain this letter with your tax records. For stewardship questions, contact {config.email}.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};
