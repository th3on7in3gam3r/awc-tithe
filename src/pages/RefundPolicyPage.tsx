import React from 'react';
import { LegalPageLayout, LegalSection } from '../components/LegalPageLayout';
import { useChurch } from '../context/ChurchContext';

export default function RefundPolicyPage() {
  const { config } = useChurch();
  const email = config.email?.trim() || 'stewardship@anointedworshipcenter.com';
  const phone = config.phone?.trim() || '';
  const legalName = config.legalEntityName?.trim() || config.name;

  return (
    <LegalPageLayout title="Refund Policy" updated="October 7, 2026">
      <p>
        {legalName} is grateful for every gift. This policy explains how we handle refund requests for
        contributions made through AWC Tithe or other channels recorded by the church.
      </p>

      <LegalSection title="1. General rule">
        <p>
          Charitable contributions are generally voluntary and non-refundable. Once a gift posts to a designated
          fund, the church may have already applied it to ministry work.
        </p>
      </LegalSection>

      <LegalSection title="2. When a refund may be considered">
        <p>We may review a refund request on a case-by-case basis when, for example:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>There was a clear duplicate or unauthorized charge</li>
          <li>An obvious amount or fund error occurred at checkout</li>
          <li>A technical processor error charged you incorrectly</li>
        </ul>
        <p className="mt-2">
          Refunds are not guaranteed. Card or bank disputes may also be handled through your financial
          institution under their rules.
        </p>
      </LegalSection>

      <LegalSection title="3. How to request a review">
        <p>Contact stewardship promptly (ideally within 30 days of the charge) with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Donor name and receipt email</li>
          <li>Receipt or transaction reference (if available)</li>
          <li>Amount, approximate date, and reason for the request</li>
        </ul>
        <div
          className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4"
          style={{ borderLeft: '3px solid #D4AF37' }}
        >
          <p className="font-semibold text-slate-900 dark:text-white">{legalName} — Stewardship</p>
          <p>
            Email:{' '}
            <a href={`mailto:${email}`} className="underline hover:text-[#D4AF37]">
              {email}
            </a>
          </p>
          {phone ? (
            <p>
              Phone:{' '}
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="underline hover:text-[#D4AF37]">
                {phone}
              </a>
            </p>
          ) : null}
        </div>
      </LegalSection>

      <LegalSection title="4. If a refund is approved">
        <p>
          Approved refunds are typically returned to the original payment method. Timing depends on Stripe
          and your card issuer or bank (often several business days). Staff may also adjust church ledger status
          (for example, marked refunded) when a refund is processed.
        </p>
      </LegalSection>

      <LegalSection title="5. Recurring gifts">
        <p>
          You may change or cancel a recurring gift from My Giving using Manage recurring gift, or
          by contacting stewardship. Canceling future charges does not automatically refund past gifts.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
