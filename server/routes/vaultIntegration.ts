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
import { statusForRefs } from '../externalRefs/store';

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
