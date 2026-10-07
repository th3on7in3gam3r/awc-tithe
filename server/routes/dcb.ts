import { Router, type Request, type Response } from 'express';
import { env } from '../config';
import {
  buildVoucherNumber,
  mockDcbEntries,
  postContributionToDcb,
  type DcbContributionPayload,
} from '../dcb/client';
import { dcbDonorDisplayName } from '../dcb/displayName';
import { requireStaffSession } from '../auth/session';

const router = Router();

/** Dev mock endpoint — receives the same payload AWC DCB would */
router.post('/mock/entries', (req: Request, res: Response) => {
  const body = req.body as Partial<DcbContributionPayload> & { isAnonymous?: boolean };
  if (body.amount == null || !body.donorName) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'donorName and amount are required' });
  }
  const donorName = dcbDonorDisplayName({
    isAnonymous: Boolean(body.isAnonymous),
    donorName: body.donorName,
  });
  const voucherNumber = body.voucherNumber || buildVoucherNumber(body.transactionId || String(Date.now()));
  const entry = {
    bookId: body.bookId || env.awcDcbBookId,
    voucherNumber,
    donorName,
    donorEmail: body.donorEmail || '',
    envelopeNumber: body.envelopeNumber,
    amount: Number(body.amount),
    feeAmount: Number(body.feeAmount || 0),
    netAmount: Number(body.netAmount ?? body.amount),
    fundCode: body.fundCode || '1001-OPS',
    fundName: body.fundName || 'General Tithes & Offerings',
    paymentMethod: body.paymentMethod || 'card',
    transactionId: body.transactionId || `txn_${Date.now()}`,
    contributedAt: body.contributedAt || new Date().toISOString(),
    id: `dcb-mock-${Date.now()}`,
    receivedAt: new Date().toISOString(),
  };
  mockDcbEntries.unshift(entry);
  return res.status(201).json({ ok: true, voucherId: voucherNumber, entry });
});

router.get('/mock/entries', (_req: Request, res: Response) => {
  return res.json({ bookId: env.awcDcbBookId, count: mockDcbEntries.length, entries: mockDcbEntries });
});

/** Manual / retry sync for admin console — staff session required */
router.post('/sync', requireStaffSession, async (req: Request, res: Response) => {
  const body = req.body as
    | (Partial<DcbContributionPayload> & { isAnonymous?: boolean })
    | { donations?: Array<Partial<DcbContributionPayload> & { isAnonymous?: boolean }> };

  const items: Array<Partial<DcbContributionPayload> & { isAnonymous?: boolean }> = Array.isArray(
    (body as { donations?: unknown }).donations
  )
    ? ((body as { donations: Array<Partial<DcbContributionPayload> & { isAnonymous?: boolean }> }).donations)
    : [body as Partial<DcbContributionPayload> & { isAnonymous?: boolean }];

  const results = [];
  for (const item of items) {
    if (item.amount == null || !item.donorName) {
      results.push({ ok: false, error: 'MISSING_FIELDS' });
      continue;
    }
    const voucherNumber = item.voucherNumber || buildVoucherNumber(item.transactionId || String(Date.now()));
    const payload: DcbContributionPayload = {
      bookId: item.bookId || env.awcDcbBookId,
      voucherNumber,
      donorName: dcbDonorDisplayName({
        isAnonymous: Boolean(item.isAnonymous),
        donorName: item.donorName,
      }),
      donorEmail: item.donorEmail || '',
      envelopeNumber: item.envelopeNumber,
      amount: Number(item.amount),
      feeAmount: Number(item.feeAmount || 0),
      netAmount: Number(item.netAmount ?? Number(item.amount) - Number(item.feeAmount || 0)),
      fundCode: item.fundCode || '1001-OPS',
      fundName: item.fundName || 'General Tithes & Offerings',
      paymentMethod: item.paymentMethod || 'card',
      transactionId: item.transactionId || `txn_${Date.now()}`,
      contributedAt: item.contributedAt || new Date().toISOString(),
    };
    results.push(await postContributionToDcb(payload));
  }

  return res.json({
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

export default router;
