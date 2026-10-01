import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { ShieldCheck, Lock, X, KeyRound } from 'lucide-react';

interface MfaModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after invite + authenticator succeed — parent should enter Staff Portal. */
  onAccessGranted?: () => void;
}

export const MfaModal: React.FC<MfaModalProps> = ({ isOpen, onClose, onAccessGranted }) => {
  const { verifyStaffAccess } = useChurch();
  const [inviteCode, setInviteCode] = useState('');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setInviteCode('');
    setAuthenticatorCode('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const ok = await verifyStaffAccess(inviteCode, authenticatorCode);
      if (ok) {
        setInviteCode('');
        setAuthenticatorCode('');
        onAccessGranted?.();
        onClose();
      } else {
        setError(
          'Access denied. Staff Portal requires a valid invite/access code from church leadership plus your authenticator code.'
        );
      }
    } catch {
      setError('Could not reach the staff verification service. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'rgba(212,175,55,0.15)', color: '#4A0404' }}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">
                Staff Portal Access
              </h3>
              <p className="text-[11px] text-slate-500">Invite required · members cannot enter</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          Staff Portal is for authorized church stewards only. Enter the invite or access code issued by
          leadership, then your 6-digit authenticator code. Without both, the portal stays locked.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Staff invite / access code
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="off"
              placeholder="Code from church leadership"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setError(null);
              }}
              className="w-full py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              6-digit authenticator code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={authenticatorCode}
              onChange={(e) => {
                setAuthenticatorCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              className="w-full text-center font-mono text-xl tracking-widest py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded text-center leading-relaxed">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 text-xs font-semibold text-white rounded-lg shadow-sm disabled:opacity-60"
              style={{ backgroundColor: '#4A0404' }}
            >
              {submitting ? 'Verifying…' : 'Unlock Staff Portal'}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="h-3.5 w-3.5" style={{ color: '#D4AF37' }} />
          <span>Invite codes are verified on the server — not stored in the browser</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Need access? Contact stewardship leadership for an invite</span>
        </div>
      </div>
    </div>
  );
};
