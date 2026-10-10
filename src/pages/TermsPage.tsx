import React from 'react';
import { Link } from 'react-router-dom';
import { LegalPageLayout, LegalSection } from '../components/LegalPageLayout';
import { useChurch } from '../context/ChurchContext';

export default function TermsPage() {
  const { config } = useChurch();
  const email = config.email?.trim() || 'stewardship@anointedworshipcenter.com';
  const legalName = config.legalEntityName?.trim() || config.name;

  return (
    <LegalPageLayout title="Terms of Use" updated="October 7, 2026">
      <p>
        These terms govern your use of AWC Tithe, the online giving site operated for {legalName}. By using
        this site you agree to these terms.
      </p>

      <LegalSection title="1. Purpose of the site">
        <p>
          AWC Tithe lets you make voluntary contributions to church funds, view your giving history after email
          verification, and download contribution acknowledgments. It is not a bank, investment product, or tax
          advisory service.
        </p>
      </LegalSection>

      <LegalSection title="2. Contributions">
        <p>
          Gifts are voluntary charitable contributions to {legalName}, described as a{' '}
          {config.taxExemptStatus || '501(c)(3) public religious organization'}. Amounts, fund designations, and
          whether you cover processing fees are chosen by you at checkout. Processing fees charged by payment
          processors are not a separate donation unless you elect to cover them.
        </p>
      </LegalSection>

      <LegalSection title="3. Accounts and My Giving">
        <p>
          My Giving access is granted after you verify an email address with a one-time code. You are responsible
          for protecting access to that email inbox. Staff Portal is for authorized church stewards only and
          requires a separate invite and authenticator verification.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>
          Do not misuse the site (including attempting to probe, overload, or bypass security controls; submitting
          false payment information; or accessing another person’s gifts without authorization). We may suspend
          access that appears abusive.
        </p>
      </LegalSection>

      <LegalSection title="5. Disclaimers">
        <p>
          The site and related materials are provided as available. We do not warrant uninterrupted service or
          that content is free of errors. Tax treatment of gifts depends on your situation; consult your own tax
          advisor. Contribution acknowledgments describe gifts for your records; they are not an IRS endorsement
          or “verified” seal.
        </p>
      </LegalSection>

      <LegalSection title="6. Refunds and privacy">
        <p>
          Refund handling is described in our{' '}
          <Link to="/refund-policy" className="underline hover:text-[#D4AF37]">
            Refund Policy
          </Link>
          . How we handle personal data is described in our{' '}
          <Link to="/privacy" className="underline hover:text-[#D4AF37]">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. Contact">
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${email}`} className="underline hover:text-[#D4AF37]">
            {email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
