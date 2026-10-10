import React, { useState } from 'react';
import { staffAuthClient } from '../lib/authClient';
import { acceptStaffInvite, auditStaffTwoFactor, fetchStaffSession } from '../lib/api';
import { useChurch } from '../context/ChurchContext';
import { KeyRound, X } from 'lucide-react';

interface MfaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccessGranted?: () => void;
}

type Step = 'email' | 'otp' | 'totp' | 'enroll';

function inviteTokenFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('staffInvite') || '';
}

export const MfaModal: React.FC<MfaModalProps> = ({ isOpen, onClose, onAccessGranted }) => {
  const { refreshStaffSession } = useChurch();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [totp, setTotp] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const finish = async () => {
    const session = await fetchStaffSession();
    if (session.error === 'NOT_STAFF' || session.error === 'STAFF_DEACTIVATED') {
      setError(
        session.error === 'STAFF_DEACTIVATED'
          ? 'This staff account is deactivated.'
          : 'This email is not invited for Staff Portal. Use the exact address on your staff invitation.'
      );
      return;
    }
    if (session.needsEnrollment) {
      setStep('enroll');
      return;
    }
    if (session.mfaRequired) {
      setStep('totp');
      return;
    }
    const ok = await refreshStaffSession();
    if (!ok) {
      setError('Staff Portal could not be opened for this account.');
      return;
    }
    setStep('email');
    setOtp('');
    setTotp('');
    onAccessGranted?.();
    onClose();
  };

  const afterSignIn = async () => {
    const token = inviteTokenFromLocation();
    if (token) {
      const accepted = await acceptStaffInvite(token);
      if (!accepted.ok) {
        setError(accepted.message || 'Invite could not be accepted.');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.delete('staffInvite');
      const query = params.toString();
      window.history.replaceState(null, '', query ? `/?${query}` : '/');
    }
    await finish();
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await staffAuthClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: 'sign-in',
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'Could not send a sign-in code.');
      return;
    }
    setStep('otp');
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await staffAuthClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: otp.trim(),
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'That code was not accepted.');
      return;
    }
    const data = result.data as { twoFactorRedirect?: boolean } | null;
    if (data?.twoFactorRedirect) {
      setStep('totp');
      return;
    }
    const session = await fetchStaffSession();
    if (session.mfaRequired) {
      setStep('totp');
      return;
    }
    await afterSignIn();
  };

  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await staffAuthClient.twoFactor.verifyTotp({ code: totp.trim() });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'Authenticator code was not accepted.');
      return;
    }
    await afterSignIn();
  };

  const startEnroll = async () => {
    setSubmitting(true);
    setError(null);
    const result = await staffAuthClient.twoFactor.enable({ method: 'totp' });
    setSubmitting(false);
    if (result.error || !result.data) {
      setError(result.error?.message || 'Could not start authenticator setup.');
      return;
    }
    const data = result.data as { totpURI?: string; backupCodes?: string[] };
    setTotpUri(data.totpURI || '');
    setBackupCodes(data.backupCodes || []);
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await staffAuthClient.twoFactor.verifyTotp({ code: totp.trim() });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'Authenticator code was not accepted.');
      return;
    }
    await auditStaffTwoFactor('enrolled');
    const ok = await refreshStaffSession();
    if (!ok) {
      setError('Enrollment saved, but admin access is still locked. Try the code again.');
      return;
    }
    setBackupCodes([]);
    setTotpUri('');
    setTotp('');
    setStep('email');
    onAccessGranted?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" style={{ color: '#4A0404' }} />
            <div>
              <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">Staff Portal</h3>
              <p className="text-[11px] text-slate-500">Sign in with your own email</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-red-700">{error}</p>}

        {step === 'email' && (
          <form onSubmit={(e) => void sendCode(e)} className="space-y-3">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full py-2.5 px-3 rounded-lg border border-slate-300 text-sm"
            />
            <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: '#4A0404' }}>
              {submitting ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={(e) => void verifyOtp(e)} className="space-y-3">
            <p className="text-xs text-slate-600">Enter the 6-digit code sent to {email}.</p>
            {typeof window !== 'undefined' && window.location.hostname === 'localhost' ? (
              <p className="text-[11px] text-slate-500">
                Local development: if no email arrives, the code is printed in the API terminal.
              </p>
            ) : null}
            <input
              inputMode="numeric"
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full py-2.5 px-3 rounded-lg border border-slate-300 text-sm tracking-widest"
            />
            <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: '#4A0404' }}>
              {submitting ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={(e) => void verifyTotp(e)} className="space-y-3">
            <p className="text-xs text-slate-600">Enter the code from your authenticator app.</p>
            <input
              inputMode="numeric"
              autoFocus
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full py-2.5 px-3 rounded-lg border border-slate-300 text-sm tracking-widest"
            />
            <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: '#4A0404' }}>
              {submitting ? 'Checking…' : 'Verify'}
            </button>
          </form>
        )}

        {step === 'enroll' && (
          <form onSubmit={(e) => void confirmEnroll(e)} className="space-y-3">
            <p className="text-xs text-slate-600">
              Administrators must enroll an authenticator before opening admin tools. Staff may enroll later.
            </p>
            {!totpUri ? (
              <button type="button" onClick={() => void startEnroll()} disabled={submitting} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: '#4A0404' }}>
                {submitting ? 'Preparing…' : 'Set up authenticator'}
              </button>
            ) : (
              <>
                <p className="text-[11px] break-all font-mono text-slate-700">{totpUri}</p>
                <p className="text-xs text-slate-600">Save these backup codes now. They are shown once.</p>
                <pre className="text-[11px] bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{backupCodes.join('\n')}</pre>
                <input
                  inputMode="numeric"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Code from the app"
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-300 text-sm"
                />
                <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: '#4A0404' }}>
                  {submitting ? 'Saving…' : 'Confirm authenticator'}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
