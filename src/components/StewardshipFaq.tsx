import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { Link } from 'react-router-dom';

type FaqItem = { question: string; answer: React.ReactNode };

function buildFaqItems(supportEmail: string): FaqItem[] {
  return [
    {
      question: 'Who can see my gifts?',
      answer:
        'Your giving history is private. You can see it by signing in to My Giving with a one-time code emailed to you. A small number of authorized church finance staff can see gift records in order to send receipts and keep the church\'s financial records. Gift amounts are never shared publicly.',
    },
    {
      question: 'How do I open My Giving?',
      answer:
        'Choose My Giving in the navigation. Enter the email used on your gift, request a code, and enter the code from your inbox. You\'ll stay signed in on that device for up to 30 days. If you\'re using a shared computer, sign out when you\'re done.',
    },
    {
      question: 'When will I get a receipt?',
      answer:
        'We email a contribution receipt after each completed gift. Card and wallet gifts send right away. Bank transfers send once the payment settles, usually within four business days. You can also print a copy from My Giving.',
    },
    {
      question: 'Will I get a year-end statement?',
      answer:
        'Yes. We email year-end giving statements by January 31 for the prior calendar year. You can also print a yearly summary from My Giving anytime.',
    },
    {
      question: 'How do I change or cancel a recurring gift?',
      answer:
        'Sign in to My Giving and use Manage recurring gift to open a secure Stripe page where you can cancel or update your payment method. Changes apply to future charges only.',
    },
    {
      question: 'Is my payment information safe?',
      answer:
        'Card and bank payments are processed by Stripe. The church never stores your full card or bank numbers—only gift amounts, fund, and receipt details needed for records.',
    },
    {
      question: 'Are my gifts tax-deductible?',
      answer:
        'Anointed Worship Center is a 501(c)(3) public religious organization. Qualifying gifts are tax-deductible as allowed by law. Keep your emailed receipts and year-end statement for your records. This site does not give tax advice.',
    },
    {
      question: 'What fund am I giving to?',
      answer:
        'Gifts go to Tithes & Offerings, which supports the church’s worship and ministry. If leadership adds more funds later, you will see them on the Give form.',
    },
    {
      question: 'What if I have a question or a disputed charge?',
      answer: (
        <>
          Email{' '}
          <a href={`mailto:${supportEmail}`} className="underline hover:text-[#D4AF37]">
            {supportEmail}
          </a>{' '}
          with your name, receipt email, amount, and date. For refund requests, see our{' '}
          <Link to="/refund-policy" className="underline hover:text-[#D4AF37]">
            refund policy
          </Link>
          .
        </>
      ),
    },
  ];
}

export const StewardshipFaq: React.FC = () => {
  const { config } = useChurch();
  const supportEmail = config.email?.trim() || 'stewardship@anointedworshipcenter.com';
  const items = buildFaqItems(supportEmail);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
      <h2 className="font-serif-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white text-center">
        Giving FAQ
      </h2>
      <p className="mt-2 text-center text-sm text-slate-500 max-w-lg mx-auto">
        Plain answers about how AWC Tithe works today.
      </p>
      <div className="mt-8 divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 overflow-hidden">
        {items.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.question}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white"
                aria-expanded={open}
              >
                {item.question}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {open ? (
                <div className="px-5 pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.answer}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};
