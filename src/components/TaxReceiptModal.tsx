import React, { useEffect } from 'react';
import { Donation } from '../types';
import { useChurch } from '../context/ChurchContext';
import { Printer, Download, X, CheckCircle } from 'lucide-react';

interface TaxReceiptModalProps {
  donation: Donation | null;
  onClose: () => void;
}

/** Prefer .com for AWC public contact display (legacy .org may linger in storage/env). */
function churchContact(email?: string, website?: string) {
  const normalize = (v: string) =>
    v.replace(/anointedworshipcenter\.org/gi, 'anointedworshipcenter.com');
  return {
    email: email ? normalize(email) : 'stewardship@anointedworshipcenter.com',
    website: website ? normalize(website) : 'https://anointedworshipcenter.com',
  };
}

export const TaxReceiptModal: React.FC<TaxReceiptModalProps> = ({ donation, onClose }) => {
  const { config, addNotification } = useChurch();

  useEffect(() => {
    if (!donation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [donation, onClose]);

  if (!donation) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleEmailCopy = () => {
    addNotification(
      'success',
      'Receipt Emailed',
      `Contribution receipt has been resent to ${donation.donorEmail}.`
    );
  };

  const letterDate = new Date(donation.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const pastorName = config.seniorPastor || 'Pastor Kenneth Mutegyeki';
  const { email: displayEmail, website: displayWebsite } = churchContact(
    config.email,
    config.website
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      {/* Always-visible top bar (never scrolls away) */}
      <div className="no-print flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#2A0202] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-[#D4AF37]" />
          <h3 id="receipt-modal-title" className="truncate text-sm font-semibold">
            Printable copy of your receipt
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleEmailCopy}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-medium hover:bg-white/15"
          >
            <Download className="h-3.5 w-3.5" />
            Resend
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#2A0202]"
            style={{ backgroundColor: '#D4AF37' }}
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            aria-label="Close receipt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable middle — only this region scrolls */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        onClick={onClose}
      >
        <div
          className="mx-auto w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            id="printable-receipt"
            className="rounded-xl border border-slate-200 bg-white px-5 py-5 text-slate-900 shadow-xl sm:px-7 sm:py-6"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            <header
              className="flex items-start gap-3 pb-3"
              style={{ borderBottom: '2px solid #4A0404' }}
            >
              <img
                src="/images/awc-crest.png"
                alt="Anointed Worship Center"
                className="h-12 w-12 sm:h-14 sm:w-14 object-contain shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/images/awc-logo.png';
                }}
              />
              <div className="min-w-0 flex-1">
                <h1
                  className="text-base sm:text-lg font-bold tracking-tight"
                  style={{ color: '#4A0404', fontFamily: 'Georgia, serif' }}
                >
                  {config.name}
                </h1>
                <p
                  className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: '#D4AF37' }}
                >
                  Where Everybody is Somebody
                </p>
                <p className="mt-1 text-[11px] text-slate-600 leading-snug">
                  {config.legalEntityName}
                  {config.address ? ` · ${config.address}` : ''}
                  {config.cityStateZip ? `, ${config.cityStateZip}` : ''}
                </p>
                <p className="text-[11px] text-slate-600 leading-snug break-all">
                  {config.phone ? `${config.phone} · ` : ''}
                  {displayEmail}
                  {displayWebsite ? ` · ${displayWebsite}` : ''}
                </p>
                {config.ein ? (
                  <p className="mt-0.5 text-[10px] font-mono text-slate-500">EIN: {config.ein}</p>
                ) : null}
              </div>
            </header>

            <div className="mt-4 flex flex-col sm:flex-row sm:justify-between gap-1 text-sm">
              <p>{letterDate}</p>
              <p className="font-mono text-xs sm:text-sm">
                Receipt No. <strong>{donation.receiptNumber}</strong>
              </p>
            </div>

            <div className="mt-3 text-sm leading-snug">
              <p className="font-semibold">{donation.donorName}</p>
              {donation.donorAddress ? <p>{donation.donorAddress}</p> : null}
              <p>{donation.donorEmail}</p>
            </div>

            <p className="mt-4 text-sm">
              Dear {donation.isAnonymous ? 'Friend' : donation.donorName.split(' ')[0] || 'Friend'},
            </p>

            <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-slate-800">
              <p>
                On behalf of Anointed Worship Center, thank you for your faithful generosity. Your
                contribution strengthens worship, pastoral care, and the ministries that serve our
                congregation and community.
              </p>

              <div
                className="my-3 py-2.5 px-3"
                style={{ borderLeft: '3px solid #D4AF37', backgroundColor: 'rgba(74,4,4,0.04)' }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: '#4A0404' }}
                >
                  Contribution summary
                </p>
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-0.5 text-slate-600">Amount (tax-deductible)</td>
                      <td className="py-0.5 text-right font-mono font-semibold">
                        ${donation.amount.toFixed(2)}
                      </td>
                    </tr>
                    {donation.feeAmount > 0 && (
                      <tr>
                        <td className="py-0.5 text-slate-600">Processing fee covered</td>
                        <td className="py-0.5 text-right font-mono">
                          ${donation.feeAmount.toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-0.5 text-slate-600">Total charged</td>
                      <td className="py-0.5 text-right font-mono font-semibold">
                        ${donation.totalCharged.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-slate-600">Designated fund</td>
                      <td className="py-0.5 text-right font-medium">{donation.fundName}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-slate-600">Frequency</td>
                      <td className="py-0.5 text-right capitalize">{donation.frequency}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-slate-600">Payment method</td>
                      <td className="py-0.5 text-right capitalize">
                        {donation.cardBrand || donation.paymentMethod}
                        {donation.cardLast4 ? ` ····${donation.cardLast4}` : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {donation.dedication ? (
                  <p className="mt-2 text-xs italic text-slate-600">
                    Dedication: “{donation.dedication}”
                  </p>
                ) : null}
              </div>

              <p>
                This letter is your contribution acknowledgment for tax records. {config.name} is a{' '}
                {config.taxExemptStatus}. No goods or services were provided in exchange for this
                contribution other than intangible religious benefits, in accordance with Internal
                Revenue Code Section 170(f)(8).
              </p>

              <p>
                May the Lord bless you for sowing into His work. We are grateful to partner with you
                in the gospel.
              </p>
            </div>

            <div className="mt-5 text-sm">
              <p>With gratitude in Christ,</p>
              <div className="mt-4">
                <p
                  className="text-base italic"
                  style={{ color: '#4A0404', fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {pastorName}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Senior Pastor
                </p>
                <p className="text-[11px] text-slate-500">{config.name}</p>
              </div>
            </div>

            <footer
              className="mt-6 pt-3 text-[10px] text-slate-500 leading-relaxed"
              style={{ borderTop: '1px solid rgba(212,175,55,0.5)' }}
            >
              <p>
                Transaction reference: {donation.transactionId}
                
              </p>
              <p className="mt-1">
                Please retain this letter with your tax records. For stewardship questions, contact{' '}
                {displayEmail}.
              </p>
            </footer>
          </div>
        </div>
      </div>

      {/* Always-visible bottom Close */}
      <div className="no-print flex shrink-0 justify-end border-t border-white/10 bg-[#2A0202] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-5 py-2 text-xs font-semibold text-[#2A0202]"
          style={{ backgroundColor: '#D4AF37' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
