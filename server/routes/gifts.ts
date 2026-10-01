import { Router, type Request, type Response } from 'express';
import { createGift, listGiftsByEmail, type CreateGiftInput, type GiftFrequency, type GiftPaymentMethod } from '../gifts/store';
import { giftStoreMode } from '../gifts/store';

const router = Router();

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
