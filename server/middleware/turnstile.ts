import type { Request, Response, NextFunction } from 'express';
import { env, isProduction } from '../config';

type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
};

/**
 * Verify Cloudflare Turnstile token server-side.
 * Bypass only when keys are missing AND NODE_ENV !== 'production'.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteip?: string
): Promise<{ ok: boolean; bypassed: boolean; error?: string }> {
  const secret = env.turnstileSecretKey;
  const siteConfigured = Boolean(env.turnstileSecretKey);

  if (!secret) {
    if (isProduction()) {
      return { ok: false, bypassed: false, error: 'TURNSTILE_NOT_CONFIGURED' };
    }
    return { ok: true, bypassed: true };
  }

  if (!token || !token.trim()) {
    return { ok: false, bypassed: false, error: 'TURNSTILE_TOKEN_MISSING' };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token.trim());
    if (remoteip) body.set('remoteip', remoteip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as TurnstileResponse;
    if (!data.success) {
      return {
        ok: false,
        bypassed: false,
        error: (data['error-codes'] || ['TURNSTILE_FAILED']).join(','),
      };
    }
    return { ok: true, bypassed: false };
  } catch (err) {
    return {
      ok: false,
      bypassed: false,
      error: err instanceof Error ? err.message : 'TURNSTILE_VERIFY_FAILED',
    };
  }

  // siteConfigured unused except for clarity in logs
  void siteConfigured;
}

export function requireTurnstile(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const token =
      (typeof req.body?.turnstileToken === 'string' && req.body.turnstileToken) ||
      (typeof req.body?.cfTurnstileResponse === 'string' && req.body.cfTurnstileResponse) ||
      (typeof req.headers['x-turnstile-token'] === 'string' ? req.headers['x-turnstile-token'] : undefined);

    const result = await verifyTurnstileToken(token, req.ip);
    if (!result.ok) {
      res.status(403).json({
        error: 'TURNSTILE_FAILED',
        message: 'Human verification failed. Please try again.',
      });
      return;
    }
    next();
  })().catch(next);
}

export function minGiftCents(): number {
  return env.minGiftCents;
}

export function validateMinGiftAmount(amountDollars: number): {
  ok: boolean;
  amountCents: number;
  minCents: number;
} {
  const amountCents = Math.round(Number(amountDollars) * 100);
  const minCents = minGiftCents();
  return {
    ok: Number.isFinite(amountCents) && amountCents >= minCents,
    amountCents,
    minCents,
  };
}
