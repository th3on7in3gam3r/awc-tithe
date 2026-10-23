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
  sha256Hex,
} from '../middleware/rateLimit';
import { env } from '../config';
import { maskE164, normalizeUsPhone, phoneSignInEnabled, sendPhoneCode } from '../sms/verify';
import { findUserByPhone, getUserPhone, phoneTakenByOther, removeUserPhone } from '../auth/donorPhone';

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

// ---------------------------------------------------------------------------
// Phone sign-in (Twilio Verify). Codes go out only from here.
// ---------------------------------------------------------------------------

const UNIFORM_PHONE_CODE = {
  ok: true as const,
  message: 'If this phone is set up for My Giving, a 6-digit code is on its way by text.',
};

const HOUR = 60 * 60 * 1000;
const smsPhoneWindow = { windowMs: HOUR, max: env.rateLimitSmsPhonePerHour };
const smsIpWindow = { windowMs: HOUR, max: env.rateLimitSmsIpPerHour };
const smsDayWindow = { windowMs: 24 * HOUR, max: env.smsCodeDailyCap };

/** Is phone sign-in on, and which phone (masked) is linked to the signed-in donor? */
router.get('/phone', async (req: Request, res: Response) => {
  const enabled = phoneSignInEnabled();
  let phone: string | null = null;
  try {
    const session = await getDonorSession(req);
    if (enabled && session?.user?.id) phone = await getUserPhone(session.user.id);
  } catch {
    // signed out
  }
  return res.json({ ok: true, enabled, linkedPhone: maskE164(phone) });
});

/**
 * purpose "sign-in": anyone; texts a code only to a phone already linked to an
 * account, and answers the same either way.
 * purpose "link": signed-in donor adding their phone to My Giving.
 */
router.post('/phone/request-code', requireTurnstile, async (req: Request, res: Response) => {
  if (!phoneSignInEnabled()) {
    return res.status(503).json({ error: 'PHONE_SIGN_IN_OFF', message: 'Text sign-in is not available right now.' });
  }
  const purpose = req.body?.purpose === 'link' ? 'link' : 'sign-in';
  const phone = normalizeUsPhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ error: 'INVALID_PHONE', message: 'Enter a 10-digit US mobile number.' });
  }

  let userId: string | null = null;
  if (purpose === 'link') {
    const session = await getDonorSession(req).catch(() => null);
    userId = session?.user?.id || null;
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign in with your email first.' });
    }
    if (await phoneTakenByOther(phone, userId)) {
      return res.status(409).json({
        error: 'PHONE_IN_USE',
        message: 'That number is already used for another My Giving account.',
      });
    }
  }

  const started = Date.now();
  let limited = false;
  try {
    const [phoneLimit, ipLimit] = await Promise.all([
      checkRateLimit(`sms:phone:${sha256Hex(phone)}`, smsPhoneWindow),
      checkRateLimit(`sms:ip:${clientIp(req)}`, smsIpWindow),
    ]);
    limited = !phoneLimit.allowed || !ipLimit.allowed;
    const eligible = !limited && (purpose === 'link' || Boolean(await findUserByPhone(phone)));
    if (eligible) {
      const day = await checkRateLimit('sms:day:all', smsDayWindow);
      if (!day.allowed) {
        console.warn('[phone] daily sign-in text cap reached (SMS_CODE_DAILY_CAP)');
        limited = true;
      } else {
        await sendPhoneCode(phone);
      }
    }
  } catch (err) {
    console.warn('[phone] request-code', err instanceof Error ? err.message : err);
    if (purpose === 'link') {
      return res.status(502).json({ error: 'SEND_FAILED', message: 'We could not send a text right now. Try again shortly.' });
    }
  }

  if (purpose === 'link' && limited) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many codes requested. Please wait an hour and try again.' });
  }

  const elapsed = Date.now() - started;
  if (elapsed < 150) await new Promise((r) => setTimeout(r, 150 - elapsed));
  return res.json(purpose === 'link' ? { ok: true, message: 'Code sent. Check your texts.' } : UNIFORM_PHONE_CODE);
});

/** Stop using text sign-in for this account. */
router.post('/phone/remove', async (req: Request, res: Response) => {
  const session = await getDonorSession(req).catch(() => null);
  if (!session?.user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' });
  await removeUserPhone(session.user.id);
  return res.json({ ok: true });
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
    const { listManualGiftsForDonor } = await import('../manualGifts/store');
    const manual = await listManualGiftsForDonor(email);
    const manualAsDonations = manual.map((g) => ({
      id: g.id,
      transactionId: g.id,
      receiptNumber: g.memoCode,
      donorId: result.donor?.id || '',
      donorName: g.donorName,
      donorEmail: email,
      amount: g.amount,
      feeCovered: false,
      feeAmount: 0,
      totalCharged: g.amount,
      frequency: 'one-time' as const,
      fundId: g.fundId,
      fundName: g.fundName,
      fundCode: g.fundCode,
      paymentMethod: g.provider,
      status: g.status === 'rejected' ? ('failed' as const) : ('pending' as const),
      /** Pending Finance confirmation, or Finance could not find the payment. */
      manualReview: g.status === 'rejected' ? ('not_found' as const) : ('pending' as const),
      isAnonymous: g.isAnonymous,
      timestamp: g.submittedAt || g.createdAt,
      awcSynced: false,
      encryptedToken: '',
    }));
    const donations = [...result.donations, ...offlineAsDonations, ...manualAsDonations].sort((a, b) =>
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
