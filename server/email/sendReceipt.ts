import { Resend } from 'resend';
import { env, isProduction } from '../config';
import { claimReceiptEmailSend, getGiftByTransactionId } from '../gifts/store';

export type ReceiptGiftSnapshot = {
  transactionId: string;
  receiptNumber: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  feeAmount: number;
  totalCharged: number;
  fundName: string;
  contributedAt: string;
  isAnonymous: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReceiptHtml(g: ReceiptGiftSnapshot): string {
  const church = env.churchName || 'Anointed Worship Center';
  const legal = env.churchLegalName || church;
  const displayName = g.isAnonymous ? 'Friend' : g.donorName || 'Friend';
  const date = new Date(g.contributedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#1e293b;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="color:#4A0404;font-size:22px;">Contribution receipt</h1>
  <p>Dear ${escapeHtml(displayName)},</p>
  <p>Thank you for your gift to ${escapeHtml(church)}. This email is your contribution receipt.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
    <tr><td style="padding:6px 0;color:#64748b;">Date</td><td style="text-align:right;">${escapeHtml(date)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Receipt #</td><td style="text-align:right;font-family:monospace;">${escapeHtml(g.receiptNumber)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Fund</td><td style="text-align:right;">${escapeHtml(g.fundName)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Gift amount</td><td style="text-align:right;font-family:monospace;">$${g.amount.toFixed(2)}</td></tr>
    ${
      g.feeAmount > 0
        ? `<tr><td style="padding:6px 0;color:#64748b;">Processing fee covered</td><td style="text-align:right;font-family:monospace;">$${g.feeAmount.toFixed(2)}</td></tr>`
        : ''
    }
    <tr><td style="padding:6px 0;color:#64748b;">Total charged</td><td style="text-align:right;font-family:monospace;font-weight:bold;">$${g.totalCharged.toFixed(2)}</td></tr>
  </table>
  <p style="font-size:13px;color:#475569;">
    ${escapeHtml(legal)} is a 501(c)(3) public religious organization.
    No goods or services were provided in exchange for this contribution other than intangible religious benefits.
  </p>
  <p style="font-size:12px;color:#94a3b8;">Reference: ${escapeHtml(g.transactionId)}</p>
  <p style="font-size:13px;">With gratitude,<br/>${escapeHtml(church)}</p>
</body></html>`;
}

/**
 * Send contribution receipt once per gift (idempotent via claimReceiptEmailSend).
 * Missing RESEND_API_KEY in non-production → console log only.
 */
export async function sendGiftReceiptEmail(transactionId: string): Promise<{
  sent: boolean;
  skipped?: 'duplicate' | 'no_email' | 'missing_gift' | 'logged_dev';
}> {
  const claimed = await claimReceiptEmailSend(transactionId);
  if (!claimed.claimed) {
    return { sent: false, skipped: claimed.reason === 'missing' ? 'missing_gift' : 'duplicate' };
  }

  const gift = claimed.gift;
  const to = (gift.donorEmail || '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    return { sent: false, skipped: 'no_email' };
  }

  const snapshot: ReceiptGiftSnapshot = {
    transactionId: gift.transactionId,
    receiptNumber: gift.receiptNumber,
    donorName: gift.donorName,
    donorEmail: to,
    amount: gift.amount,
    feeAmount: gift.feeAmount,
    totalCharged: gift.totalCharged,
    fundName: gift.fundName,
    contributedAt: gift.timestamp,
    isAnonymous: gift.isAnonymous,
  };

  const subject = `Your contribution receipt — ${env.churchName || 'AWC Tithe'}`;
  const html = buildReceiptHtml(snapshot);
  const from = env.receiptFromEmail || env.churchSupportEmail || 'stewardship@anointedworshipcenter.com';

  if (!env.resendApiKey) {
    if (isProduction()) {
      console.error('[email] RESEND_API_KEY missing — receipt not sent for', transactionId);
      return { sent: false, skipped: 'logged_dev' };
    }
    console.info('[email] receipt DEV (no RESEND_API_KEY)', { to, subject, transactionId, html: html.slice(0, 200) + '…' });
    return { sent: false, skipped: 'logged_dev' };
  }

  try {
    const resend = new Resend(env.resendApiKey);
    await resend.emails.send({
      from: `${env.churchName || 'AWC Tithe'} <${from}>`,
      to: [to],
      subject,
      html,
    });
    console.info('[email] receipt sent', { to, transactionId });
    return { sent: true };
  } catch (err) {
    console.error('[email] receipt send failed', err);
    // Claim already set — do not auto-retry on webhook replay; ops can resend manually later
    return { sent: false };
  }
}

/** Lookup by payment intent or invoice id, then send. Called from the Stripe webhook. */
export async function sendReceiptForTransaction(transactionId: string): Promise<void> {
  const existing = await getGiftByTransactionId(transactionId);
  if (!existing) return;
  await sendGiftReceiptEmail(transactionId);
}
