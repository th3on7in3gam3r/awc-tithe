import { betterAuth } from 'better-auth';
import { emailOTP, phoneNumber } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { allowedOrigins, env, isProduction, memoryStoreAllowed } from '../config';
import { sendDonorCode } from '../email/sendDonorCode';
import { getPgPool } from './pgPool';
import { emailHasPriorGifts } from '../gifts/privacy';
import { checkPhoneCode, normalizeUsPhone } from '../sms/verify';

// No fallback secret — assertProductionEnv() in index.ts already exits if missing.
// A dev environment without BETTER_AUTH_SECRET gets a clear warning at boot, not
// a silent hardcoded value that could accidentally reach a real auth endpoint.
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
 * Better Auth for donor My Giving (email OTP).
 * Uses Neon pg Pool when DATABASE_URL is set; otherwise in-memory adapter for dev only.
 */
export const auth = betterAuth({
  // Memory adapter needs its tables up front (dev/test only).
  database: pool ?? memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  secret: env.betterAuthSecret,
  baseURL,
  trustedOrigins: allowedOrigins(),
  basePath: '/api/auth',
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: {
    cookiePrefix: 'awc-donor',
    useSecureCookies: isProduction(),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
    },
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
        // Anti-enumeration: never email unknown addresses
        const hasGifts = await emailHasPriorGifts(email);
        if (!hasGifts) return;
        await sendDonorCode(email, otp);
      },
    }),
    /**
     * Phone sign-in. Codes are sent only by POST /api/donor/phone/request-code
     * (bot check + rate limits + daily cap) through Twilio Verify; the plugin's
     * own send/password routes are blocked in server/index.ts. Only
     * /api/auth/phone-number/verify is reachable, and it checks with Twilio.
     * A phone is linked to an account only by a signed-in donor (updatePhoneNumber);
     * an unknown phone never creates an account.
     */
    phoneNumber({
      otpLength: 6,
      expiresIn: 600,
      sendOTP() {
        console.warn('[phone] plugin sendOTP called — codes go through /api/donor/phone/request-code');
      },
      async verifyOTP({ phoneNumber: phone, code }) {
        const e164 = normalizeUsPhone(phone);
        if (!e164 || e164 !== phone) return false;
        return checkPhoneCode(e164, code);
      },
      phoneNumberValidator: (phone) => normalizeUsPhone(phone) === phone,
    }),
  ],
});

export type Auth = typeof auth;
