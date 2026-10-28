import React, { useCallback, useEffect, useState } from 'react';
import { deleteAdminFund, fetchAdminFunds, patchAdminFund, type AdminFund } from '../lib/api';
import { useChurch } from '../context/ChurchContext';

const PROTECTED_FUND_ID = 'fund-tithes';

function usageLine(f: AdminFund): string {
  const u = f.usage;
  if (!u || u.total === 0) return 'No gifts yet';
  const parts = [
    u.gifts ? `${u.gifts} online ${u.gifts === 1 ? 'gift' : 'gifts'}` : '',
    u.manualGifts ? `${u.manualGifts} Zelle / Venmo / Cash App` : '',
    u.offlineGifts ? `${u.offlineGifts} in the Contribution Log` : '',
    u.textGive ? `${u.textGive} text-to-give` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Admin-only Funds tab: rename, turn on/off, and delete funds.
 * Delete is only offered for funds that never received a gift, so giving records are never lost.
 */
export const FundsAdmin: React.FC = () => {
  const { addNotification } = useChurch();
  const [funds, setFunds] = useState<AdminFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFunds(await fetchAdminFunds());
    } catch (err) {
      addNotification('error', 'Funds', err instanceof Error ? err.message : 'Could not load funds');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = (title: string, err: unknown) =>
    addNotification('error', title, err instanceof Error ? err.message : 'Something went wrong');

  const startRename = (f: AdminFund) => {
    setRenamingId(f.id);
    setRenameDraft(f.name);
  };

  const saveRename = async (f: AdminFund) => {
    const name = renameDraft.trim();
    if (name.length < 2) {
      addNotification('error', 'Rename fund', 'Fund names need at least 2 characters.');
      return;
    }
    if (name === f.name) {
      setRenamingId(null);
      return;
    }
    if (funds.some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())) {
      addNotification('error', 'Rename fund', 'Another fund already has that name.');
      return;
    }
    setBusyId(f.id);
    try {
      await patchAdminFund(f.id, { name });
      addNotification('success', 'Fund renamed', `${f.name} → ${name}`);
      setRenamingId(null);
      await reload();
    } catch (err) {
      fail('Rename fund', err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (f: AdminFund) => {
    setBusyId(f.id);
    try {
      await patchAdminFund(f.id, { active: !f.active });
      addNotification('success', f.active ? 'Fund turned off' : 'Fund turned on', f.name);
      await reload();
    } catch (err) {
      fail('Update fund', err);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (f: AdminFund) => {
    const ok = window.confirm(
      `Delete "${f.name}" for good?\n\nIt has no gifts, so no giving records are lost. This cannot be undone.`
    );
    if (!ok) return;
    setBusyId(f.id);
    try {
      await deleteAdminFund(f.id);
      addNotification('success', 'Fund deleted', f.name);
      await reload();
    } catch (err) {
      fail('Delete fund', err);
    } finally {
      setBusyId(null);
    }
  };

  const btn =
    'min-h-[40px] rounded-lg px-3.5 text-xs font-semibold border transition-colors disabled:opacity-50';

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 p-6">
        <h3 className="font-serif-display text-lg font-semibold">Funds</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-2xl">
          Rename, turn off, or delete funds. <strong>Turn off</strong> hides a fund from giving but keeps its
          history. <strong>Delete</strong> is only possible when a fund has never received a gift. Tithes &amp;
          Offerings can't be deleted.
        </p>
      </div>

      {loading && funds.length === 0 ? (
        <p className="text-sm text-slate-500 px-1">Loading funds…</p>
      ) : (
        <ul className="space-y-3" data-testid="funds-admin-list">
          {funds.map((f) => {
            const deletable = f.id !== PROTECTED_FUND_ID && (f.usage?.total ?? 0) === 0;
            const busy = busyId === f.id;
            return (
              <li
                key={f.id}
                className="rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-white dark:bg-slate-950 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {renamingId === f.id ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveRename(f);
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="New fund name"
                          className="w-full sm:w-72 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                          value={renameDraft}
                          maxLength={60}
                          onChange={(e) => setRenameDraft(e.target.value)}
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className={`${btn} text-white border-transparent`}
                          style={{ backgroundColor: '#4A0404' }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className={`${btn} border-slate-300 text-slate-600 dark:text-slate-300`}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <p className="font-semibold text-slate-900 dark:text-white break-words">{f.name}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          f.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {f.active ? 'On' : 'Off'}
                      </span>
                      {f.isEvent ? (
                        <span className="rounded-full px-2 py-0.5 font-semibold bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                          Event RSVP fund
                        </span>
                      ) : null}
                      <span className="text-slate-500">{usageLine(f)}</span>
                    </div>
                    {f.isEvent && renamingId === f.id ? (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-200 max-w-xl">
                        The Vault finds event funds by name. After renaming, the event's RSVP Pay Now must use
                        the same name, or the Vault will create a new fund.
                      </p>
                    ) : null}
                  </div>

                  {renamingId !== f.id ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startRename(f)}
                        className={`${btn} border-slate-300 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={busy || f.id === PROTECTED_FUND_ID}
                        title={f.id === PROTECTED_FUND_ID ? 'Tithes & Offerings always stays on' : undefined}
                        onClick={() => void toggleActive(f)}
                        className={`${btn} border-slate-300 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}
                      >
                        {f.active ? 'Turn off' : 'Turn on'}
                      </button>
                      {deletable ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(f)}
                          className={`${btn} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950`}
                          data-testid={`fund-delete-${f.id}`}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FundsAdmin;
