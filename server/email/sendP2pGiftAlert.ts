/**
 * Tells Finance a Zelle / Venmo / Cash App gift needs checking, so it gets
 * verified the same day:
 *   - when a giver taps "I've sent it" on the giving page, and
 *   - when someone starts one by text-to-give (they never tap "sent").
 *
 * Goes to every active Tithe admin (the people who can verify), anyone added in
 * Integrations & Settings → "Who gets finance emails", and anyone listed in
 * FINANCE_ALERT_EMAILS (comma-separated). Email only — no SMS cost.
 * Never throws; a failed alert never blocks the gift.
 */
import { Resend } from 'resend';
import { env, isProduction } from '../config';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const LABEL: Record<string, string> = { zelle: 'Zelle', venmo: 'Venmo', cash_app: 'Cash App' };

export type P2pAlertGift = {
  memoCode: string;
  provider: string;
  amount: number;
  fundName: string;
  donorName: string;
  isAnonymous: boolean;
  donorReference?: string | null;
};

export type P2pAlertReason = 'marked_sent' | 'text_started';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function financeAlertExtraEmails(raw = process.env.FINANCE_ALERT_EMAILS || ''): string[] {
  return raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
}

export function verifyPageUrl(): string {
  return `${env.publicAppUrl.replace(/\/$/, '')}/?staff=verify`;
}

/** Exported for tests. */
export function buildP2pAlert(gift: P2pAlertGift, reason: P2pAlertReason) {
  const method = LABEL[gift.provider] || gift.provider;
  const money = `$${Number(gift.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const who = gift.donorName?.trim() || 'A giver';
  const subject =
    reason === 'marked_sent'
      ? `Check ${method}: ${who} says they sent ${money} (${gift.memoCode})`
      : `Check ${method}: ${who} started a ${money} gift by text (${gift.memoCode})`;
  const lead =
    reason === 'marked_sent'
      ? `${who} says they sent ${money} by ${method} for ${gift.fundName}.`
      : `${who} texted to give ${money} by ${method} for ${gift.fundName}. They were sent the ${method} link. They may not have paid yet.`;
  const lines = [
    lead,
    `Memo code: ${gift.memoCode}`,
    gift.donorReference ? `Their ${method} reference: ${gift.donorReference}` : null,
    gift.isAnonymous ? 'They asked to give anonymously. Keep their name private.' : null,
    `Find the payment in the church's ${method} account, then open AWC Tithe → Verify and enter its transaction ID. It isn't counted, receipted, or sent to DCB until then.`,
  ].filter(Boolean) as string[];
  const url = verifyPageUrl();
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1f2937">
<p style="font-size:16px"><strong>${escapeHtml(lead)}</strong></p>
<p>Memo code: <strong style="font-family:monospace">${escapeHtml(gift.memoCode)}</strong>${
    gift.donorReference ? `<br>Their ${escapeHtml(method)} reference: ${escapeHtml(gift.donorReference)}` : ''
  }</p>
${gift.isAnonymous ? '<p>They asked to give anonymously. Keep their name private.</p>' : ''}
<p>Find the payment in the church's ${escapeHtml(method)} account, then verify it in AWC Tithe. It isn't counted, receipted, or sent to DCB until then.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#6b1d2e;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open Verify in AWC Tithe</a></p>
</div>`;
  return { subject, text: `${lines.join('\n\n')}\n\n${url}`, html };
}

export async function financeAlertRecipients(): Promise<string[]> {
  const emails = new Set(financeAlertExtraEmails());
  try {
    const { listStaffAccounts } = await import('../auth/staffRoles');
    for (const a of await listStaffAccounts()) {
      if (a.role === 'admin' && a.status === 'active' && EMAIL_RE.test(a.email)) emails.add(a.email.toLowerCase());
    }
  } catch (err) {
    console.warn('[p2p-alert] could not list admins:', err instanceof Error ? err.message : err);
  }
  try {
    // People added in Integrations & Settings → "Who gets finance emails".
    const { listFinanceAlertRecipients } = await import('../financeAlerts/store');
    for (const r of await listFinanceAlertRecipients()) {
      if (EMAIL_RE.test(r.email)) emails.add(r.email.toLowerCase());
    }
  } catch (err) {
    console.warn('[p2p-alert] could not list finance recipients:', err instanceof Error ? err.message : err);
  }
  return [...emails];
}

export async function sendP2pGiftAlert(gift: P2pAlertGift, reason: P2pAlertReason): Promise<{ sent: number }> {
  try {
    const to = await financeAlertRecipients();
    if (!to.length) return { sent: 0 };
    const msg = buildP2pAlert(gift, reason);
    if (!env.resendApiKey) {
      if (!isProduction()) console.info(`[email] p2p alert to ${to.join(', ')}: ${msg.subject}`);
      return { sent: 0 };
    }
    const resend = new Resend(env.resendApiKey);
    const { error } = await resend.emails.send({
      from: env.receiptFromEmail || env.churchSupportEmail,
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) {
      console.warn('[p2p-alert] send failed:', error.message);
      return { sent: 0 };
    }
    return { sent: to.length };
  } catch (err) {
    console.warn('[p2p-alert] failed:', err instanceof Error ? err.message : err);
    return { sent: 0 };
  }
}
