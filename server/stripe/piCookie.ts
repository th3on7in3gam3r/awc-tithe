import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env, isProduction } from '../config';

const COOKIE = 'awc_pi';
const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  // stripeWebhookSecret is always set in production (boot guard enforces it).
  // stripeSecretKey is the fallback for dev when STRIPE_WEBHOOK_SECRET is absent.
  return env.stripeWebhookSecret || env.stripeSecretKey;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function readPiIds(req: Request): string[] {
  const raw = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!raw) return [];
  const value = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return [];
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return [];
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      ids?: string[];
      exp?: number;
    };
    if (!data.exp || data.exp < Date.now()) return [];
    return Array.isArray(data.ids) ? data.ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberPaymentIntent(req: Request, res: Response, paymentIntentId: string): void {
  const ids = Array.from(new Set([...readPiIds(req), paymentIntentId])).slice(-8);
  const payload = Buffer.from(JSON.stringify({ ids, exp: Date.now() + TTL_MS })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  const secure = isProduction() ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${secure}`
  );
}

export function piBelongsToSession(req: Request, paymentIntentId: string): boolean {
  return readPiIds(req).includes(paymentIntentId);
}
