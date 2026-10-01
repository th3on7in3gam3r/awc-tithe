import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { env } from './config';

export type SqlClient = NeonQueryFunction<false, false>;

let sql: SqlClient | null = null;
let schemaReady = false;

export function hasDatabaseUrl(): boolean {
  return Boolean(env.databaseUrl);
}

export function getSql(): SqlClient | null {
  if (!env.databaseUrl) return null;
  if (!sql) {
    sql = neon(env.databaseUrl);
  }
  return sql;
}

export async function ensureSchema(): Promise<{ ok: boolean; mode: 'neon' | 'memory'; error?: string }> {
  const client = getSql();
  if (!client) {
    return { ok: true, mode: 'memory' };
  }

  try {
    await client`
      CREATE TABLE IF NOT EXISTS donors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        tax_id TEXT,
        lifetime_giving NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_gifts_count INTEGER NOT NULL DEFAULT 0,
        first_gift_date TIMESTAMPTZ NOT NULL,
        last_gift_date TIMESTAMPTZ NOT NULL,
        recurring_active BOOLEAN NOT NULL DEFAULT FALSE,
        recurring_amount NUMERIC(12,2),
        recurring_frequency TEXT,
        gdpr_consent BOOLEAN NOT NULL DEFAULT TRUE,
        gdpr_consent_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await client`
      CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL UNIQUE,
        receipt_number TEXT NOT NULL UNIQUE,
        donor_id TEXT NOT NULL REFERENCES donors(id),
        donor_name TEXT NOT NULL,
        donor_email TEXT NOT NULL,
        donor_address TEXT,
        amount NUMERIC(12,2) NOT NULL,
        fee_covered BOOLEAN NOT NULL DEFAULT FALSE,
        fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_charged NUMERIC(12,2) NOT NULL,
        frequency TEXT NOT NULL,
        fund_id TEXT NOT NULL,
        fund_name TEXT NOT NULL,
        fund_code TEXT NOT NULL DEFAULT '1001-OPS',
        payment_method TEXT NOT NULL,
        card_brand TEXT,
        card_last4 TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        dedication TEXT,
        is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
        contributed_at TIMESTAMPTZ NOT NULL,
        next_billing_date TIMESTAMPTZ,
        stripe_payment_intent_id TEXT,
        plaid_transfer_id TEXT,
        plaid_institution TEXT,
        plaid_account_mask TEXT,
        awc_dcb_voucher TEXT,
        awc_synced BOOLEAN NOT NULL DEFAULT FALSE,
        encrypted_token TEXT NOT NULL DEFAULT '',
        envelope_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await client`CREATE INDEX IF NOT EXISTS donations_donor_email_idx ON donations (LOWER(donor_email))`;
    await client`CREATE INDEX IF NOT EXISTS donations_contributed_at_idx ON donations (contributed_at DESC)`;

    schemaReady = true;
    return { ok: true, mode: 'neon' };
  } catch (err) {
    console.error('[db] ensureSchema failed', err);
    return {
      ok: false,
      mode: 'neon',
      error: err instanceof Error ? err.message : 'Schema migration failed',
    };
  }
}

export function isSchemaReady(): boolean {
  return schemaReady;
}
