import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { ShieldCheck, Lock, X, KeyRound } from 'lucide-react';

interface MfaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MfaModal: React.FC<MfaModalProps> = ({ isOpen, onClose }) => {
  const { verifyMfa, isMfaVerified } = useChurch();
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const verified = verifyMfa(totpCode);
    if (verified) {
      setError(false);
      setTotpCode('');
      onClose();
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-church-gold/15 text-church-burgundy dark:bg-church-burgundy-dark dark:text-church-gold-light">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">
                Multi-Factor Authentication (MFA)
              </h3>
              <p className="text-[11px] text-slate-500">Time-Based One-Time Password (TOTP)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          Accessing administrative financial controls, donor PII, and ledger modifications requires multi-factor identity verification.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              6-Digit Authenticator Code
            </label>
            <input
              type="text"
              maxLength={6}
              autoFocus
              placeholder="e.g. 123456"
              value={totpCode}
              onChange={(e) => {
                setTotpCode(e.target.value);
                setError(false);
              }}
              className="w-full text-center font-mono text-xl tracking-widest py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-church-gold focus:ring-1 focus:ring-church-gold"
            />
            <p className="text-[10px] text-slate-400 mt-1 text-center">
              (Preview Mode: Enter any 6-digit code, e.g. 123456)
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded text-center">
              Please enter a valid 6-digit verification code.
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm"
            >
              Verify &amp; Unlock
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>FIPS 140-2 Compliant Session Security</span>
        </div>
      </div>
    </div>
  );
};
