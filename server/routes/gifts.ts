import { Router, type Request, type Response } from 'express';
import { listAllGifts, giftStoreMode } from '../gifts/store';
import { getStaffSessionOrNull, requireStaffSession } from '../auth/staffGate';
import { clientIp } from '../middleware/rateLimit';
import { recordStaffOfflineGift } from '../gifts/recordOffline';

const router = Router();

/**
 * Staff Contribution Log — cash/check and other in-person gifts.
 * Stored on offline_gifts only. Donation rows are created by the Stripe webhook.
 */
router.post('/offline', requireStaffSession, async (req: Request, res: Response) => {
  try {
    const actor = getStaffSessionOrNull(req);
    if (!actor) return res.status(401).json({ error: 'STAFF_AUTH_REQUIRED' });
    const body = req.body as Record<string, unknown>;
    const amount = Number(body.amount);
    const donorEmail = String(body.donorEmail || '').trim();
    const donorName = String(body.donorName || '').trim();
    const fundId = String(body.fundId || '').trim();
    const fundName = String(body.fundName || '').trim();
    if (!amount || amount <= 0 || !donorEmail || !fundId || !fundName) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'amount, donorEmail, fundId, and fundName are required',
      });
    }

    const contributedAt = String(body.contributedAt || new Date().toISOString());
    const note = [body.paymentMethod, body.dedication, body.cardBrand].filter(Boolean).join(' · ');
    const recorded = await recordStaffOfflineGift({
      fundId,
      amount,
      giftDate: contributedAt,
      note,
      donorEmail,
      donorName: donorName || 'Anonymous',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      ipAddress: clientIp(req),
    });
    if (!recorded.ok) {
      return res.status(recorded.status).json({ error: recorded.error });
    }

    return res.status(201).json({
      ok: true,
      offline: recorded.gift,
    });
  } catch (err) {
    console.error('[gifts] offline', err);
    return res.status(400).json({
      error: 'OFFLINE_GIFT_FAILED',
      message: 'Failed to record offline gift',
    });
  }
});

/** Staff ledger list — requires session */
router.get('/', requireStaffSession, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 500);
    const result = await listAllGifts(limit);
    return res.json({
      ok: true,
      mode: result.mode,
      store: giftStoreMode(),
      donations: result.donations,
      donors: result.donors,
    });
  } catch (err) {
    console.error('[gifts] list', err);
    return res.status(500).json({
      error: 'GIFT_LIST_FAILED',
      message: 'List failed',
    });
  }
});

export default router;
