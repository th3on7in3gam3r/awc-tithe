import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type IntegrationStatus = {
  configured: boolean;
  mode: 'live' | 'sandbox' | 'not_configured';
};

// ---------------------------------------------------------------------------
// Single source of truth for the runtime environment.
// Use isProduction() everywhere instead of checking process.env.NODE_ENV directly.
// ---------------------------------------------------------------------------

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export const env = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
  awcDcbApiUrl: process.env.AWC_DCB_API_URL?.trim() || '',
  /** Per-app HMAC key for AWC-Tithe bridge. DCB verifies X-AWC-Key-Id: tithe. */
  awcDcbKeyTithe: process.env.AWC_DCB_KEY_TITHE?.trim() || '',
  /**
   * Set DCB_REQUIRED=true in production to refuse boot when DCB vars are absent.
   * Defaults to false so dev/staging can run without DCB configured.
   */
  dcbRequired: process.env.DCB_REQUIRED?.trim() === 'true',
  /** Resend — contribution receipts (server-only) */
  resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
  receiptFromEmail:
    process.env.RECEIPT_FROM_EMAIL?.trim()
    || process.env.EMAIL_FROM?.trim()
    || '',
  /** Public site URL for Stripe Customer Portal return and CORS allow-list. */
  publicAppUrl:
    process.env.PUBLIC_APP_URL?.trim()
    || process.env.BETTER_AUTH_URL?.trim()
    || 'http://127.0.0.1:3000',

  /** Public church identity — optional; omit blank segments in UI when unset */
  churchLegalName: process.env.CHURCH_LEGAL_NAME?.trim() || '',
  churchAddress: process.env.CHURCH_ADDRESS?.trim() || '',
  churchCityStateZip: process.env.CHURCH_CITY_STATE_ZIP?.trim() || '',
  churchEin: process.env.CHURCH_EIN?.trim() || '',
  churchPhone: process.env.CHURCH_PHONE?.trim() || '',
  churchSupportEmail:
    process.env.CHURCH_SUPPORT_EMAIL?.trim()
    || 'stewardship@anointedworshipcenter.com',
  churchWebsite:
    process.env.CHURCH_WEBSITE?.trim()
    || 'https://anointedworshipcenter.com',
  churchName: process.env.CHURCH_NAME?.trim() || 'Anointed Worship Center',
  /** Better Auth (donor My Giving email OTP) */
  betterAuthSecret: process.env.BETTER_AUTH_SECRET?.trim() || '',
  betterAuthUrl: process.env.BETTER_AUTH_URL?.trim() || '',
  /** Cloudflare Turnstile — server secret only (never VITE_) */
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY?.trim() || '',
  /** Minimum gift in cents (default $5.00) */
  minGiftCents: Math.max(50, Number(process.env.MIN_GIFT_CENTS || 500) || 500),
  rateLimitOtpEmailPerHour: Math.max(1, Number(process.env.RATE_LIMIT_OTP_EMAIL_PER_HOUR || 5) || 5),
  rateLimitOtpIpPerHour: Math.max(1, Number(process.env.RATE_LIMIT_OTP_IP_PER_HOUR || 10) || 10),
  rateLimitPayIpPer10Min: Math.max(1, Number(process.env.RATE_LIMIT_PAY_IP_PER_10MIN || 10) || 10),
  /**
   * DEV_MEMORY_STORE=true lets local dev run without DATABASE_URL.
   * Always rejected when NODE_ENV=production (see assertProductionEnv).
   */
  devMemoryStore: process.env.DEV_MEMORY_STORE?.trim() === 'true',
};

/** In-memory gifts/auth/audit/rate-limit only when opted in and not production. */
export function memoryStoreAllowed(): boolean {
  return env.devMemoryStore && !isProduction();
}

// ---------------------------------------------------------------------------
// Production boot guard
// All checks run once at startup via assertProductionEnv() called from index.ts.
// ---------------------------------------------------------------------------

const REQUIRED_PRODUCTION_VARS: Array<{ key: keyof typeof env; label: string; minLength?: number }> = [
  { key: 'databaseUrl',        label: 'DATABASE_URL' },
  { key: 'betterAuthSecret',   label: 'BETTER_AUTH_SECRET', minLength: 32 },
  { key: 'stripeSecretKey',    label: 'STRIPE_SECRET_KEY' },
  { key: 'stripePublishableKey', label: 'STRIPE_PUBLISHABLE_KEY' },
  { key: 'stripeWebhookSecret',  label: 'STRIPE_WEBHOOK_SECRET' },
  { key: 'turnstileSecretKey', label: 'TURNSTILE_SECRET_KEY' },
  { key: 'resendApiKey',       label: 'RESEND_API_KEY' },
  { key: 'receiptFromEmail',   label: 'RECEIPT_FROM_EMAIL (or EMAIL_FROM)' },
  { key: 'publicAppUrl',       label: 'PUBLIC_APP_URL' },
];

/**
 * Call once at boot. In production, exits the process with a clear message if
 * any required variable is missing or below its minimum length.
 * In development, logs a warning instead.
 */
export function assertProductionEnv(): void {
  if (env.devMemoryStore && isProduction()) {
    console.error('[boot] DEV_MEMORY_STORE=true is not allowed in production. Exiting.');
    process.exit(1);
  }

  const errors: string[] = [];

  for (const spec of REQUIRED_PRODUCTION_VARS) {
    const value = env[spec.key] as string;
    if (!present(value)) {
      errors.push(`  ✗ ${spec.label} is not set`);
    } else if (spec.minLength && value.length < spec.minLength) {
      errors.push(
        `  ✗ ${spec.label} is set but too short (${value.length} chars; need ≥ ${spec.minLength})`
      );
    }
  }

  // PUBLIC_APP_URL must not fall back to localhost in production
  if (
    env.publicAppUrl.includes('127.0.0.1') ||
    env.publicAppUrl.includes('localhost')
  ) {
    errors.push('  ✗ PUBLIC_APP_URL resolves to localhost — set it to the Render service URL');
  }

  if (errors.length > 0) {
    if (isProduction()) {
      console.error(
        '[boot] Production environment check failed — refusing to start.\n' +
        errors.join('\n') +
        '\n\nSet the missing values in the Render dashboard under Environment Variables.'
      );
      process.exit(1);
    } else {
      console.warn(
        '[boot] Development environment is missing some production vars (OK for local dev):\n' +
        errors.join('\n')
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Allowed CORS origins
// ---------------------------------------------------------------------------

/**
 * Returns the list of origins that may make credentialed cross-site requests.
 * In production: only PUBLIC_APP_URL.
 * In development: PUBLIC_APP_URL plus http://localhost:3000 and http://127.0.0.1:3000.
 */
export function allowedOrigins(): string[] {
  const prod = env.publicAppUrl.replace(/\/$/, '');
  if (isProduction()) return [prod];
  return [...new Set([prod, 'http://localhost:3000', 'http://127.0.0.1:3000'])];
}

// ---------------------------------------------------------------------------
// Integration status helpers
// ---------------------------------------------------------------------------

export function databaseStatus(): IntegrationStatus {
  if (!present(env.databaseUrl)) {
    return { configured: false, mode: 'not_configured' };
  }
  return { configured: true, mode: 'live' };
}

export function stripeStatus(): IntegrationStatus {
  const configured =
    present(env.stripeSecretKey) &&
    present(env.stripePublishableKey) &&
    present(env.stripeWebhookSecret);
  return {
    configured,
    mode: configured ? (env.stripeSecretKey.startsWith('sk_live') ? 'live' : 'sandbox') : 'not_configured',
  };
}

