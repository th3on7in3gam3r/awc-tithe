/**
 * Reminder to Finance listing every Zelle / Venmo / Cash App gift still waiting to be
 * checked. Sent:
 *   - when staff tap "Email reminder" on the Verify tab (all open gifts), and
 *   - once a day at 9 AM Eastern when any gift has waited more than a day.
 * Goes to the same people as the per-gift alert (admins + "Who gets finance emails").
 * Never throws.
 */
import { Resend } from 'resend';
import { env } from '../config';
import { financeAlertRecipients, verifyPageUrl } from './sendP2pGiftAlert';
import type { ManualGift } from '../manualGifts/store';

const LABEL: Record<string, string> = { zelle: 'Zelle', venmo: 'Venmo', cash_app: 'Cash App' };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const money = (n: number) =>
  `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function whenEastern(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysWaiting(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
}

export type PendingReminderReason = 'manual' | 'daily';

/** Exported for tests. Oldest gift first. */
export function buildPendingReminder(gifts: ManualGift[], reason: PendingReminderReason, now = Date.now()) {
  const list = [...gifts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const total = list.reduce((s, g) => s + Number(g.amount || 0), 0);
  const n = list.length;
  const subject = `AWC Tithe: ${n} ${n === 1 ? 'gift' : 'gifts'} waiting to be checked (${money(total)})`;
  const intro =
    reason === 'daily'
      ? `Daily reminder: ${n === 1 ? 'this gift has' : 'these gifts have'} been waiting to be checked.`
      : `${n === 1 ? 'This gift is' : 'These gifts are'} waiting to be checked.`;
  const rows = list.map((g) => {
    const who = g.isAnonymous ? `${g.donorName || 'A giver'} (asked to stay anonymous)` : g.donorName || 'A giver';
    const state = g.status === 'submitted' ? 'Says sent' : 'Started, may not have sent yet';
    const wait = daysWaiting(g.createdAt, now);
    return {
      text: `- ${whenEastern(g.createdAt)}: ${who}, ${LABEL[g.provider] || g.provider}, ${money(g.amount)}, ${g.fundName}. Memo ${g.memoCode}. ${state}.${wait >= 1 ? ` Waiting ${wait} ${wait === 1 ? 'day' : 'days'}.` : ''}`,
      html: `<tr>
<td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(whenEastern(g.createdAt))}${wait >= 1 ? `<br><span style="color:#b45309;font-size:12px">${wait} ${wait === 1 ? 'day' : 'days'} waiting</span>` : ''}</td>
<td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(who)}</strong><br><span style="font-size:12px;color:#6b7280">${escapeHtml(g.fundName)}</span></td>
<td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(LABEL[g.provider] || g.provider)}<br><span style="font-family:monospace;font-size:12px">${escapeHtml(g.memoCode)}</span></td>
<td style="padding:8px;border-bottom:1px solid #eee;text-align:right"><strong>${escapeHtml(money(g.amount))}</strong><br><span style="font-size:12px;color:#6b7280">${escapeHtml(state)}</span></td>
</tr>`,
    };
  });
  const after =
    "Find each one in the church's Zelle, Venmo or Cash App account, then verify it in AWC Tithe. It isn't counted, receipted, or sent to DCB until then.";
  const url = verifyPageUrl();
  const text = [intro, '', ...rows.map((r) => r.text), '', `Total: ${money(total)}`, '', after, '', url].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#1f2937">
<p style="font-size:16px"><strong>${escapeHtml(intro)}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join('')}
<tr><td colspan="3" style="padding:8px;text-align:right"><strong>Total</strong></td><td style="padding:8px;text-align:right"><strong>${escapeHtml(money(total))}</strong></td></tr></table>
<p>${escapeHtml(after)}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#6b1d2e;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open Verify in AWC Tithe</a></p>
</div>`;
  return { subject, text, html, count: n, total };
}

export async function sendPendingGiftsReminder(opts: {
  reason: PendingReminderReason;
  /** Only include gifts older than this many hours (0 = all open gifts). */
  minAgeHours?: number;
}): Promise<{ sent: number; count: number; total: number; emailConfigured: boolean }> {
  try {
    const { listManualGiftsForAdmin } = await import('../manualGifts/store');
    const now = Date.now();
    const minAgeMs = Math.max(0, Number(opts.minAgeHours) || 0) * 3_600_000;
    const open = (await listManualGiftsForAdmin('open', 500)).filter(
      (g) => now - Date.parse(g.createdAt) >= minAgeMs
    );
    if (!open.length) return { sent: 0, count: 0, total: 0, emailConfigured: Boolean(env.resendApiKey) };
    const msg = buildPendingReminder(open, opts.reason, now);
    const to = await financeAlertRecipients();
    if (!to.length || !env.resendApiKey) {
      return { sent: 0, count: msg.count, total: msg.total, emailConfigured: Boolean(env.resendApiKey) };
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
      console.warn('[pending-reminder] send failed:', error.message);
      return { sent: 0, count: msg.count, total: msg.total, emailConfigured: true };
    }
    return { sent: to.length, count: msg.count, total: msg.total, emailConfigured: true };
  } catch (err) {
    console.warn('[pending-reminder] failed:', err instanceof Error ? err.message : err);
    return { sent: 0, count: 0, total: 0, emailConfigured: Boolean(env.resendApiKey) };
  }
}
