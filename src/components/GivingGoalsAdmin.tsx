import React, { useCallback, useEffect, useState } from 'react';
import {
  createAdminFund,
  createAdminOfflineGift,
  fetchAdminFunds,
  fetchAdminGivingGoals,
  fetchAdminOfflineGifts,
  deactivateStaffAccount,
  fetchStaffAccounts,
  inviteStaffMember,
  resetStaffAuthenticator,
  patchAdminFund,
  patchStaffAccountRole,
  putAdminGivingGoal,
} from '../lib/api';
import { useChurch } from '../context/ChurchContext';

type ProgressRow = {
  fundId: string;
  fundName: string;
  year: number;
  goalAmount: number | null;
  totalReceived: number;
  percent: number | null;
};

type FundRow = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  code: string;
  glCode: string;
};

/**
 * Admin-only: annual giving goals, offline cash/check totals, fund list, staff roles.
 */
export const GivingGoalsAdmin: React.FC = () => {
  const { addNotification, staffPortalRole } = useChurch();
  const year = new Date().getFullYear();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [offline, setOffline] = useState<
    Array<{ id: string; fundId: string; amount: number; giftDate: string; enteredBy: string; note: string }>
  >([]);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; role: 'admin' | 'staff'; active: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [offlineForm, setOfflineForm] = useState({
    fundId: '',
    amount: '',
    giftDate: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [newFundName, setNewFundName] = useState('');
  const [newFundDesc, setNewFundDesc] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [g, f, o, a] = await Promise.all([
        fetchAdminGivingGoals(year),
        fetchAdminFunds(),
        fetchAdminOfflineGifts(year),
        fetchStaffAccounts(),
      ]);
      setProgress(g.progress || []);
      setFunds(f);
      setOffline(o);
      setAccounts(a);
      setGoalDrafts(
        Object.fromEntries(
          (g.progress || []).map((p) => [
            p.fundId,
            p.goalAmount != null ? String(p.goalAmount) : '',
          ])
        )
      );
      if (!offlineForm.fundId && f[0]) {
        setOfflineForm((prev) => ({ ...prev, fundId: f[0].id }));
      }
    } catch (err) {
      addNotification(
        'error',
        'Giving Goals',
        err instanceof Error ? err.message : 'Could not load admin goals.'
      );
    } finally {
      setLoading(false);
    }
  }, [addNotification, offlineForm.fundId, year]);

  useEffect(() => {
    if (staffPortalRole !== 'admin') return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffPortalRole]);

  if (staffPortalRole !== 'admin') {
    return (
      <div className="mt-10 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-600">
        Giving Goals are available to administrators only.
      </div>
    );
  }

  const saveGoal = async (fundId: string) => {
    const raw = goalDrafts[fundId]?.trim();
    const goalAmount = raw === '' ? null : Number(raw);
    try {
      await putAdminGivingGoal({ fundId, year, goalAmount });
      addNotification('success', 'Goal saved', `Updated ${year} goal.`);
      await reload();
    } catch (err) {
      addNotification('error', 'Goal save failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const submitOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(offlineForm.amount);
    if (!offlineForm.fundId || !Number.isFinite(amount) || amount <= 0) {
      addNotification('error', 'Offline gift', 'Enter a fund and a positive amount.');
      return;
    }
    try {
      await createAdminOfflineGift({
        fundId: offlineForm.fundId,
        amount,
        giftDate: offlineForm.giftDate,
        note: offlineForm.note,
      });
      addNotification('success', 'Offline gift recorded', 'Cash/check total added for goal tracking.');
      setOfflineForm((prev) => ({ ...prev, amount: '', note: '' }));
      await reload();
    } catch (err) {
      addNotification('error', 'Offline gift failed', err instanceof Error ? err.message : 'Error');
    }
  };

  const addFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFundName.trim()) return;
    try {
      await createAdminFund({
        name: newFundName.trim(),
        description: newFundDesc.trim(),
        active: true,
        sortOrder: funds.length,
      });
      setNewFundName('');
      setNewFundDesc('');
      addNotification('success', 'Fund created', 'New fund is available for giving when active.');
      await reload();
    } catch (err) {
      addNotification('error', 'Fund create failed', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="mt-10 space-y-10">
      <div>
        <h2 className="font-serif-display text-2xl font-semibold text-slate-900 dark:text-white">
          Giving Goals
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Internal {year} progress by fund. Totals include completed online gifts plus offline cash/check
          entries. Pending, failed, and refunded gifts are excluded. No donor counts or averages.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {progress.map((row) => (
            <div
              key={row.fundId}
              className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">{row.fundName}</h3>
                <p className="font-mono text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  Received ${row.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {row.goalAmount != null ? (
                    <>
                      {' '}
                      / Goal ${row.goalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {row.percent != null ? ` (${row.percent}%)` : ''}
                    </>
                  ) : (
                    <span className="text-slate-400"> · No goal set</span>
                  )}
                </p>
              </div>
              {row.goalAmount != null && row.goalAmount > 0 ? (
                <div className="h-1.5 w-full bg-[#E8E2D9] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-church-burgundy dark:bg-church-gold rounded-full"
                    style={{ width: `${Math.min(100, row.percent || 0)}%` }}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-500">
                  Annual goal ($)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 block w-40 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
                    value={goalDrafts[row.fundId] ?? ''}
                    onChange={(e) =>
                      setGoalDrafts((prev) => ({ ...prev, [row.fundId]: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveGoal(row.fundId)}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: '#4A0404' }}
                >
                  Save goal
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-semibold">Record offline gift (cash / check)</h3>
        <p className="text-xs text-slate-500">
          Use for totals that are not already logged as individual Contribution Log donations (avoid double
          counting).
        </p>
        <form onSubmit={submitOffline} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <label className="text-xs text-slate-500">
            Fund
            <select
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
              value={offlineForm.fundId}
              onChange={(e) => setOfflineForm((p) => ({ ...p, fundId: e.target.value }))}
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Amount
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
              value={offlineForm.amount}
              onChange={(e) => setOfflineForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </label>
          <label className="text-xs text-slate-500">
            Date
            <input
              type="date"
              required
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
              value={offlineForm.giftDate}
              onChange={(e) => setOfflineForm((p) => ({ ...p, giftDate: e.target.value }))}
            />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
            Note
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
              value={offlineForm.note}
              onChange={(e) => setOfflineForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: '#4A0404' }}
            >
              Record offline gift
            </button>
          </div>
        </form>
        {offline.length > 0 ? (
          <ul className="text-xs text-slate-600 dark:text-slate-300 divide-y divide-slate-200 dark:divide-slate-800">
            {offline.slice(0, 20).map((g) => (
              <li key={g.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span>
                  {g.giftDate} · {funds.find((f) => f.id === g.fundId)?.name || g.fundId} · {g.enteredBy}
                  {g.note ? ` — ${g.note}` : ''}
                </span>
                <span className="font-mono">${g.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-semibold">Manage funds</h3>
        <p className="text-xs text-slate-500">
          Active funds appear on the Give form. With one active fund, designation is hidden.
        </p>
        <ul className="space-y-2 text-sm">
          {funds.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-white">{f.name}</p>
                <p className="text-xs text-slate-500">{f.description || '—'}</p>
                <label className="mt-2 block text-xs text-slate-500">
                  GL code (optional)
                  <input
                    type="text"
                    className="mt-1 block w-40 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm font-mono"
                    defaultValue={f.glCode || ''}
                    placeholder="Leave blank"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === (f.glCode || '')) return;
                      void patchAdminFund(f.id, { glCode: next })
                        .then(() => reload())
                        .catch((err) =>
                          addNotification(
                            'error',
                            'Fund update',
                            err instanceof Error ? err.message : 'Error'
                          )
                        );
                    }}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={f.active}
                  onChange={(e) => {
                    void patchAdminFund(f.id, { active: e.target.checked })
                      .then(() => reload())
                      .catch((err) =>
                        addNotification(
                          'error',
                          'Fund update',
                          err instanceof Error ? err.message : 'Error'
                        )
                      );
                  }}
                />
                Active
              </label>
            </li>
          ))}
        </ul>
        <form onSubmit={addFund} className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-slate-500">
            New fund name
            <input
              className="mt-1 block w-56 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
              value={newFundName}
              onChange={(e) => setNewFundName(e.target.value)}
              required
            />
          </label>
          <label className="text-xs text-slate-500">
            Short description
            <input
              className="mt-1 block w-64 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
              value={newFundDesc}
              onChange={(e) => setNewFundDesc(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-md px-3 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: '#4A0404' }}
          >
            Add fund
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-semibold">Staff accounts</h3>
        <p className="text-xs text-slate-500">
          Invite by email. The link expires in 72 hours and works once. Role changes and deactivation are audit-logged.
        </p>
        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = String(new FormData(form).get('email') || '');
            const role = String(new FormData(form).get('role') || 'staff') as 'admin' | 'staff';
            void inviteStaffMember(email, role)
              .then((result) => {
                addNotification('success', 'Invite emailed', `A ${role} invitation was sent to ${email}.`);
                form.reset();
                return reload();
              })
              .catch((err) => addNotification('error', 'Invite failed', err instanceof Error ? err.message : 'Error'));
          }}
        >
          <input name="email" type="email" required placeholder="name@church.org" className="rounded-md border border-slate-200 px-2 py-2 text-sm" />
          <select name="role" className="rounded-md border border-slate-200 px-2 py-2 text-xs">
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="rounded-md px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: '#4A0404' }}>
            Invite
          </button>
        </form>
        <ul className="space-y-2 text-sm">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <span>
                {a.label}{' '}
                <span className="text-xs text-slate-400 font-mono">({a.id})</span>
              </span>
              {a.active && (
                <button
                  type="button"
                  className="text-[11px] text-slate-600 underline"
                  onClick={() => {
                    void resetStaffAuthenticator(a.id)
                      .then(() => addNotification('success', 'Authenticator reset', a.label))
                      .catch((err) =>
                        addNotification('error', 'Could not reset authenticator', err instanceof Error ? err.message : 'Error')
                      );
                  }}
                >
                  Reset authenticator
                </button>
              )}
              {a.active && (
                <button
                  type="button"
                  className="text-[11px] text-red-700 underline"
                  onClick={() => {
                    void deactivateStaffAccount(a.id)
                      .then(() => {
                        addNotification('success', 'Account deactivated', a.label);
                        return reload();
                      })
                      .catch((err) =>
                        addNotification('error', 'Could not deactivate', err instanceof Error ? err.message : 'Error')
                      );
                  }}
                >
                  Deactivate
                </button>
              )}
              <select
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                value={a.role}
                onChange={(e) => {
                  const role = e.target.value as 'admin' | 'staff';
                  void patchStaffAccountRole(a.id, role)
                    .then(() => {
                      addNotification('success', 'Role updated', `${a.label} → ${role}`);
                      return reload();
                    })
                    .catch((err) =>
                      addNotification(
                        'error',
                        'Role update failed',
                        err instanceof Error ? err.message : 'Error'
                      )
                    );
                }}
              >
                <option value="admin">admin</option>
                <option value="staff">staff</option>
              </select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
