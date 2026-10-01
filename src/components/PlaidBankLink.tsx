import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Building2, CheckCircle2, Landmark } from 'lucide-react';
import { createPlaidLinkToken, createPlaidTransfer, exchangePlaidPublicToken } from '../lib/api';

interface PlaidBankLinkProps {
  amount: number;
  feeAmount: number;
  donorName: string;
  donorEmail: string;
  fundCode: string;
  fundName: string;
  onSuccess: (result: {
    transferId: string;
    institutionName: string;
    accountMask: string;
    voucherNumber: string;
    awcSynced: boolean;
  }) => void;
  onError: (message: string) => void;
}

export const PlaidBankLink: React.FC<PlaidBankLinkProps> = ({
  amount,
  feeAmount,
  donorName,
  donorEmail,
  fundCode,
  fundName,
  onSuccess,
  onError,
}) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linked, setLinked] = useState<{
    accessTokenKey: string;
    institutionName: string;
    accountMask: string;
    accountId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { linkToken: token } = await createPlaidLinkToken(donorEmail, donorName);
        if (!cancelled) setLinkToken(token);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Could not start Plaid Link.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [donorEmail, donorName, onError]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const exchanged = await exchangePlaidPublicToken(publicToken, donorEmail);
        setLinked({
          accessTokenKey: exchanged.accessTokenKey,
          institutionName: exchanged.institutionName,
          accountMask: exchanged.accountMask,
          accountId: exchanged.accountId,
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Bank link failed.');
      }
    },
    [donorEmail, onError]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  const handleTransfer = async () => {
    if (!linked) return;
    setSubmitting(true);
    try {
      const result = await createPlaidTransfer({
        accessTokenKey: linked.accessTokenKey,
        amount,
        feeAmount,
        donorName,
        donorEmail,
        fundCode,
        fundName,
        accountId: linked.accountId,
        institutionName: linked.institutionName,
        accountMask: linked.accountMask,
      });
      onSuccess(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ACH transfer failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
      <div className="flex items-start gap-3">
        <Landmark className="h-5 w-5 text-church-burgundy dark:text-church-gold mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Pay with bank (Plaid)</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Link your bank securely. ACH contributions settle to the church DCU account and sync to AWC DCB.
          </p>
        </div>
      </div>

      {linked ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            Linked {linked.institutionName} ····{linked.accountMask}
          </span>
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready || !linkToken}
          onClick={() => open()}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <Building2 className="h-4 w-4" />
          {linkToken ? 'Connect bank with Plaid' : 'Loading Plaid…'}
        </button>
      )}

      {linked && (
        <button
          type="button"
          disabled={submitting}
          onClick={handleTransfer}
          className="w-full rounded-xl bg-church-burgundy hover:bg-church-burgundy-light disabled:opacity-60 text-white font-semibold py-3 px-4"
        >
          {submitting ? 'Submitting ACH gift…' : `Give $${amount.toFixed(2)} via ACH`}
        </button>
      )}
    </div>
  );
};
