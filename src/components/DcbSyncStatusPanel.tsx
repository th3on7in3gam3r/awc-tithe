import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDcbOutbox,
  retryDcbOutboxRow,
  type DcbOutboxRow,
  type DcbOutboxStatus,
} from '../lib/api';
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  RotateCcw,
  Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<DcbOutboxStatus, string> = {
  pending: 'bg-amber-50 text-amber-900 border-amber-200',
  sent: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  failed: 'bg-red-50 text-red-800 border-red-200',
  needs_review: 'bg-purple-50 text-purple-800 border-purple-200',
};

const STATUS_LABELS: Record<DcbOutboxStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  failed: 'Failed',
  needs_review: 'Needs Review',
};

function StatusBadge({ status }: { status: DcbOutboxStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface RowProps {
  row: DcbOutboxRow;
  onRetry: (id: string) => Promise<void>;
  retrying: boolean;
}

function OutboxRow({ row, onRetry, retrying }: RowProps) {
  const isRefund = row.eventType === 'refund';
  const canRetry = !isRefund && (row.status === 'failed' || row.status === 'needs_review');

  return (
    <tr className="border-b border-[#E8E2D9] dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-900/60 transition-colors">
      {/* Donor */}
      <td className="px-3 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
        {row.donorName || '—'}
      </td>
      {/* Amount */}
      <td className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
        {formatCurrency(row.amount)}
      </td>
      {/* Date */}
      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {formatDate(row.timestamp)}
      </td>
      {/* Fund */}
      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-[140px] truncate">
        {row.fundName || '—'}
      </td>
      {/* Type */}
      <td className="px-3 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {row.eventType}
        </span>
      </td>
      {/* Status */}
      <td className="px-3 py-3">
        <StatusBadge status={row.status} />
      </td>
      {/* Attempts */}
      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums text-center">
        {row.attempts}
      </td>
      {/* Error */}
      <td className="px-3 py-3 text-xs text-red-600 dark:text-red-400 max-w-[220px]">
        {row.lastError ? (
          <span title={row.lastError} className="line-clamp-2 break-words">
            {row.lastError.slice(0, 120)}
            {row.lastError.length > 120 ? '…' : ''}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      {/* Action */}
      <td className="px-3 py-3 text-right">
        {canRetry ? (
          <button
            type="button"
            disabled={retrying}
            onClick={() => void onRetry(row.id)}
            className="inline-flex items-center gap-1 rounded-md border border-[#E8E2D9] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-church-burgundy/40 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
        ) : isRefund ? (
          <span
            title="No DCB refund endpoint yet — see docs/dcb-refund-endpoint.md"
            className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400"
          >
            <Info className="h-3 w-3" />
            Manual
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000;

export const DcbSyncStatusPanel: React.FC = () => {
  const [rows, setRows] = useState<DcbOutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await fetchDcbOutbox();
      setRows(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load outbox');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [load]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await retryDcbOutboxRow(id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const reviewCount = rows.filter((r) => r.status === 'needs_review').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-xl font-semibold text-slate-900 dark:text-white">
            DCB Sync Status
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
            Failed and needs-review rows from the DCB outbox. The background
            worker retries failed rows automatically with exponential backoff.
            Use <strong>Retry</strong> to re-queue a row immediately.
            Needs-review refund rows require manual reconciliation in DCB
            until a refund endpoint is available.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastRefresh && (
            <span className="text-[10px] text-slate-400">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E8E2D9] bg-white text-slate-700 hover:border-church-burgundy/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {(failedCount > 0 || reviewCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" />
              {failedCount} failed
            </span>
          )}
          {reviewCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-semibold text-purple-700">
              <Info className="h-3 w-3" />
              {reviewCount} needs review
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E8E2D9] dark:border-slate-800 bg-[#FFFCF8] dark:bg-slate-900 px-8 py-14 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No failed or pending-review DCB rows
          </p>
          <p className="mt-1 text-xs text-slate-400">
            All contributions have been delivered to DCB, or none have been
            attempted yet.
          </p>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#E8E2D9] dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-[#FFFCF8] dark:bg-slate-900">
              <tr className="border-b border-[#E8E2D9] dark:border-slate-800">
                {[
                  'Donor',
                  'Amount',
                  'Date',
                  'Fund',
                  'Type',
                  'Status',
                  'Tries',
                  'Last Error',
                  '',
                ].map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-950">
              {rows.map((row) => (
                <OutboxRow
                  key={row.id}
                  row={row}
                  onRetry={handleRetry}
                  retrying={retryingId === row.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Refreshes automatically every 30 seconds. Refund rows (needs-review) cannot
        be auto-retried until DCB ships a refund endpoint — see{' '}
        <code className="font-mono">docs/dcb-refund-endpoint.md</code>.
      </p>
    </div>
  );
};
