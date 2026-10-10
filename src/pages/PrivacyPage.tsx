import React from 'react';
import { LegalPageLayout, LegalSection } from '../components/LegalPageLayout';
import { useChurch } from '../context/ChurchContext';

export default function PrivacyPage() {
  const { config } = useChurch();
  const email = config.email?.trim() || 'stewardship@anointedworshipcenter.com';
  const legalName = config.legalEntityName?.trim() || config.name;
  const street = config.address?.trim() || '';
  const cityStateZip = config.cityStateZip?.trim() || '';
  const location = [street, cityStateZip].filter(Boolean).join(', ');

  return (
    <LegalPageLayout title="Privacy Policy" updated="October 7, 2026">
      <p>
        This policy describes how {legalName} (“we,” “us”) collects and uses information when you use AWC
        Tithe, our online giving experience. It explains how we handle donor information on AWC Tithe.
      </p>

      <LegalSection title="1. Information we collect">
        <p>Depending on how you give or sign in, we may collect:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Identity and contact details (name, email, optional address and phone)</li>
          <li>Gift details (amount, fund, frequency, dedication, anonymous preference)</li>
          <li>Payment metadata from processors (for example card brand and last four digits)—not full card numbers</li>
          <li>Technical data needed to run the site (such as IP address used for rate limiting and security)</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How we use information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Process contributions and issue contribution acknowledgments</li>
          <li>Provide My Giving access after email verification (one-time code)</li>
          <li>Maintain church financial records and support stewardship staff tools</li>
          <li>Prevent abuse (rate limits, bot checks) and improve reliability</li>
        </ul>
        <p className="mt-2">
          We do not sell donor lists. We do not use your gift history for third-party advertising.
        </p>
      </LegalSection>

      <LegalSection title="3. Processors and service providers">
        <p>
          Card, digital wallet, and US bank account payments are handled by Stripe. Hosting and database providers store application data on our behalf. Those providers process data under their own terms and security programs.
        </p>
      </LegalSection>

      <LegalSection title="4. Retention">
        <p>
          Contribution records are retained as needed for church accounting and applicable tax recordkeeping.
          My Giving sessions expire according to our auth settings. You may request access, correction, or
          redaction of personal details where the law allows; financial totals may be retained where required.
        </p>
      </LegalSection>

      <LegalSection title="5. Security">
        <p>
          We use encrypted transport (TLS) and keep payment card data off our servers by using Stripe Elements
          and similar processor-hosted fields. No online system is perfectly secure; please contact us if you
          believe your account or receipt email has been compromised.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4"
          style={{ borderLeft: '3px solid #D4AF37' }}
        >
          <p className="font-semibold text-slate-900 dark:text-white">{legalName}</p>
          {location ? <p>{location}</p> : null}
          <p>
            Email:{' '}
            <a href={`mailto:${email}`} className="underline hover:text-[#D4AF37]">
              {email}
            </a>
          </p>
        </div>
      </LegalSection>
    </LegalPageLayout>
  );
}
