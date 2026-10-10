import React, { useState } from 'react';
import { previewYearEndStatements, sendYearEndStatements } from '../lib/api';

type Preview = {
  year: number;
  donorCount: number;
  sample: {
    donorEmail: string;
    donorName: string;
    total: number;
    lines: Array<{ date: string; fund: string; amount: number }>;
    alreadySent: boolean;
  } | null;
  html: string;
};

export const YearEndStatementsAdmin: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; skipped: number; failed: number } | null>(null);
  const [resendEmail, setResendEmail] = useState('');

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await previewYearEndStatements(year));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview statements');
    } finally {
      setLoading(false);
    }
  };

  const send = async (email?: string) => {
    setLoading(true);
    setError(null);
    try {
      const summary = await sendYearEndStatements({ year, resendEmail: email });
      setResult(summary);
      setPreview(await previewYearEndStatements(year));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-6 max-w-3xl">
      <div className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6">
        <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white">
          Send year-end statements
        </h3>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Emails a statement to each donor with completed gifts in the selected year. Refunded and failed gifts are left out. A donor is emailed once per year unless you resend to that person.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">
            Tax year
            <input
              type="number"
              className="mt-1 block w-28 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPreview()}
            className="rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#4A0404' }}
          >
            {loading ? 'Working…' : 'Preview sample'}
          </button>
          <button
            type="button"
            disabled={loading || !preview}
            onClick={() => void send()}
            className="rounded-md px-3 py-2 text-xs font-semibold border border-[#4A0404] text-[#4A0404] disabled:opacity-50"
          >
            Send year-end statements
          </button>
        </div>
        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        {result ? (
          <p className="mt-3 text-xs text-slate-700 dark:text-slate-200">
            Sent {result.sent}. Skipped {result.skipped}. Failed {result.failed}.
          </p>
        ) : null}
      </div>

      {preview ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <p className="text-xs text-slate-500">
            {preview.donorCount} donor{preview.donorCount === 1 ? '' : 's'} with gifts in {preview.year}.
            {preview.sample ? ` Sample for ${preview.sample.donorName} (${preview.sample.donorEmail}).` : ' Nothing to preview.'}
            {preview.sample?.alreadySent ? ' This sample was already sent.' : ''}
          </p>
          {preview.html ? (
            <div
              className="rounded-lg border border-slate-100 dark:border-slate-800 p-4 text-sm overflow-auto max-h-96"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          ) : null}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <label className="text-xs text-slate-500">
              Resend to this donor
              <input
                type="email"
                className="mt-1 block w-64 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <button
              type="button"
              disabled={loading || !resendEmail.includes('@')}
              onClick={() => void send(resendEmail.trim())}
              className="rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#4A0404' }}
            >
              Resend to this donor
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
