import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getSql } from '../db';
import { env, memoryStoreAllowed } from '../config';

type RateWindow = { windowMs: number; max: number };

const memoryBuckets = new Map<string, { windowStart: number; count: number }>();

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function floorWindow(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

async function bumpNeon(key: string, windowStart: Date, windowMs: number): Promise<number> {
  const client = getSql();
  if (!client) throw new Error('no sql');

  // Drop expired windows for this key (light cleanup on write)
  const expireBefore = new Date(Date.now() - windowMs * 2);
  await client`
    DELETE FROM rate_limits
    WHERE key = ${key} AND window_start < ${expireBefore}
  `;

  const rows = await client`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;
  return Number(rows[0]?.count ?? 1);
}

function bumpMemory(key: string, windowStartMs: number, windowMs: number): number {
  const mapKey = `${key}:${windowStartMs}`;
  // Opportunistic cleanup
  for (const [k, v] of memoryBuckets) {
    if (v.windowStart < Date.now() - windowMs * 2) memoryBuckets.delete(k);
  }
  const existing = memoryBuckets.get(mapKey);
  if (!existing) {
    memoryBuckets.set(mapKey, { windowStart: windowStartMs, count: 1 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export async function checkRateLimit(
  key: string,
  window: RateWindow
): Promise<{ allowed: boolean; count: number; max: number }> {
  const now = Date.now();
  const windowStart = floorWindow(now, window.windowMs);
  const client = getSql();

  let count: number;
  try {
    if (client) {
      count = await bumpNeon(key, windowStart, window.windowMs);
    } else {
      if (!memoryStoreAllowed()) {
        console.error('[rate-limit] DATABASE_URL missing — denying request');
        return { allowed: false, count: window.max + 1, max: window.max };
      }
      count = bumpMemory(key, windowStart.getTime(), window.windowMs);
    }
  } catch {
    if (!memoryStoreAllowed()) {
      console.error('[rate-limit] Neon rate-limit query failed — denying request');
      return { allowed: false, count: window.max + 1, max: window.max };
    }
    count = bumpMemory(key, windowStart.getTime(), window.windowMs);
  }

  return { allowed: count <= window.max, count, max: window.max };
}

/** Client IP via Express trust proxy (Render sets X-Forwarded-For; do not parse raw headers). */
export function clientIp(req: Request): string {
  return req.ip || 'unknown';
}

export function rateLimitOtpEmailKey(email: string): string {
  return `otp:email:${sha256Hex(email.trim().toLowerCase())}`;
}

export function rateLimitOtpIpKey(ip: string): string {
  return `otp:ip:${ip}`;
}

export function rateLimitPayIpKey(ip: string): string {
  return `pay:ip:${ip}`;
}

export const otpEmailWindow: RateWindow = {
  windowMs: 60 * 60 * 1000,
  max: env.rateLimitOtpEmailPerHour,
};

export const otpIpWindow: RateWindow = {
  windowMs: 60 * 60 * 1000,
  max: env.rateLimitOtpIpPerHour,
};

export const payIpWindow: RateWindow = {
  windowMs: 10 * 60 * 1000,
  max: env.rateLimitPayIpPer10Min,
};

export function payRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const ip = clientIp(req);
    const result = await checkRateLimit(rateLimitPayIpKey(ip), payIpWindow);
    if (!result.allowed) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many payment attempts. Please wait and try again.',
      });
      return;
    }
    next();
  })().catch(next);
}
