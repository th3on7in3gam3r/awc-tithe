import React, { useCallback, useEffect, useState } from 'react';
import {
  addFinanceAlertRecipient,
  fetchFinanceAlerts,
  removeFinanceAlertRecipient,
  type FinanceAlertRecipient,
} from '../lib/api';
import { useChurch } from '../context/ChurchContext';

/**
 * Admin card: who gets Tithe's finance emails ("Check Zelle: … says they sent $50").
 * Admins always get them; people added here get them too, without a Tithe account.
 */
export const FinanceAlertsCard: React.FC = () => {
  const { addNotification } = useChurch();
  const [admins, setAdmins] = useState<string[]>([]);
  const [list, setList] = useState<FinanceAlertRecipient[]>([]);
  const [fromServer, setFromServer] = useState(0);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchFinanceAlerts();
      setAdmins(data.admins || []);
      setList(data.recipients || []);
      setFromServer(Number(data.fromServerSettings) || 0);
    } catch (err) {
      addNotification('error', 'Finance emails', err instanceof Error ? err.message : 'Could not load');
    }
  }, [addNotification]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) {
      addNotification('error', 'Finance emails', 'Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await addFinanceAlertRecipient(clean, name.trim());
      addNotification('success', 'Added', `${clean} will get finance emails.`);
      setEmail('');
      setName('');
      await reload();
    } catch (err) {
      addNotification('error', 'Finance emails', err instanceof Error ? err.message : 'Could not add');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: FinanceAlertRecipient) => {
    if (!window.confirm(`Stop sending finance emails to ${r.name || r.email}?`)) return;
    setBusy(true);
    try {
      await removeFinanceAlertRecipient(r.email);
      addNotification('success', 'Removed', `${r.email} no longer gets finance emails.`);
      await reload();
    } catch (err) {
      addNotification('error', 'Finance emails', err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm';

  return (
    <div
      className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm"
      data-testid="finance-alerts-card"
    >
      <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
        Who gets finance emails
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed max-w-2xl">
        Tithe emails these people when a Zelle, Venmo or Cash App gift needs checking. Admins always get them.
        People added below get them too, without needing a Tithe account. Only admins can verify the gift in Tithe.
      </p>

      <ul className="space-y-2 mb-5">
        {admins.map((a) => (
          <li
            key={`admin-${a}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm"
          >
            <span className="break-all text-slate-800 dark:text-slate-200">{a}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Admin · always</span>
          </li>
        ))}
        {list.map((r) => (
          <li
            key={r.email}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 break-all text-slate-800 dark:text-slate-200">
              {r.name ? <strong className="mr-1.5">{r.name}</strong> : null}
              {r.email}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(r)}
              className="min-h-[40px] rounded-lg border border-red-200 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {fromServer > 0 ? (
        <p className="text-[11px] text-slate-400 mb-4">
          Plus {fromServer} {fromServer === 1 ? 'address' : 'addresses'} set on the server (FINANCE_ALERT_EMAILS).
        </p>
      ) : null}

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs text-slate-500">
          Name (optional)
          <input className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="First Lady" />
        </label>
        <label className="text-xs text-slate-500">
          Email
          <input
            className={input}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: '#4A0404' }}
        >
          Add
        </button>
      </form>
    </div>
  );
};

export default FinanceAlertsCard;
