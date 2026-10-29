/**
 * server/dcb/worker.ts
 *
 * Background outbox worker for AWC-DCB delivery.
 *
 * Design:
 *  - Runs as a setInterval loop inside the Express server process.
 *  - Uses SELECT … FOR UPDATE SKIP LOCKED so multiple Render instances
 *    never process the same row simultaneously.
 *  - Exponential backoff: 1 m → 5 m → 30 m → 2 h → 12 h (max 8 attempts).
 *  - After 8 attempts the row is set to terminal 'failed'.
 *  - 'refund' rows call DCB's void endpoint; DCB opens a Finance review item.
 *  - If AWC_DCB_API_URL or AWC_DCB_KEY_TITHE are missing the row is left
 *    'pending' and the attempt counter is NOT incremented.
 */

import { getPgPool } from '../auth/pgPool';
import {
  claimPendingRows,
  markOutboxSent,
  markOutboxFailed,
  nextAttemptMinutes,
  type DcbOutboxRow,
} from './outbox';
import {
  postContributionToDcb,
  voidContributionInDcb,
  DcbNotConfiguredError,
  type DcbContributionPayload,
  type DcbRefundPayload,
} from './client';
import { externalRefsForDonations } from '../externalRefs/store';
import { withEventFund } from './eventFund';

/**
 * The event fund a gift belongs to, as it is named NOW. A gift made before the event was
 * renamed still points at the same fund id, so it reaches DCB under the new name together
 * with the event id. A lookup failure never blocks delivery.
 */
async function currentEventFund(
  donationId: string,
  fundName: unknown
): Promise<import('../funds/store').FundRecord | null> {
  try {
    const { listAllFunds, getFundById } = await import('../funds/store');
    const pool = getPgPool();
    if (pool && donationId) {
      const r = await pool.query('SELECT fund_id FROM donations WHERE id = $1 LIMIT 1', [donationId]);
      const fundId = r.rows[0]?.fund_id ? String(r.rows[0].fund_id) : '';
      if (fundId) {
        const fund = await getFundById(fundId);
        if (fund) return fund.isEvent ? fund : null;
      }
    }
    const name = String(fundName || '').trim().toLowerCase();
    if (!name) return null;
    const all = await listAllFunds();
    return (
      all.find((f) => f.isEvent && f.name.trim().toLowerCase() === name) ||
      all.find((f) => f.isEvent && (f.formerNames || []).some((n) => n.trim().toLowerCase() === name)) ||
      null
    );
  } catch {
    return null;
  }
}

async function contributionPayloadFor(row: DcbOutboxRow): Promise<DcbContributionPayload> {
  let payload = row.payload as unknown as DcbContributionPayload;
  const eventFund = await currentEventFund(row.donationId, payload.fundName);
  const isEventFund = Boolean(eventFund);
  if (eventFund) {
    payload = {
      ...payload,
      fundName: eventFund.name,
      ...(eventFund.eventKey ? { eventKey: eventFund.eventKey } : {}),
      ...(eventFund.formerNames?.length ? { previousFundNames: eventFund.formerNames } : {}),
    };
  }
  try {
    const refs = await externalRefsForDonations([
      { id: row.donationId, transactionId: String(payload.transactionId || '') },
    ]);
    return withEventFund(payload, refs.get(row.donationId), { isEventFund });
  } catch (err) {
    console.warn('[dcb-worker] event ref lookup failed:', err instanceof Error ? err.message : err);
    return withEventFund(payload, null, { isEventFund });
  }
}

const POLL_INTERVAL_MS = 30_000;   // 30 seconds
const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 5;

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function processRow(row: DcbOutboxRow, client: import('pg').PoolClient): Promise<void> {
  try {
    const result =
      row.eventType === 'refund'
        ? await voidContributionInDcb(row.payload as unknown as DcbRefundPayload)
        : await postContributionToDcb(await contributionPayloadFor(row));
    await markOutboxSent(client, row.id, result.voucherId);
  } catch (err) {
    if (err instanceof DcbNotConfiguredError) {
      // Missing env vars — don't count as a failed attempt, release the lock
      // (ROLLBACK in the outer catch will handle this)
      throw err;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    const newAttempts = row.attempts + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      // Terminal failure — stay 'failed' with no next attempt
      await markOutboxFailed(client, row.id, errorMsg, null);
      console.error(
        `[dcb-worker] row ${row.id} (donation ${row.donationId}) permanently failed after ${newAttempts} attempts: ${errorMsg}`
      );
    } else {
      const delayMinutes = nextAttemptMinutes(row.attempts);
      const nextAttemptAt = addMinutes(delayMinutes);
      await markOutboxFailed(client, row.id, errorMsg, nextAttemptAt);
      console.warn(
        `[dcb-worker] row ${row.id} attempt ${newAttempts}/${MAX_ATTEMPTS} failed, retry in ${delayMinutes}m: ${errorMsg}`
      );
    }
  }
}

async function runWorkerCycle(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    // No database — outbox not available, skip silently
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await claimPendingRows(client, BATCH_SIZE);

    for (const row of rows) {
      try {
        await processRow(row, client);
      } catch (err) {
        if (err instanceof DcbNotConfiguredError) {
          // Release lock without incrementing attempts; ROLLBACK will undo
          // any partial state for this row
          console.warn(`[dcb-worker] ${err.message} — outbox rows stay pending until env vars are set`);
          await client.query('ROLLBACK');
          return; // abort this cycle entirely; nothing useful to do
        }
        // Unexpected error in processRow — log but continue to next row
        console.error('[dcb-worker] unexpected error processing row', row.id, err);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[dcb-worker] cycle error, rolled back', err);
  } finally {
    client.release();
  }
}

/**
 * Start the outbox delivery worker.
 * Call once from server boot. Returns the interval handle so callers
 * can clearInterval in tests.
 */
export function startDcbOutboxWorker(): ReturnType<typeof setInterval> {
  // Run once immediately at boot (after a short delay for the DB pool to warm up)
  setTimeout(() => {
    void runWorkerCycle().catch((err) =>
      console.error('[dcb-worker] initial cycle error', err)
    );
  }, 5_000);

  return setInterval(() => {
    void runWorkerCycle().catch((err) =>
      console.error('[dcb-worker] cycle error', err)
    );
  }, POLL_INTERVAL_MS);
}
