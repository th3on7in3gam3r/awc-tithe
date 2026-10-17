import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Plus, RefreshCw, XCircle } from 'lucide-react';
import {
  fetchAdminManualGifts,
  recordAdminManualGift,
  rejectAdminManualGift,
  verifyAdminManualGift,
  type AdminManualGift,
  type ManualProvider,
} from '../lib/api';
import { useChurch } from '../context/ChurchContext';

const PROVIDER: Record<ManualProvider, string> = { zelle: 'Zelle', venmo: 'Venmo', cash_app: 'Cash App' };

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const field =
  'w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-church-burgundy dark:border-slate-700 dark:bg-slate-800 dark:text-white';
const label = 'mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300';

function StatusPill({ gift }: { gift: AdminManualGift }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold';
  switch (gift.status) {
    case 'submitted':
      return (
        <span className={`${base} bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200`}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Donor says sent
        </span>
      );
    case 'initiated':
      return (
        <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Started, not marked sent
        </span>
      );
    case 'verified':
      return (
        <span className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200`}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Verified
        </span>
      );
    default:
      return (
        <span className={`${base} bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200`}>
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Not found
        </span>
      );
  }
}

function GiftRow({
  gift,
  canDecide,
  onChanged,
}: {
  gift: AdminManualGift;
  canDecide: boolean;
  onChanged: (g: AdminManualGift, message: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'verify' | 'reject'>('idle');
  const [reference, setReference] = useState(gift.donorReference || '');
  const [amount, setAmount] = useState(String(gift.amount));
  const [date, setDate] = useState(todayLocal());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = gift.status === 'initiated' || gift.status === 'submitted';

  const run = async (fn: () => Promise<AdminManualGift>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await fn();
      setMode('idle');
      onChanged(updated, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-[#E8E2D9] bg-[#FFFCF8] p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold tracking-wider text-slate-900 dark:text-white">{gift.memoCode}</span>
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{PROVIDER[gift.provider]}</span>
            <StatusPill gift={gift} />
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-200">
            {gift.donorName}
            {gift.isAnonymous ? ' (anonymous in bulletins)' : ''} · <span className="text-slate-500">{gift.donorEmailMasked}</span>
          </p>
          <p className="text-xs text-slate-500">
            {gift.fundName} · started {when(gift.createdAt)}
            {gift.submittedAt ? ` · marked sent ${when(gift.submittedAt)}` : ''}
            {gift.donorReference ? ` · donor's confirmation: ${gift.donorReference}` : ''}
          </p>
          {gift.status === 'verified' ? (
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              {money(gift.receivedAmount ?? gift.amount)} received {gift.receivedOn} · ID {gift.providerTransactionId} · by{' '}
              {gift.verifiedBy}
            </p>
          ) : null}
          {gift.status === 'rejected' ? (
            <p className="text-xs text-red-800 dark:text-red-300">
              {gift.rejectionReason} · by {gift.verifiedBy}
            </p>
          ) : null}
        </div>
        <span className="font-serif-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">{money(gift.amount)}</span>
      </div>

      {open && canDecide && mode === 'idle' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('verify')}
            className="min-h-10 rounded-lg bg-church-burgundy px-4 text-xs font-semibold text-white hover:bg-church-burgundy-light"
          >
            Payment received…
          </button>
          <button
            type="button"
            onClick={() => setMode('reject')}
            className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Can't find it…
          </button>
        </div>
      ) : null}

      {mode === 'verify' ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[#E8E2D9] pt-4 dark:border-slate-800 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => verifyAdminManualGift(gift.id, { providerTransactionId: reference, receivedAmount: Number(amount), receivedOn: date }),
              `${gift.memoCode} verified. Receipt sent and queued for DCB.`
            );
          }}
        >
          <div className="sm:col-span-3">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Find the payment in the church's {PROVIDER[gift.provider]} history (look for memo{' '}
              <strong className="font-mono">{gift.memoCode}</strong>) and copy its transaction or confirmation ID. Each ID can
              only be used once.
            </p>
          </div>
          <div>
            <label className={label} htmlFor={`ref-${gift.id}`}>Transaction ID</label>
            <input id={`ref-${gift.id}`} className={field} value={reference} onChange={(e) => setReference(e.target.value)} required />
          </div>
          <div>
            <label className={label} htmlFor={`amt-${gift.id}`}>Amount received</label>
            <input id={`amt-${gift.id}`} className={field} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className={label} htmlFor={`date-${gift.id}`}>Date received</label>
            <input id={`date-${gift.id}`} className={field} type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {busy ? 'Saving…' : 'Confirm received'}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'reject' ? (
        <form
          className="mt-4 space-y-3 border-t border-[#E8E2D9] pt-4 dark:border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => rejectAdminManualGift(gift.id, reason), `${gift.memoCode} marked as not found.`);
          }}
        >
          <div>
            <label className={label} htmlFor={`reason-${gift.id}`}>Reason (the donor sees "Not found · contact Finance")</label>
            <input
              id={`reason-${gift.id}`}
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. No matching payment after 7 days"
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-red-700 px-4 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60">
              {busy ? 'Saving…' : 'Mark not found'}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </li>
  );
}

function RecordForm({ onDone }: { onDone: (g: AdminManualGift, message: string) => void }) {
  const { funds } = useChurch();
  const [provider, setProvider] = useState<ManualProvider>('zelle');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [fundId, setFundId] = useState(funds.find((f) => f.active)?.id || funds[0]?.id || 'fund-tithes');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-xl border border-[#E8E2D9] bg-[#FFFCF8] p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void recordAdminManualGift({
          provider,
          fundId,
          donorName,
          donorEmail,
          providerTransactionId: reference,
          receivedAmount: Number(amount),
          receivedOn: date,
        })
          .then((g) => {
            onDone(g, `${PROVIDER[provider]} payment from ${donorName} recorded. Receipt sent and queued for DCB.`);
            setDonorName('');
            setDonorEmail('');
            setAmount('');
            setReference('');
          })
          .catch((err) => setError(err instanceof Error ? err.message : 'Could not record this payment.'))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:col-span-2">
        For a Zelle, Venmo, or Cash App payment that arrived without going through the giving page. It's recorded as
        verified right away, so only use it after you see the money in the account.
      </p>
      <div>
        <label className={label} htmlFor="rec-provider">Received through</label>
        <select id="rec-provider" className={field} value={provider} onChange={(e) => setProvider(e.target.value as ManualProvider)}>
          <option value="zelle">Zelle</option>
          <option value="venmo">Venmo</option>
          <option value="cash_app">Cash App ($cashtag)</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="rec-fund">Fund</label>
        <select id="rec-fund" className={field} value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {funds.filter((f) => f.active).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="rec-name">Donor name</label>
        <input id="rec-name" className={field} value={donorName} onChange={(e) => setDonorName(e.target.value)} required />
      </div>
      <div>
        <label className={label} htmlFor="rec-email">Donor email (for the receipt)</label>
        <input id="rec-email" className={field} type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} required />
      </div>
      <div>
        <label className={label} htmlFor="rec-amount">Amount received</label>
        <input id="rec-amount" className={field} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className={label} htmlFor="rec-date">Date received</label>
        <input id="rec-date" className={field} type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="rec-ref">Transaction ID</label>
        <input id="rec-ref" className={field} value={reference} onChange={(e) => setReference(e.target.value)} required />
      </div>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200 sm:col-span-2" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-church-burgundy px-4 text-xs font-semibold text-white hover:bg-church-burgundy-light disabled:opacity-60">
          {busy ? 'Saving…' : 'Record verified payment'}
        </button>
      </div>
    </form>
  );
}

export const ManualGiftsPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [gifts, setGifts] = useState<AdminManualGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGifts(await fetchAdminManualGifts(filter));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChanged = (updated: AdminManualGift, message: string) => {
    setNotice(message);
    setGifts((prev) => {
      const without = prev.filter((g) => g.id !== updated.id);
      const stillShown = filter === 'open' ? updated.status === 'initiated' || updated.status === 'submitted' : true;
      return stillShown ? [updated, ...without] : without;
    });
  };

  const submitted = gifts.filter((g) => g.status === 'submitted').length;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif-display text-lg font-bold text-slate-900 dark:text-white">Verify Zelle &amp; Venmo payments</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            These gifts are never counted until someone here confirms the money arrived. Match each memo code to the
            church's Zelle or Venmo history, then enter the payment's transaction ID. Verified gifts get a receipt and go
            to DCB automatically.
            {!isAdmin ? ' Only administrators can verify or reject.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Show">
            {(['open', 'closed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-md px-3 text-xs font-semibold ${
                  filter === f ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {f === 'open' ? 'To check' : 'Done'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowRecord((v) => !v)}
              aria-expanded={showRecord}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-church-burgundy px-3 text-xs font-semibold text-church-burgundy hover:bg-church-burgundy hover:text-white dark:border-church-gold dark:text-church-gold"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Record a payment
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {showRecord && isAdmin ? <RecordForm onDone={(g, m) => { setShowRecord(false); handleChanged(g, m); }} /> : null}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>
      ) : null}

      {filter === 'open' && !loading && gifts.length > 0 ? (
        <p className="text-xs text-slate-500">
          {submitted} marked sent by the donor · {gifts.length - submitted} started but not marked sent
        </p>
      ) : null}

      {!loading && gifts.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-[#E8E2D9] p-8 text-center text-sm text-slate-500 dark:border-slate-800">
          {filter === 'open' ? 'Nothing waiting. All Zelle and Venmo gifts are checked.' : 'No verified or rejected payments yet.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {gifts.map((g) => (
            <GiftRow key={g.id} gift={g} canDecide={isAdmin} onChanged={handleChanged} />
          ))}
        </ul>
      )}
    </div>
  );
};
