/**
 * server/routes/vaultIntegration.ts
 *
 * POST /api/integrations/vault/ref-status
 *
 * AWC Vault asks which of its RSVP references have been paid. Signed with the
 * shared AWC_VAULT_KEY using the same scheme Tithe uses toward DCB:
 *   X-AWC-Key-Id: vault
 *   X-AWC-Timestamp: <ms since epoch>
 *   X-AWC-Signature: hex HMAC-SHA256(AWC_VAULT_KEY, `${timestamp}.${rawBody}`)
 *
 * Mounted with express.raw() so the signature covers the exact bytes sent.
 * Returns statuses only — no donor names, emails or card details.
 */

import crypto from 'crypto';
import express, { Router, type Request, type Response } from 'express';
import { env } from '../config';
import { externalRefsForDonations, statusForRefs } from '../externalRefs/store';
import { listAllFunds } from '../funds/store';
import { listConfirmedGiftsForFund } from '../gifts/store';

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signVaultRequest(key: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyVaultSignature(input: {
  key: string;
  keyId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  now?: number;
}): boolean {
  if (!input.key || input.keyId !== 'vault') return false;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs((input.now ?? Date.now()) - ts) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(signVaultRequest(input.key, String(input.timestamp), input.rawBody), 'hex');
  const given = Buffer.from(String(input.signature || ''), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const router = Router();

/** Verify the signed Vault request; returns the parsed JSON body or sends the error. */
function readSignedBody(req: Request, res: Response): Record<string, unknown> | null {
  if (!env.awcVaultKey) {
    res.status(503).json({ ok: false, error: 'NOT_CONFIGURED', message: 'Set AWC_VAULT_KEY on Tithe.' });
    return null;
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ok = verifyVaultSignature({
    key: env.awcVaultKey,
    keyId: req.get('X-AWC-Key-Id') || undefined,
    timestamp: req.get('X-AWC-Timestamp') || undefined,
    signature: req.get('X-AWC-Signature') || undefined,
    rawBody,
  });
  if (!ok) {
    res.status(401).json({ ok: false, error: 'BAD_SIGNATURE' });
    return null;
  }
  try {
    const parsed = JSON.parse(rawBody || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    res.status(400).json({ ok: false, error: 'BAD_JSON' });
    return null;
  }
}

/** Funds the Vault can link a fundraiser to (names only). */
router.post('/funds', express.raw({ type: '*/*', limit: '16kb' }), async (req: Request, res: Response) => {
  if (!readSignedBody(req, res)) return;
  try {
    const funds = await listAllFunds();
    return res.json({ ok: true, funds: funds.map((f) => ({ id: f.id, name: f.name, active: f.active })) });
  } catch (err) {
    console.error('[vault-integration] funds', err);
    return res.status(500).json({ ok: false, error: 'LOOKUP_FAILED' });
  }
});

/**
 * Confirmed gifts to one fund, for a Vault fundraiser. Only gifts the Stripe webhook completed
 * or Finance verified (Cash App / Zelle / Venmo) are returned. Anonymous donors stay anonymous;
 * no emails or card details are sent.
 */
router.post('/fund-gifts', express.raw({ type: '*/*', limit: '16kb' }), async (req: Request, res: Response) => {
  const body = readSignedBody(req, res);
  if (!body) return;
  const fundId = String(body.fundId || '').trim();
  if (!fundId || fundId.length > 100) return res.status(400).json({ ok: false, error: 'FUND_REQUIRED' });
  try {
    const gifts = await listConfirmedGiftsForFund(fundId);
    const refs = await externalRefsForDonations(gifts.map((d) => ({ id: d.id, transactionId: d.transactionId })));
    return res.json({
      ok: true,
      gifts: gifts.map((d) => ({
        // frm:/fre: when the donor used a Vault "Pay my balance" link; null otherwise
        externalRef: refs.get(d.id) || null,
        transactionId: d.transactionId,
        receiptNumber: d.receiptNumber,
        donorName: d.isAnonymous ? 'Anonymous' : d.donorName || 'Donor',
        amount: d.amount,
        refundedAmount: d.refundedAmount || 0,
        paymentMethod: d.paymentMethod,
        contributedAt: d.timestamp,
        status: d.status,
      })),
    });
  } catch (err) {
    console.error('[vault-integration] fund-gifts', err);
    return res.status(500).json({ ok: false, error: 'LOOKUP_FAILED' });
  }
});

router.post('/ref-status', express.raw({ type: '*/*', limit: '64kb' }), async (req: Request, res: Response) => {
  if (!env.awcVaultKey) {
    return res.status(503).json({ ok: false, error: 'NOT_CONFIGURED', message: 'Set AWC_VAULT_KEY on Tithe.' });
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ok = verifyVaultSignature({
    key: env.awcVaultKey,
    keyId: req.get('X-AWC-Key-Id') || undefined,
    timestamp: req.get('X-AWC-Timestamp') || undefined,
    signature: req.get('X-AWC-Signature') || undefined,
    rawBody,
  });
  if (!ok) return res.status(401).json({ ok: false, error: 'BAD_SIGNATURE' });

  let refs: unknown[] = [];
  try {
    const parsed = JSON.parse(rawBody) as { refs?: unknown };
    refs = Array.isArray(parsed.refs) ? parsed.refs : [];
  } catch {
    return res.status(400).json({ ok: false, error: 'BAD_JSON' });
  }
  if (refs.length > 200) return res.status(400).json({ ok: false, error: 'TOO_MANY_REFS' });

  try {
    const statuses = await statusForRefs(refs);
    return res.json({ ok: true, statuses });
  } catch (err) {
    console.error('[vault-integration] ref-status', err);
    return res.status(500).json({ ok: false, error: 'LOOKUP_FAILED' });
  }
});

export default router;
