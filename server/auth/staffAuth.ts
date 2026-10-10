import { betterAuth } from 'better-auth';
import { emailOTP, twoFactor } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { allowedOrigins, env, isProduction, memoryStoreAllowed } from '../config';
import { sendDonorCode } from '../email/sendDonorCode';
import { getPgPool } from './pgPool';
import { emailEligibleForStaffOtp } from './staffRoles';
import { markStaffSessionMfaVerified, recordStaffMfaFailure } from './staffMfa';

// Shared secret with betterAuth.ts — assertProductionEnv() already validated it.
if (!env.betterAuthSecret) {
  throw new Error(
    'BETTER_AUTH_SECRET is required. Set it in .env.local (dev) or the Render dashboard (prod).'
  );
}

const baseURL = env.betterAuthUrl || `http://127.0.0.1:${env.port}`;
const pool = getPgPool();
if (!pool && !memoryStoreAllowed()) {
  throw new Error('DATABASE_URL is required (set DEV_MEMORY_STORE=true only for local/test memory auth).');
}

/**
 * Staff Portal auth. Separate cookie prefix and 12-hour sessions.
 * Donor auth stays on /api/auth with a 30-day session.
 */
export const staffAuth = betterAuth({
  database: pool ?? memoryAdapter({}),
  secret: env.betterAuthSecret,
  baseURL,
  trustedOrigins: allowedOrigins(),
  basePath: '/api/staff-auth',
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60,
    cookieCache: { enabled: false },
  },
  advanced: {
    cookiePrefix: 'awc-staff',
    useSecureCookies: isProduction(),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      if (path !== '/two-factor/verify-totp' && path !== '/two-factor/verify-backup-code') return;
      const session = await getSessionFromCtx(ctx).catch(() => null);
      if (!session?.session?.id || !session.user?.id) return;
      const returned = ctx.context.returned;
      if (isAPIError(returned) || (returned && typeof returned === 'object' && 'status' in returned && Number((returned as { status: number }).status) >= 400)) {
        await recordStaffMfaFailure(session.session.id, session.user.id);
        return;
      }
      await markStaffSessionMfaVerified(session.session.id, session.user.id);
    }),
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      disableSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'sign-in') return;
        const allowed = await emailEligibleForStaffOtp(email);
        if (!allowed) {
          console.info(`[staff-auth] sign-in code requested for ineligible email (not sent)`);
          return;
        }
        await sendDonorCode(email, otp);
      },
    }),
    twoFactor({
      issuer: 'AWC Tithe',
      allowPasswordless: true,
      skipVerificationOnEnable: false,
    }),
  ],
});
