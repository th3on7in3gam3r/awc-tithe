import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

/** Staff add their own mobile number so Staff Portal sign-in codes can come by text. */
export const StaffPhoneCard: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const call = async (path: string, body?: unknown) => {
    const res = await fetch(`/api/staff-phone${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
    return data;
  };

  useEffect(() => {
    call('/me')
      .then((d) => {
        setEnabled(Boolean(d.enabled));
        setPhone(d.phone || null);
      })
      .catch(() => setEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full py-2.5 px-3 rounded-lg border border-slate-300 text-base dark:bg-slate-800 dark:border-slate-700 dark:text-white';
  const primary = 'w-full py-3 rounded-lg text-white text-sm font-semibold disabled:opacity-50';

  return (
    <div className="mt-6 p-5 rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 max-w-md">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Smartphone className="h-4 w-4" style={{ color: '#4A0404' }} /> Sign-in codes by text
      </h3>

      {phone ? (
        <div className="mt-2 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Your Staff Portal sign-in code can be texted to <span className="font-mono font-semibold">{phone}</span>. Choose
            “Text me a code instead” when you sign in. Email codes still work.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call('/remove', {});
                setPhone(null);
                setNotice('Text codes are off for your account.');
              })
            }
            className="text-xs font-semibold underline text-slate-600 disabled:opacity-50"
          >
            Turn off text codes
          </button>
        </div>
      ) : pending ? (
        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const d = await call('/link/confirm', { code });
              setPhone(d.phone);
              setPending(null);
              setNotice('Done. Next time, choose “Text me a code instead”.');
            });
          }}
        >
          <p className="text-xs text-slate-600 dark:text-slate-300">Enter the 6-digit code texted to {pending}.</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${field} tracking-widest`}
            placeholder="000000"
          />
          <button type="submit" disabled={busy || code.length !== 6} className={primary} style={{ backgroundColor: '#4A0404' }}>
            {busy ? 'Checking…' : 'Confirm'}
          </button>
        </form>
      ) : (
        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const d = await call('/link/start', { phone: input });
              setPending(d.phone);
              setCode('');
              setNotice(null);
            });
          }}
        >
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Get your Staff Portal sign-in code by text instead of waiting for email. Authenticator codes are unchanged.
          </p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={field}
            placeholder="(508) 555-1234"
          />
          <button type="submit" disabled={busy || input.replace(/\D/g, '').length < 10} className={primary} style={{ backgroundColor: '#4A0404' }}>
            {busy ? 'Sending…' : 'Text me a code to confirm'}
          </button>
        </form>
      )}

      {notice ? <p className="mt-3 text-xs text-green-700" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-700" role="alert">{error}</p> : null}
    </div>
  );
};
