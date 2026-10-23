import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { fetchPhoneSignIn, removeDonorPhone, requestPhoneCode, toUsE164 } from '../lib/api';
import { linkPhoneWithOtp } from '../lib/authClient';
import { TurnstileWidget } from './TurnstileWidget';

/** Signed-in donors add (or remove) a phone so they can sign in by text next time. */
export const PhoneSignInCard: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPhoneSignIn().then((s) => {
      if (cancelled) return;
      setEnabled(s.enabled);
      setLinkedPhone(s.linkedPhone);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = toUsE164(phoneInput);
    if (!phone) {
      setError('Enter a 10-digit US mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestPhoneCode(phone, 'link', turnstileToken);
      setPendingPhone(phone);
      setCode('');
      setNotice('We texted you a 6-digit code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPhone || code.length !== 6) {
      setError('Enter the 6-digit code from your text.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await linkPhoneWithOtp(pendingPhone, code);
      if (result.error) {
        setError(result.error.message || 'That code did not work. Request a new one.');
        return;
      }
      const s = await fetchPhoneSignIn();
      setLinkedPhone(s.linkedPhone);
      setPendingPhone(null);
      setPhoneInput('');
      setNotice('Text sign-in is on. Next time, choose "Text me a code" when you sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm the code.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeDonorPhone();
      setLinkedPhone(null);
      setNotice('Text sign-in is off. You can still sign in by email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the phone.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[#E8E2D9] bg-white py-2 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white';

  return (
    <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
      <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
        <MessageSquare className="h-4 w-4" style={{ color: '#D4AF37' }} />
        Sign in by text
      </h3>

      {linkedPhone ? (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            On for <span className="font-mono">{linkedPhone}</span>. You can sign in with a texted code or your email.
          </p>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-[11px] font-medium text-slate-600 underline hover:text-church-burgundy disabled:opacity-60 dark:text-slate-300"
          >
            Turn off text sign-in
          </button>
        </div>
      ) : pendingPhone ? (
        <form onSubmit={confirmCode} className="space-y-3">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">6-digit code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="000000"
            className={`${inputClass} tracking-[0.3em] font-mono`}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: '#4A0404' }}
          >
            {busy ? 'Please wait…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingPhone(null);
              setNotice(null);
            }}
            className="w-full text-[11px] text-slate-500 underline"
          >
            Use a different number
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Add your mobile number to sign in with a texted code instead of email. We only text you sign-in codes.
          </p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              setError(null);
            }}
            placeholder="(508) 555-1234"
            className={inputClass}
          />
          <TurnstileWidget onToken={setTurnstileToken} />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: '#4A0404' }}
          >
            {busy ? 'Sending…' : 'Text me a code'}
          </button>
          <p className="text-[10px] text-slate-400 leading-relaxed">Msg &amp; data rates may apply.</p>
        </form>
      )}

      {notice ? (
        <p className="mt-3 text-[11px] text-slate-600 dark:text-slate-300" role="status">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[11px] text-red-600 dark:text-red-400" role="alert">{error}</p>
      ) : null}
    </div>
  );
};
