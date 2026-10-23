import type { NextFunction, Request, Response } from 'express';
import { phoneSignInEnabled } from '../sms/verify';

/**
 * Mounted at /api/auth before Better Auth. Of the phone-number plugin's routes,
 * only POST /phone-number/verify is open (and only when phone sign-in is set up).
 * Codes are sent by /api/donor/phone/request-code (bot check, rate limits, daily
 * cap) — never by the plugin's own send / password routes, which could run up
 * Twilio charges.
 */
export function phoneRouteGuard(req: Request, res: Response, next: NextFunction): void {
  const p = req.path.toLowerCase();
  if (!p.startsWith('/phone-number') && !p.startsWith('/sign-in/phone-number')) return next();
  if (req.method === 'POST' && p === '/phone-number/verify' && phoneSignInEnabled()) return next();
  res.status(404).json({ error: 'NOT_FOUND' });
}
