import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type IntegrationStatus = {
  configured: boolean;
  mode: 'live' | 'sandbox' | 'simulator';
};

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export const env = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
  plaidClientId: process.env.PLAID_CLIENT_ID?.trim() || '',
  plaidSecret: process.env.PLAID_SECRET?.trim() || '',
  plaidEnv: (process.env.PLAID_ENV?.trim() || 'sandbox') as 'sandbox' | 'development' | 'production',
  awcDcbApiUrl: process.env.AWC_DCB_API_URL?.trim() || '',
  /** Shared HMAC secret with DCB (AWC_DCB_SERVICE_SECRET). AWC_DCB_API_KEY accepted as alias. */
  awcDcbServiceSecret:
    process.env.AWC_DCB_SERVICE_SECRET?.trim()
    || process.env.AWC_DCB_API_KEY?.trim()
    || '',
  awcDcbBookId: process.env.AWC_DCB_BOOK_ID?.trim() || 'AWC-DCB-2026-GCC',
  /** Optional AWC Vault CMS lead webhook for newcomer opt-in from Tithe */
  awcVaultInterestUrl: process.env.AWC_VAULT_INTEREST_URL?.trim() || '',
  awcVaultSetupUrl:
    process.env.AWC_VAULT_SETUP_URL?.trim()
    || 'https://anointedworshipcenter.com',
  /** Staff Portal invite/access code — never send to the browser. Accepts STAFF_INVITE_CODE alias. */
  staffAccessCode:
    process.env.STAFF_ACCESS_CODE?.trim()
    || process.env.STAFF_INVITE_CODE?.trim()
    || '',
};

export function databaseStatus(): IntegrationStatus {
  if (!present(env.databaseUrl)) {
    return { configured: false, mode: 'simulator' };
  }
  return { configured: true, mode: 'live' };
}

export function stripeStatus(): IntegrationStatus {
  const configured = present(env.stripeSecretKey) && present(env.stripePublishableKey);
  return {
    configured,
    mode: configured ? (env.stripeSecretKey.startsWith('sk_live') ? 'live' : 'sandbox') : 'simulator',
  };
}

export function plaidStatus(): IntegrationStatus {
  const configured = present(env.plaidClientId) && present(env.plaidSecret);
  return {
    configured,
    mode: configured ? (env.plaidEnv === 'production' ? 'live' : 'sandbox') : 'simulator',
  };
}

export function dcbStatus(): IntegrationStatus {
  if (!present(env.awcDcbApiUrl)) {
    return { configured: true, mode: 'sandbox' };
  }
  // Live URL requires the shared HMAC secret
  return {
    configured: present(env.awcDcbServiceSecret),
    mode: present(env.awcDcbServiceSecret) ? 'live' : 'simulator',
  };
}
