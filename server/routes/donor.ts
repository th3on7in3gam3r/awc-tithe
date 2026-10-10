import { Router, type Request, type Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/betterAuth';
import { emailHasPriorGifts } from '../gifts/privacy';
import { findDonorByEmail, listGiftsByEmail } from '../gifts/store';
import { requireTurnstile } from '../middleware/turnstile';
import {
  checkRateLimit,
  clientIp,
  otpEmailWindow,
  otpIpWindow,
  rateLimitOtpEmailKey,
  rateLimitOtpIpKey,
} from '../middleware/rateLimit';

const router = Router();

const UNIFORM_REQUEST_CODE = {
  ok: true as const,
  message:
    'If we have gifts for this email, a sign-in code is on its way. Check your inbox (and spam).',
};

async function getDonorSession(req: Request) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

/**
 * Anti-enumeration OTP request.
 * Always returns the same JSON; only sends a code when prior gifts exist.
 */
router.post('/request-code', requireTurnstile, async (req: Request, res: Response) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();

  // Uniform timing: always run rate limits + optional send path delay
  const started = Date.now();

  try {
    if (email.includes('@')) {
      const ip = clientIp(req);
      const [emailLimit, ipLimit] = await Promise.all([
        checkRateLimit(rateLimitOtpEmailKey(email), otpEmailWindow),
        checkRateLimit(rateLimitOtpIpKey(ip), otpIpWindow),
      ]);

      if (emailLimit.allowed && ipLimit.allowed) {
        const hasGifts = await emailHasPriorGifts(email);
        if (hasGifts) {
          try {
            await auth.api.sendVerificationOTP({
              body: { email, type: 'sign-in' },
            });
          } catch (err) {
            console.warn('[donor] sendVerificationOTP', err instanceof Error ? err.message : err);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[donor] request-code', err instanceof Error ? err.message : err);
  }

  // Pad to reduce timing oracle (min ~150ms)
  const elapsed = Date.now() - started;
  if (elapsed < 150) {
    await new Promise((r) => setTimeout(r, 150 - elapsed));
  }

  return res.json(UNIFORM_REQUEST_CODE);
});

router.get('/me/gifts', async (req: Request, res: Response) => {
  try {
    const session = await getDonorSession(req);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Sign in to My Giving with your email code to view gifts.',
      });
    }

    const result = await listGiftsByEmail(email);
    const { listOfflineGiftsByEmail } = await import('../funds/store');
    const offline = await listOfflineGiftsByEmail(email);
    const offlineAsDonations = offline.map((g) => ({
      id: g.id,
      transactionId: g.id,
      receiptNumber: g.id,
      donorId: result.donor?.id || '',
      donorName: g.donorName || result.donor?.name || '',
      donorEmail: email,
      amount: g.amount,
      feeCovered: false,
      feeAmount: 0,
      totalCharged: g.amount,
      frequency: 'one-time' as const,
      fundId: g.fundId,
      fundName: g.fundName,
      fundCode: '',
      paymentMethod: 'cash' as const,
      status: 'completed' as const,
      isAnonymous: false,
      timestamp: `${g.giftDate}T12:00:00.000Z`,
      awcSynced: false,
      encryptedToken: '',
    }));
    const donations = [...result.donations, ...offlineAsDonations].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
    return res.json({
      ok: true,
      mode: result.mode,
      donor: result.donor,
      donations,
      email,
    });
  } catch (err) {
    console.error('[donor] me/gifts', err);
    return res.status(500).json({
      error: 'DONOR_GIFTS_FAILED',
      message: 'Failed to load gifts',
    });
  }
});

router.get('/me/profile', async (req: Request, res: Response) => {
  try {
    const session = await getDonorSession(req);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Sign in required for profile prefill.',
      });
    }

    const result = await listGiftsByEmail(email);
    const latest = result.donations[0];
    const name =
      (result.donor?.name || '').trim() ||
      (latest && !latest.isAnonymous ? (latest.donorName || '').trim() : '');
    const address =
      (result.donor?.address || '').trim() || (latest?.donorAddress || '').trim();
    const phone = (result.donor?.phone || '').trim();

    return res.json({
      ok: true,
      profile: {
        email,
        name: name === 'Anonymous' || name === 'Anonymous Donor' ? '' : name,
        address,
        phone,
        found: Boolean(result.donor || result.donations.length > 0),
      },
    });
  } catch (err) {
    console.error('[donor] me/profile', err);
    return res.status(500).json({
      error: 'DONOR_PROFILE_FAILED',
      message: 'Failed to load profile',
    });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  try {
    const session = await getDonorSession(req);
    if (!session?.user?.email) {
      return res.json({ ok: true, authenticated: false, user: null });
    }
    return res.json({
      ok: true,
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    });
  } catch (err) {
    return res.json({ ok: true, authenticated: false, user: null });
  }
});

/** Billing profile for Manage recurring gift (own Stripe customer only). */
router.get('/me/billing', async (req: Request, res: Response) => {
  try {
    const session = await getDonorSession(req);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }
    const donor = await findDonorByEmail(email);
    const stripeCustomerId = donor?.stripeCustomerId || '';
    return res.json({
      ok: true,
      hasStripeCustomer: Boolean(stripeCustomerId),
      stripeCustomerId: stripeCustomerId || undefined,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'BILLING_PROFILE_FAILED',
      message: 'Failed',
    });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch {
    // ignore
  }
  return res.json({ ok: true });
});

export default router;
