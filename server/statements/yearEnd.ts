import { Resend } from 'resend';
import { env, isProduction, memoryStoreAllowed } from '../config';
import { getSql } from '../db';
import { listAllGifts } from '../gifts/store';
import { getChurchSettings } from '../church/settings';
import { listAllFunds, listOfflineGifts } from '../funds/store';
import { writeActivityAudit } from '../audit/activity';

export type StatementLine = {
  date: string;
  fund: string;
  amount: number;
  source: 'gift' | 'offline';
};

export type DonorStatement = {
  donorEmail: string;
  donorName: string;
  lines: StatementLine[];
  total: number;
  alreadySent: boolean;
};

const memorySends = new Map<string, { sentAt: string; sentBy: string }>();

function sendKey(email: string, year: number): string {
  return `${email.trim().toLowerCase()}|${year}`;
}

function escapeHtml(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function alreadySent(email: string, year: number): Promise<boolean> {
  const key = sendKey(email, year);
  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) return false;
    return memorySends.has(key);
  }
  const rows = await client`
    SELECT donor_email FROM year_end_statement_sends
    WHERE donor_email = ${email} AND tax_year = ${year}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function claimSend(email: string, year: number, sentBy: string): Promise<boolean> {
  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) return false;
    const key = sendKey(email, year);
    if (memorySends.has(key)) return false;
    memorySends.set(key, { sentAt: new Date().toISOString(), sentBy });
    return true;
  }
  const rows = await client`
    INSERT INTO year_end_statement_sends (donor_email, tax_year, sent_by)
    VALUES (${email}, ${year}, ${sentBy})
    ON CONFLICT (donor_email, tax_year) DO NOTHING
    RETURNING donor_email
  `;
  return rows.length > 0;
}

async function releaseClaim(email: string, year: number): Promise<void> {
  const client = getSql();
  if (!client) {
    if (!memoryStoreAllowed()) return;
    memorySends.delete(sendKey(email, year));
    return;
  }
  await client`
    DELETE FROM year_end_statement_sends
    WHERE donor_email = ${email} AND tax_year = ${year}
  `;
}

export async function buildYearStatements(year: number): Promise<DonorStatement[]> {
  const byEmail = new Map<string, DonorStatement>();
  const ledger = await listAllGifts(2000);
  for (const gift of ledger.donations) {
    if (gift.status !== 'completed') continue;
    const giftYear = new Date(gift.timestamp).getFullYear();
    if (giftYear !== year) continue;
    const email = gift.donorEmail.trim().toLowerCase();
    if (!email.includes('@')) continue;
    let row = byEmail.get(email);
    if (!row) {
      row = {
        donorEmail: email,
        donorName: gift.donorName || email,
        lines: [],
        total: 0,
        alreadySent: false,
      };
      byEmail.set(email, row);
    }
    row.lines.push({
      date: gift.timestamp.slice(0, 10),
      fund: gift.fundName || 'Tithes & Offerings',
      amount: gift.amount,
      source: 'gift',
    });
    row.total += gift.amount;
  }

  const fundNames = new Map((await listAllFunds()).map((f) => [f.id, f.name]));
  const offline = await listOfflineGifts({ year });
  for (const gift of offline) {
    const email = (gift.donorEmail || '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    let row = byEmail.get(email);
    if (!row) {
      row = {
        donorEmail: email,
        donorName: gift.donorName || email,
        lines: [],
        total: 0,
        alreadySent: false,
      };
      byEmail.set(email, row);
    }
    row.lines.push({
      date: gift.giftDate,
      fund: fundNames.get(gift.fundId) || gift.fundName || gift.fundId,
      amount: gift.amount,
      source: 'offline',
    });
    row.total += gift.amount;
  }

  const statements = [...byEmail.values()];
  for (const s of statements) {
    s.lines.sort((a, b) => a.date.localeCompare(b.date));
    s.total = Number(s.total.toFixed(2));
    s.alreadySent = await alreadySent(s.donorEmail, year);
  }
  statements.sort((a, b) => a.donorEmail.localeCompare(b.donorEmail));
  return statements;
}

export function renderStatementHtml(input: {
  churchName: string;
  legalName: string;
  address: string;
  cityStateZip: string;
  ein: string;
  donorName: string;
  year: number;
  lines: StatementLine[];
  total: number;
}): string {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;">${escapeHtml(line.date)}</td><td>${escapeHtml(line.fund)}</td><td style="text-align:right;font-family:monospace;">$${line.amount.toFixed(2)}</td></tr>`
    )
    .join('');
  const address = [input.address, input.cityStateZip].filter(Boolean).join(', ');
  return `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#1e293b;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="color:#4A0404;font-size:22px;">${escapeHtml(input.year)} giving statement</h1>
  <p><strong>${escapeHtml(input.legalName || input.churchName)}</strong><br/>
  ${escapeHtml(address)}${input.ein ? `<br/>EIN: ${escapeHtml(input.ein)}` : ''}</p>
  <p>Prepared for ${escapeHtml(input.donorName)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr><th align="left">Date</th><th align="left">Fund</th><th align="right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:16px;"><strong>Total: $${input.total.toFixed(2)}</strong></p>
  <p style="font-size:13px;color:#475569;">No goods or services were provided in exchange for these contributions other than intangible religious benefits.</p>
  <p style="font-size:13px;">With gratitude,<br/>${escapeHtml(input.churchName)}</p>
</body></html>`;
}

async function deliver(to: string, subject: string, html: string): Promise<'sent' | 'logged_dev' | 'failed'> {
  const from = env.receiptFromEmail || env.churchSupportEmail || 'stewardship@anointedworshipcenter.com';
  if (!env.resendApiKey) {
    if (isProduction()) {
      console.error('[email] RESEND_API_KEY missing — year-end statement not sent to', to);
      return 'failed';
    }
    console.info('[email] year-end DEV (no RESEND_API_KEY)', { to, subject, html: html.slice(0, 180) });
    return 'logged_dev';
  }
  try {
    const resend = new Resend(env.resendApiKey);
    await resend.emails.send({
      from: `${env.churchName || 'AWC Tithe'} <${from}>`,
      to: [to],
      subject,
      html,
    });
    return 'sent';
  } catch (err) {
    console.error('[email] year-end send failed', err);
    return 'failed';
  }
}

export async function previewYearEnd(year: number): Promise<{
  year: number;
  donorCount: number;
  sample: DonorStatement | null;
  html: string;
}> {
  const statements = await buildYearStatements(year);
  const church = await getChurchSettings();
  const sample = statements[0] || null;
  const html = sample
    ? renderStatementHtml({
        churchName: church.name,
        legalName: church.legalEntityName,
        address: church.address,
        cityStateZip: church.cityStateZip,
        ein: church.ein,
        donorName: sample.donorName,
        year,
        lines: sample.lines,
        total: sample.total,
      })
    : '';
  return { year, donorCount: statements.length, sample, html };
}

export async function sendYearEndStatements(input: {
  year: number;
  resendEmail?: string;
  actorId: string;
  actorLabel: string;
  ipAddress: string;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const year = input.year;
  const forceEmail = input.resendEmail?.trim().toLowerCase() || '';
  const statements = await buildYearStatements(year);
  const church = await getChurchSettings();
  const targets = forceEmail
    ? statements.filter((s) => s.donorEmail === forceEmail)
    : statements;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  if (forceEmail && targets.length === 0) {
    failed = 1;
  }

  for (const statement of targets) {
    if (!forceEmail && statement.alreadySent) {
      skipped += 1;
      continue;
    }
    if (forceEmail) {
      await releaseClaim(statement.donorEmail, year);
    }
    const claimed = await claimSend(statement.donorEmail, year, input.actorLabel);
    if (!claimed) {
      skipped += 1;
      continue;
    }
    const html = renderStatementHtml({
      churchName: church.name,
      legalName: church.legalEntityName,
      address: church.address,
      cityStateZip: church.cityStateZip,
      ein: church.ein,
      donorName: statement.donorName,
      year,
      lines: statement.lines,
      total: statement.total,
    });
    const result = await deliver(
      statement.donorEmail,
      `${year} giving statement — ${church.name}`,
      html
    );
    if (result === 'failed') {
      await releaseClaim(statement.donorEmail, year);
      failed += 1;
    } else {
      sent += 1;
    }
  }

  await writeActivityAudit({
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    actorRole: 'admin',
    action: 'YEAR_END_STATEMENTS_SENT',
    resource: `tax-year-${year}`,
    details: forceEmail
      ? `Resend to ${forceEmail}. sent=${sent} skipped=${skipped} failed=${failed}`
      : `Bulk send for ${year}. sent=${sent} skipped=${skipped} failed=${failed}`,
    ipAddress: input.ipAddress,
  });

  return { sent, skipped, failed };
}
