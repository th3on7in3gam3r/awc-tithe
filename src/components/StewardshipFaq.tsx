import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Who can see my gifts?',
    answer:
      'Your giving history is private. Only you can unlock My Giving with the email on your receipt. Staff use a separate Staff Portal (invite + code) for church finance tools and never browse a public donor directory from this site. Congregation bulletins do not list gift amounts.',
  },
  {
    question: 'How do I sign back in to My Giving?',
    answer:
      'Use My Giving in the top navigation (or footer). There is no password—enter the same email used on your gift receipt and choose Access My Giving. On this device, your session remembers that email until you Sign out. After a new gift, View My Giving opens your profile with that email already applied.',
  },
  {
    question: 'What is the difference between My Giving and Staff Portal?',
    answer:
      'My Giving (Donor Portal) is for members: your receipts, pledges, and tax statements only. Staff Portal is for authorized church stewards who receive an invite/access code plus authenticator verification. Members cannot open Staff Portal without that invite. Staff Portal never replaces your private donor profile.',
  },
  {
    question: 'What does “anonymous” giving mean?',
    answer:
      'Anonymous means your name is withheld from congregation-facing listings. Your official tax receipt is still emailed to you and stored against that email so you can access My Giving and annual statements. Finance records may show “Anonymous” for public display while retaining the receipt email for your portal.',
  },
  {
    question: 'How do card (Stripe) and bank (Plaid) payments work?',
    answer:
      'Card gifts process through Stripe’s secure checkout. Bank gifts use Plaid Link to authorize an ACH transfer from your financial institution. AWC Tithe never stores full card numbers (PANs) on church servers—payment credentials stay with Stripe or your bank via Plaid.',
  },
  {
    question: 'What are processing fees, and should I cover them?',
    answer:
      'Card processors charge a small fee (typically a percentage plus a fixed amount). Bank ACH fees are usually lower. If you choose to cover processing, that fee is added to your charge so 100% of your intended gift principal reaches the designated fund. If you do not cover fees, the net amount credited to ministry may be slightly less than the amount you typed.',
  },
  {
    question: 'How do recurring gifts work, and how do I pause or cancel?',
    answer:
      'Choose weekly, bi-weekly, monthly, or annually when you give. Recurring gifts process on that schedule using your saved payment method. Open My Giving, find Active Recurring Pledge, and use Pause or Cancel Recurring Pledge anytime. You can also adjust future giving by starting a new gift from Give Now.',
  },
  {
    question: 'When do I get a tax receipt or annual statement?',
    answer:
      'Each completed gift can generate an official letterhead contribution receipt (Print / Save PDF) suitable for your records. Comprehensive annual tax summaries for a calendar year are available on demand in My Giving under Annual Tax Statements & Ledger. Receipts confirm that no goods or services were provided beyond intangible religious benefits under IRC § 170.',
  },
  {
    question: 'Are my gifts tax-deductible?',
    answer:
      'Anointed Worship Center is a 501(c)(3) public religious organization. Qualifying contributions are generally deductible to the extent allowed by law. Keep your per-gift receipts and annual statement for filing. This site does not provide tax advice—consult your CPA or tax preparer for your situation.',
  },
  {
    question: 'What is General Tithes & Offerings vs. designated campaigns?',
    answer:
      'General Tithes & Offerings support ongoing church operations, worship, pastoral care, and local ministry. Designated funds (such as building, missions, or benevolence) direct your gift to that specific purpose. Choose the fund on the Give form; your My Giving profile shows how much you have given to each designation.',
  },
  {
    question: 'Is my payment information safe?',
    answer:
      'Yes. Card data is handled by Stripe under PCI-DSS. Bank linking uses Plaid. AWC Tithe stores gift amounts, fund designations, and receipt metadata—not raw card numbers. Connections use encrypted transport (TLS). Instant receipts and My Giving access use your email as a soft privacy gate, not a password vault.',
  },
  {
    question: 'Where does the money go after I give?',
    answer:
      'Settled gifts are recorded in AWC Tithe for your tax records and for church stewardship review. Funds settle to the church’s designated financial institution (such as DCU) according to processor schedules. High-level finance sync may appear in church bookkeeping tools for staff—never as a public list of your personal banking details.',
  },
  {
    question: 'What if I cannot find my gifts or used a different email?',
    answer:
      'My Giving only shows gifts tied to the email you enter. Try every address you may have used on a receipt. If you still cannot unlock your history, contact stewardship@anointedworshipcenter.org with your receipt number and approximate gift date so the stewardship team can help.',
  },
  {
    question: 'Who do I contact about my personal giving or a disputed charge?',
    answer:
      'Email stewardship@anointedworshipcenter.org with your name, receipt email, receipt number (if any), amount, and date. For card or bank disputes, you may also contact your financial institution; sharing your AWC receipt number helps the church verify the transaction quickly.',
  },
];

export const StewardshipFaq: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="mt-12 max-w-3xl mx-auto" aria-labelledby="stewardship-faq-heading">
      <div className="mb-6 text-center">
        <h2
          id="stewardship-faq-heading"
          className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2"
        >
          <HelpCircle className="h-5 w-5 text-slate-400" />
          Stewardship FAQ
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Clear answers about your personal gifts, privacy, receipts, and how to return to My Giving.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-slate-900 dark:text-white pr-2">
                  {item.question}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 mt-0.5 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
