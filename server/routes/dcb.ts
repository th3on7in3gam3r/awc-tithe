/**
 * server/routes/dcb.ts
 *
 * Admin-only DCB outbox management endpoints.
 *
 * NOTE: POST /api/dcb/sync has been removed. Client-supplied contribution
 * data is never accepted — all DCB delivery goes through the outbox worker
 * which builds payloads from the database only.
 */

import { Router, type Request, type Response } from 'express';
import { requireAdminSession, getStaffSessionOrNull } from '../auth/staffGate';
import { writeActivityAudit } from '../audit/activity';
import { clientIp } from '../middleware/rateLimit';
import {
  getOutboxRowById,
  listFailedAndNeedsReview,
  requeueOutboxRow,
} from '../dcb/outbox';

const router = Router();

/**
 * GET /api/dcb/outbox
 * Admin-only: list failed and needs_review outbox rows joined to donation data.
 */
router.get('/outbox', requireAdminSession, async (_req: Request, res: Response) => {
  try {
    const rows = await listFailedAndNeedsReview(200);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error('[dcb] list outbox', err);
    return res.status(500).json({
      ok: false,
      error: 'OUTBOX_LIST_FAILED',
      message: 'Failed to list outbox',
    });
  }
});

/**
 * POST /api/dcb/outbox/:id/retry
 * Admin-only: re-queue an existing outbox row for immediate retry.
 * Payload is NEVER accepted from the client — it is rebuilt from the database.
 */
router.post('/outbox/:id/retry', requireAdminSession, async (req: Request, res: Response) => {
  const actor = getStaffSessionOrNull(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'STAFF_AUTH_REQUIRED' });

  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'MISSING_ID' });

  try {
    // Verify the row exists before requeuing
    const existing = await getOutboxRowById(id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'OUTBOX_ROW_NOT_FOUND' });
    }

    const { found } = await requeueOutboxRow(id);
    if (!found) {
      return res.status(404).json({ ok: false, error: 'OUTBOX_ROW_NOT_FOUND' });
    }

    // Audit log who triggered the retry
    await writeActivityAudit({
      actorId: actor.userId,
      actorLabel: actor.email,
      actorRole: actor.role,
      action: 'DCB_OUTBOX_RETRY',
      resource: id,
      details: JSON.stringify({
        donationId: existing.donationId,
        eventType: existing.eventType,
        previousStatus: existing.status,
        previousAttempts: existing.attempts,
      }),
      ipAddress: clientIp(req),
    });

    return res.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry failed';
    if (message === 'DONATION_NOT_FOUND') {
      return res.status(409).json({
        ok: false,
        error: 'DONATION_NOT_FOUND',
        message: 'Retry payload is built from the donation row, which was not found.',
      });
    }
    console.error('[dcb] outbox retry', err);
    return res.status(500).json({
      ok: false,
      error: 'OUTBOX_RETRY_FAILED',
      message: 'Retry failed',
    });
  }
});

export default router;
