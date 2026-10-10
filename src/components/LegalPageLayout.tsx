import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface LegalPageLayoutProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

/** Shared shell for Privacy, Terms, and Refund Policy. */
export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, updated, children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4EF] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="no-print border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#4A0404] dark:hover:text-[#D4AF37] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Give
          </Link>
          <div className="flex items-center gap-2">
            <img
              src="/images/awc-logo.png"
              alt=""
              className="w-8 h-8 rounded-full object-contain bg-white"
              style={{ border: '1px solid rgba(212,175,55,0.35)' }}
            />
            <span className="text-sm font-bold tracking-tight" style={{ color: '#4A0404' }}>
              AWC Tithe
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div
          className="rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
        >
          <div className="px-6 sm:px-10 py-10 text-center text-white" style={{ backgroundColor: '#4A0404' }}>
            <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h1>
            <p
              className="mt-3 text-[10px] font-semibold uppercase tracking-[0.25em]"
              style={{ color: 'rgba(212,175,55,0.85)' }}
            >
              Last updated: {updated}
            </p>
          </div>
          <div className="px-6 sm:px-10 py-8 sm:py-10 space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {children}
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <Link to="/privacy" className="hover:text-[#D4AF37] transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-[#D4AF37] transition-colors">
            Terms
          </Link>
          <Link to="/refund-policy" className="hover:text-[#D4AF37] transition-colors">
            Refund Policy
          </Link>
          <Link to="/" className="hover:text-[#D4AF37] transition-colors">
            Give Online
          </Link>
        </nav>
      </main>
    </div>
  );
};

export const LegalSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-2">
    <h2 className="font-serif-display text-lg font-semibold text-church-burgundy">{title}</h2>
    <div className="space-y-2">{children}</div>
  </section>
);
