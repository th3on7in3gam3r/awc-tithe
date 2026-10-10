import { writeActivityAudit } from '../audit/activity';
import { createOfflineGift, getFundById } from '../funds/store';
import { validateMinGiftAmount } from '../middleware/turnstile';

export async function recordStaffOfflineGift(input: {
  fundId: string;
  amount: number;
  giftDate: string;
  note?: string;
  donorEmail?: string;
  donorName?: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  ipAddress: string;
}): Promise<{ ok: true; gift: Awaited<ReturnType<typeof createOfflineGift>> } | { ok: false; status: number; error: string }> {
  const fundId = input.fundId.trim();
  const amount = Number(input.amount);
  if (!fundId) return { ok: false, status: 400, error: 'FUND_REQUIRED' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, status: 400, error: 'INVALID_AMOUNT' };
  const minGift = validateMinGiftAmount(amount);
  if (!minGift.ok) return { ok: false, status: 400, error: 'AMOUNT_TOO_LOW' };
  const fund = await getFundById(fundId);
  if (!fund) return { ok: false, status: 404, error: 'FUND_NOT_FOUND' };
  const enteredBy = `${input.actorEmail} (${input.actorUserId})`;
  const gift = await createOfflineGift({
    fundId,
    amount,
    giftDate: input.giftDate,
    enteredBy,
    note: input.note,
    donorEmail: input.donorEmail,
    donorName: input.donorName,
  });
  await writeActivityAudit({
    actorId: input.actorUserId,
    actorLabel: input.actorEmail,
    actorRole: input.actorRole,
    action: 'OFFLINE_GIFT_RECORDED',
    resource: gift.id,
    details: JSON.stringify({
      amount,
      fund: fund.name,
      donorEmail: input.donorEmail || '',
      paymentMethod: input.note || '',
    }),
    ipAddress: input.ipAddress,
  });
  return { ok: true, gift };
}
