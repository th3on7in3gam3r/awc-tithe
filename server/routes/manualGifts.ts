/**
 * server/routes/manualGifts.ts
 *
 * Zelle / Venmo / Cash App ($cashtag) gifts.
 *
 * Donor routes never mark a gift as received. Only an administrator with
 * verified 2FA can verify one, after matching it to the actual payment.
 */

import { Router, type Request, type Response } from 'express';
import { requireAdminSession, requireStaffSession, getStaffSessionOrNull } from '../auth/staffGate';
import { clientIp, payRateLimitMiddleware } from '../middleware/rateLimit';
import { requireTurnstile, validateMinGiftAmount } from '../middleware/turnstile';
import { publicPaymentOptions } from '../config';
import {
  createManualGift,
  isManualProvider,
  listManualGiftsForAdmin,
  markManualGiftSubmitted,
  recordVerifiedManualGift,
  rejectManualGift,
  verifyManualGift,
  type Actor,
  type AdminFilter,
  type ManualGift,
  type Result,
} from '../manualGifts/store';

const router = Router();

function sendResult<T>(res: Response, result: Result<T>, map: (v: T) => unknown): Response {
  if (!result.ok) {
    return res.status(result.status).json({ ok: false, error: result.error, message: result.message });
  }
  return res.json({ ok: true, ...(map(result.value) as object) });
}

function actorFrom(req: Request): Actor | null {
  const staff = getStaffSessionOrNull(req);
  if (!staff) return null;
  return { userId: staff.userId, email: staff.email, role: staff.role, ipAddress: clientIp(req) };
}

/** What a donor sees — no Finance notes or internal IDs. */
function donorView(gift: ManualGift) {
  return {
    id: gift.id,
    memoCode: gift.memoCode,
    provider: gift.provider,
    status: gift.status,
    amount: gift.amount,
    fundName: gift.fundName,
  };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

function adminView(gift: ManualGift) {
  return {
    id: gift.id,
    memoCode: gift.memoCode,
    provider: gift.provider,
    status: gift.status,
    amount: gift.amount,
    fundName: gift.fundName,
    donorName: gift.donorName,
    donorEmailMasked: maskEmail(gift.donorEmail),
    isAnonymous: gift.isAnonymous,
    donorReference: gift.donorReference,
    providerTransactionId: gift.providerTransactionId,
    receivedAmount: gift.receivedAmount,
    receivedOn: gift.receivedOn,
    verifiedBy: gift.verifiedBy,
    verifiedAt: gift.verifiedAt,
    rejectionReason: gift.rejectionReason,
    createdAt: gift.createdAt,
    submittedAt: gift.submittedAt,
  };
}

// ---------------------------------------------------------------------------
// Donor
// ---------------------------------------------------------------------------

/** POST /api/manual-gifts — start a Zelle/Venmo gift and get a memo code. */
router.post('/', payRateLimitMiddleware, requireTurnstile, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const provider = body.provider;
    const options = publicPaymentOptions();
    const enabled =
      (provider === 'zelle' && options.zelle.enabled) ||
      (provider === 'venmo' && options.venmo.enabled) ||
      (provider === 'cash_app' && options.cashApp.enabled);
    if (!isManualProvider(provider) || !enabled) {
      return res.status(400).json({ ok: false, error: 'PROVIDER_UNAVAILABLE', message: 'That payment method is not available.' });
    }
    const amount = Number(body.amount);
    const min = validateMinGiftAmount(amount);
    if (!min.ok) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_AMOUNT',
        message: `Amount must be at least $${(min.minCents / 100).toFixed(2)}.`,
      });
    }
    const result = await createManualGift({
      provider,
      amount,
      fundId: String(body.fundId || ''),
      donorName: String(body.donorName || ''),
      donorEmail: String(body.donorEmail || ''),
      isAnonymous: body.isAnonymous === true,
    });
    return sendResult(res, result, (v) => ({ gift: donorView(v.gift), claimToken: v.claimToken }));
  } catch (err) {
    console.error('[manual-gifts] create', err);
    return res.status(500).json({ ok: false, error: 'MANUAL_GIFT_FAILED', message: 'Could not start this gift.' });
  }
});

/** POST /api/manual-gifts/:id/sent — donor says they sent it. Stays pending. */
router.post('/:id/sent', payRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await markManualGiftSubmitted({
      id: String(req.params.id || ''),
      claimToken: String(body.claimToken || ''),
      donorReference: typeof body.donorReference === 'string' ? body.donorReference : '',
    });
    return sendResult(res, result, (v) => ({ gift: donorView(v) }));
  } catch (err) {
    console.error('[manual-gifts] sent', err);
    return res.status(500).json({ ok: false, error: 'MANUAL_GIFT_FAILED', message: 'Could not update this gift.' });
  }
});

// ---------------------------------------------------------------------------
// Finance (staff can view; only 2FA-verified admins can verify or reject)
// ---------------------------------------------------------------------------

/** GET /api/manual-gifts/admin?filter=open|closed|all */
router.get('/admin', requireStaffSession, async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.filter || 'open');
    const filter: AdminFilter = raw === 'closed' || raw === 'all' ? raw : 'open';
    const gifts = await listManualGiftsForAdmin(filter);
    return res.json({ ok: true, gifts: gifts.map(adminView) });
  } catch (err) {
    console.error('[manual-gifts] list', err);
    return res.status(500).json({ ok: false, error: 'MANUAL_GIFT_LIST_FAILED', message: 'Could not load gifts.' });
  }
});

/** POST /api/manual-gifts/admin/:id/verify */
router.post('/admin/:id/verify', requireAdminSession, async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  try {
    const body = req.body as Record<string, unknown>;
    const result = await verifyManualGift({
      id: String(req.params.id || ''),
      providerTransactionId: body.providerTransactionId,
      receivedAmount: body.receivedAmount,
      receivedOn: body.receivedOn,
      actor,
    });
    return sendResult(res, result, (v) => ({ gift: adminView(v) }));
  } catch (err) {
    console.error('[manual-gifts] verify', err);
    return res.status(500).json({ ok: false, error: 'VERIFY_FAILED', message: 'Could not verify this gift.' });
  }
});

/** POST /api/manual-gifts/admin/:id/reject */
router.post('/admin/:id/reject', requireAdminSession, async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  try {
    const result = await rejectManualGift({
      id: String(req.params.id || ''),
      reason: (req.body as Record<string, unknown>).reason,
      actor,
    });
    return sendResult(res, result, (v) => ({ gift: adminView(v) }));
  } catch (err) {
    console.error('[manual-gifts] reject', err);
    return res.status(500).json({ ok: false, error: 'REJECT_FAILED', message: 'Could not reject this gift.' });
  }
});

/** POST /api/manual-gifts/admin/record — a payment that arrived without the site. */
router.post('/admin/record', requireAdminSession, async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  try {
    const body = req.body as Record<string, unknown>;
    const result = await recordVerifiedManualGift({
      provider: body.provider,
      fundId: body.fundId,
      donorName: body.donorName,
      donorEmail: body.donorEmail,
      isAnonymous: body.isAnonymous,
      providerTransactionId: body.providerTransactionId,
      receivedAmount: body.receivedAmount,
      receivedOn: body.receivedOn,
      actor,
    });
    return sendResult(res, result, (v) => ({ gift: adminView(v) }));
  } catch (err) {
    console.error('[manual-gifts] record', err);
    return res.status(500).json({ ok: false, error: 'RECORD_FAILED', message: 'Could not record this gift.' });
  }
});

export default router;
