/**
 * Move RSVP gifts that landed in the wrong fund into their event's fund.
 *
 * Until Oct 29, 2026 the Give page matched an RSVP link's fund before the church's fund list
 * had loaded, so RSVP gifts were filed under Tithes & Offerings. The Vault calls this (signed)
 * with an event's fund name and its RSVP references; gifts not yet in DCB are moved, gifts
 * DCB already has are only reported, so Finance can correct them there.
 */
import { getPgPool } from '../auth/pgPool';
import { findFundByIdOrName, listAllFunds } from './store';

export type RsvpGiftRepairResult = {
  fundFound: boolean;
  fundName: string | null;
  /** Gifts moved into the event's fund (not yet in DCB). */
  moved: number;
  /** Gifts DCB already recorded under another fund: fix those in DCB. */
  alreadyInDcb: Array<{ receiptOrMemo: string; amount: number; fundName: string }>;
};

const RSVP_REF = /^rsvp:[0-9a-f-]{36}$/i;

export async function repairRsvpGiftFunds(input: { eventFund: unknown; refs: unknown }): Promise<RsvpGiftRepairResult> {
  const refs = (Array.isArray(input.refs) ? input.refs : [])
    .map((r) => String(r || '').trim().toLowerCase())
    .filter((r) => RSVP_REF.test(r))
    .slice(0, 200);
  const all = await listAllFunds();
  const fund = findFundByIdOrName(
    all.filter((f) => f.isEvent && f.active),
    String(input.eventFund || '')
  );
  const empty: RsvpGiftRepairResult = { fundFound: Boolean(fund), fundName: fund?.name || null, moved: 0, alreadyInDcb: [] };
  const pool = getPgPool();
  if (!fund || !refs.length || !pool) return empty;

  const client = await pool.connect();
  try {
    let moved = 0;
    const alreadyInDcb: RsvpGiftRepairResult['alreadyInDcb'] = [];

    // Zelle / Cash App / Venmo still waiting for Finance: nothing has gone to DCB yet.
    const pending = await client.query(
      `UPDATE manual_gifts
          SET fund_id = $1, fund_name = $2, fund_code = $3, updated_at = NOW()
        WHERE lower(external_ref) = ANY($4::text[])
          AND fund_id <> $1
          AND status IN ('initiated', 'submitted')
        RETURNING id`,
      [fund.id, fund.name, fund.glCode || '', refs]
    );
    moved += pending.rowCount ?? 0;

    // Recorded gifts (card / bank, or manual gifts Finance verified): move them unless DCB
    // already has them. The outbox worker sends the donation's current fund to DCB.
    const recorded = await client.query(
      `SELECT d.id, d.receipt_number, d.amount, d.fund_name,
              EXISTS (SELECT 1 FROM dcb_outbox o WHERE o.donation_id = d.id AND o.status = 'sent') AS in_dcb
         FROM donations d
        WHERE d.fund_id <> $1
          AND (
            d.transaction_id IN (SELECT transaction_id FROM gift_external_refs WHERE lower(external_ref) = ANY($2::text[]))
            OR d.id IN (SELECT donation_id FROM manual_gifts WHERE donation_id IS NOT NULL AND lower(external_ref) = ANY($2::text[]))
          )`,
      [fund.id, refs]
    );
    for (const row of recorded.rows) {
      if (row.in_dcb) {
        alreadyInDcb.push({
          receiptOrMemo: String(row.receipt_number || row.id),
          amount: Number(row.amount || 0),
          fundName: String(row.fund_name || ''),
        });
        continue;
      }
      // Only while DCB still doesn't have it (the worker could send it in between).
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE donations SET fund_id = $1, fund_name = $2, fund_code = $3
          WHERE id = $4
            AND NOT EXISTS (SELECT 1 FROM dcb_outbox o WHERE o.donation_id = $4 AND o.status = 'sent')`,
        [fund.id, fund.name, fund.glCode || '', row.id]
      );
      if (upd.rowCount) {
        await client.query(
          `UPDATE manual_gifts SET fund_id = $1, fund_name = $2, fund_code = $3, updated_at = NOW() WHERE donation_id = $4`,
          [fund.id, fund.name, fund.glCode || '', row.id]
        );
        moved++;
      }
      await client.query('COMMIT');
    }

    return { fundFound: true, fundName: fund.name, moved, alreadyInDcb };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
