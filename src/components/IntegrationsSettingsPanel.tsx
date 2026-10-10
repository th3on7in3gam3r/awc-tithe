import React, { useEffect, useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import {
  ApiConfig,
  IntegrationStatus,
  fetchApiConfig,
  patchChurchSettings,
} from '../lib/api';
import {
  CreditCard,
  Database,
  RefreshCw,
} from 'lucide-react';

type BadgeKind = 'live' | 'sandbox' | 'not_configured';

function badgeKind(status: IntegrationStatus | undefined): BadgeKind {
  if (!status || !status.configured) return 'not_configured';
  if (status.mode === 'live') return 'live';
  return 'sandbox';
}

function badgeLabel(kind: BadgeKind): string {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'sandbox':
      return 'Sandbox';
    default:
      return 'Not configured';
  }
}

function Badge({ kind }: { kind: BadgeKind }) {
  const styles: Record<BadgeKind, string> = {
    live: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    sandbox: 'bg-amber-50 text-amber-900 border-amber-200',
    not_configured: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[kind]}`}
    >
      {badgeLabel(kind)}
    </span>
  );
}

function displayValue(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'Not set';
}

interface IntegrationCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: IntegrationStatus | undefined;
  meaning: string;
  envVars: string[];
  note?: string;
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  icon,
  title,
  description,
  status,
  meaning,
  envVars,
  note,
}) => {
  const kind = badgeKind(status);
  return (
    <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'rgba(74, 4, 4, 0.06)', color: '#4A0404' }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-serif-display text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        <Badge kind={kind} />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{meaning}</p>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1.5">
          Required env vars
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {envVars.map((name) => (
            <li
              key={name}
              className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {name}
            </li>
          ))}
        </ul>
        {note ? (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{note}</p>
        ) : null}
      </div>
    </div>
  );
};

function meaningFor(
  key: 'stripe' | 'database',
  status: IntegrationStatus | undefined,
  giftStore?: 'neon' | 'memory'
): string {
  const kind = badgeKind(status);
  if (key === 'stripe') {
    if (kind === 'live') return 'Live Stripe keys are active. Cards, wallets, and US bank accounts settle through Stripe.';
    if (kind === 'sandbox') return 'Test Stripe keys are set. Donors can pay, but charges run in Stripe test mode.';
    return 'Stripe keys are missing. Online giving stays unavailable until keys are added on Render.';
  }
  // database
  if (kind === 'live' || giftStore === 'neon') {
    return 'Neon Postgres is connected. Gift ledger data persists across deploys and restarts.';
  }
  return 'No DATABASE_URL. Gifts use in-memory storage and are lost when the Render service restarts.';
}

export const IntegrationsSettingsPanel: React.FC = () => {
  const { config, staffPortalRole, refreshChurchSettings, addNotification } = useChurch();
  const isAdmin = staffPortalRole === 'admin';
  const [identityDraft, setIdentityDraft] = React.useState({
    legalEntityName: '',
    address: '',
    cityStateZip: '',
    ein: '',
    email: '',
    phone: '',
    website: '',
  });
  const [savingIdentity, setSavingIdentity] = React.useState(false);

  React.useEffect(() => {
    setIdentityDraft({
      legalEntityName: config.legalEntityName || '',
      address: config.address || '',
      cityStateZip: config.cityStateZip || '',
      ein: config.ein || '',
      email: config.email || '',
      phone: config.phone || '',
      website: config.website || '',
    });
  }, [config.legalEntityName, config.address, config.cityStateZip, config.ein, config.email, config.phone, config.website]);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchApiConfig().then((cfg) => {
      setApiConfig(cfg);
      setLoading(false);
      if (!cfg) setError('Could not load integration status. Try refreshing.');
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const integrations = apiConfig?.integrations;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-xl font-semibold text-slate-900 dark:text-white">
            Integrations &amp; Settings
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
            Live status of payment and ledger connections, plus read-only church identity from Render environment variables.
            Secret values are never shown here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E8E2D9] bg-white text-slate-700 hover:border-church-burgundy/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh status
        </button>
      </div>

      {loading && !apiConfig ? (
        <p className="text-xs text-slate-500">Checking integration status…</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IntegrationCard
          icon={<CreditCard className="h-4 w-4" />}
          title="Stripe"
          description="Cards, wallets, and US bank accounts"
          status={integrations?.stripe}
          meaning={meaningFor('stripe', integrations?.stripe)}
          envVars={['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']}
          note="All three are required before online giving and webhook gift writes are enabled."
        />
        <IntegrationCard
          icon={<Database className="h-4 w-4" />}
          title="Database"
          description="Durable gift ledger (Neon Postgres)"
          status={integrations?.database}
          meaning={meaningFor('database', integrations?.database, apiConfig?.giftStore)}
          envVars={['DATABASE_URL']}
          note={
            apiConfig?.giftStore
              ? `Current gift store mode: ${apiConfig.giftStore === 'neon' ? 'Neon' : 'in-memory'}.`
              : undefined
          }
        />
      </div>

      <div className="bg-[#FFFCF8] dark:bg-slate-900 rounded-xl border border-[#E8E2D9] dark:border-slate-800 p-6 shadow-sm">
        <h3 className="font-serif-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
          Church identity
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed max-w-2xl">
          Stored in Neon. Administrators can edit it here. Staff can view it.
        </p>
        {isAdmin ? (
          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6"
            onSubmit={(e) => {
              e.preventDefault();
              setSavingIdentity(true);
              void patchChurchSettings(identityDraft)
                .then(() => refreshChurchSettings())
                .then(() => addNotification('success', 'Church identity saved', 'Updated on the server.'))
                .catch((err) =>
                  addNotification('error', 'Save failed', err instanceof Error ? err.message : 'Error')
                )
                .finally(() => setSavingIdentity(false));
            }}
          >
            {(
              [
                ['legalEntityName', 'Legal name'],
                ['address', 'Address'],
                ['cityStateZip', 'City / State / ZIP'],
                ['ein', 'EIN'],
                ['email', 'Support email'],
                ['phone', 'Phone'],
                ['website', 'Website'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs text-slate-500">
                {label}
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
                  value={identityDraft[key]}
                  onChange={(e) => setIdentityDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingIdentity}
                className="rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: '#4A0404' }}
              >
                {savingIdentity ? 'Saving…' : 'Save church identity'}
              </button>
            </div>
          </form>
        ) : null}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-xs">
          {[
            { label: 'Legal name', value: config.legalEntityName },
            { label: 'Address', value: config.address },
            { label: 'City / State / ZIP', value: config.cityStateZip },
            { label: 'EIN', value: config.ein },
            { label: 'Support email', value: config.email },
            { label: 'Phone', value: config.phone },
            { label: 'Website', value: config.website },
          ].map((row) => (
            <div key={row.label} className="border-b border-[#E8E2D9]/70 dark:border-slate-800 pb-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                {row.label}
              </dt>
              <dd
                className={
                  row.value?.trim()
                    ? 'text-slate-800 dark:text-slate-200 font-medium break-words'
                    : 'text-slate-400 italic'
                }
              >
                {displayValue(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};
