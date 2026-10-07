import { Router, type Request, type Response } from 'express';
import {
  createGift,
  listAllGifts,
  listGiftsByEmail,
  type CreateGiftInput,
  type GiftFrequency,
  type GiftPaymentMethod,
  giftStoreMode,
} from '../gifts/store';
import { env } from '../config';
import { buildVoucherNumber, postContributionToDcb } from '../dcb/client';
import { dcbDonorDisplayName } from '../dcb/displayName';
import { requireStaffSession } from '../auth/session';

const router = Router();

const OFFLINE_METHODS = new Set([
  'cash',
  'check',
  'cash_app',
  'zelle',
  'venmo',
  'card',
  'ach',
]);

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<CreateGiftInput>;
    if (body.amount == null || !body.donorEmail || !body.fundId || !body.fundName || !body.paymentMethod) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'amount, donorEmail, fundId, fundName, and paymentMethod are required',
      });
    }

    const result = await createGift({
      amount: Number(body.amount),
      feeCovered: Boolean(body.feeCovered),
      feeAmount: body.feeAmount != null ? Number(body.feeAmount) : undefined,
      frequency: (body.frequency || 'one-time') as GiftFrequency,
      fundId: String(body.fundId),
      fundName: String(body.fundName),
      fundCode: body.fundCode ? String(body.fundCode) : undefined,
      donorName: String(body.donorName || ''),
      donorEmail: String(body.donorEmail),
      donorAddress: body.donorAddress ? String(body.donorAddress) : undefined,
      paymentMethod: body.paymentMethod as GiftPaymentMethod,
      cardBrand: body.cardBrand ? String(body.cardBrand) : undefined,
      cardLast4: body.cardLast4 ? String(body.cardLast4) : undefined,
      dedication: body.dedication ? String(body.dedication) : undefined,
      isAnonymous: Boolean(body.isAnonymous),
      stripePaymentIntentId: body.stripePaymentIntentId ? String(body.stripePaymentIntentId) : undefined,
      plaidTransferId: body.plaidTransferId ? String(body.plaidTransferId) : undefined,
      plaidInstitution: body.plaidInstitution ? String(body.plaidInstitution) : undefined,
      plaidAccountMask: body.plaidAccountMask ? String(body.plaidAccountMask) : undefined,
      awcDcbVoucher: body.awcDcbVoucher ? String(body.awcDcbVoucher) : undefined,
      awcSynced: body.awcSynced,
      transactionId: body.transactionId ? String(body.transactionId) : undefined,
      contributedAt: body.contributedAt ? String(body.contributedAt) : undefined,
    });

    return res.status(201).json({
      ok: true,
      mode: result.mode,
      donor: result.donor,
      donation: result.donation,
    });
  } catch (err) {
    console.error('[gifts] create', err);
    return res.status(400).json({
      error: 'GIFT_CREATE_FAILED',
      message: err instanceof Error ? err.message : 'Failed to record gift',
    });
  }
});

/**
 * Staff Contribution Log — persist gift + post to DCB.
 * Requires staff session cookie from POST /api/staff/verify.
 */
router.post('/offline', requireStaffSession, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const amount = Number(body.amount);
    const donorEmail = String(body.donorEmail || '').trim();
    const donorName = String(body.donorName || '').trim();
    const fundId = String(body.fundId || '').trim();
    const fundName = String(body.fundName || '').trim();
    const fundCode = String(body.fundCode || '1001-OPS');
    const rawMethod = String(body.paymentMethod || 'cash');
    let paymentMethod: GiftPaymentMethod =
      rawMethod === 'card_kiosk' ? 'card' : (rawMethod as GiftPaymentMethod);
    if (!OFFLINE_METHODS.has(paymentMethod)) {
      paymentMethod = 'cash';
    }

    if (!amount || amount <= 0 || !donorEmail || !fundId || !fundName) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'amount, donorEmail, fundId, and fundName are required',
      });
    }

    const transactionId =
      String(body.transactionId || '').trim() || `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const contributedAt = String(body.contributedAt || new Date().toISOString());
    const voucherNumber = buildVoucherNumber(transactionId);
    const channelLabel = String(body.cardBrand || paymentMethod);
    const dedication = body.dedication ? String(body.dedication) : undefined;
    const isAnonymous = Boolean(body.isAnonymous);

    const dcb = await postContributionToDcb({
      bookId: env.awcDcbBookId,
      voucherNumber,
      donorName: dcbDonorDisplayName({ isAnonymous, donorName: donorName || 'Anonymous' }),
      donorEmail,
      amount,
      feeAmount: 0,
      netAmount: amount,
      fundCode,
      fundName,
      paymentMethod,
      transactionId,
      contributedAt,
    });

    const result = await createGift({
      amount,
      feeCovered: false,
      feeAmount: 0,
      frequency: (String(body.frequency || 'one-time') as GiftFrequency) || 'one-time',
      fundId,
      fundName,
      fundCode,
      donorName: donorName || 'Anonymous',
      donorEmail,
      paymentMethod,
      cardBrand: channelLabel,
      cardLast4: '0000',
      dedication,
      isAnonymous,
      transactionId,
      contributedAt,
      awcDcbVoucher: dcb.voucherId || voucherNumber,
      awcSynced: dcb.ok,
    });

    return res.status(201).json({
      ok: true,
      mode: result.mode,
      donor: result.donor,
      donation: result.donation,
      dcb: {
        ok: dcb.ok,
        voucherId: dcb.voucherId,
        mock: dcb.mock,
        error: dcb.error,
      },
    });
  } catch (err) {
    console.error('[gifts] offline', err);
    return res.status(400).json({
      error: 'OFFLINE_GIFT_FAILED',
      message: err instanceof Error ? err.message : 'Failed to record offline gift',
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
      message: err instanceof Error ? err.message : 'List failed',
    });
  }
});

router.get('/by-email', async (req: Request, res: Response) => {
  const email = String(req.query.email || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({
      error: 'INVALID_EMAIL',
      message: 'Query param email is required',
    });
  }

  try {
    const result = await listGiftsByEmail(email);
    return res.json({
      ok: true,
      mode: result.mode,
      donor: result.donor,
      donations: result.donations,
      store: giftStoreMode(),
    });
  } catch (err) {
    console.error('[gifts] by-email', err);
    return res.status(500).json({
      error: 'GIFT_LOOKUP_FAILED',
      message: err instanceof Error ? err.message : 'Lookup failed',
    });
  }
});

export default router;
