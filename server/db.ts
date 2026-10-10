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
        stripe_customer_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`ALTER TABLE donors ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
    await client`ALTER TABLE donors ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;

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
        fund_code TEXT NOT NULL DEFAULT '',
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
        receipt_email_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_email_sent_at TIMESTAMPTZ`;
    await client`ALTER TABLE donations ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0`;
    await client`ALTER TABLE donations ALTER COLUMN fund_code SET DEFAULT ''`;

    await client`CREATE INDEX IF NOT EXISTS donations_donor_email_idx ON donations (LOWER(donor_email))`;
    await client`CREATE INDEX IF NOT EXISTS donations_contributed_at_idx ON donations (contributed_at DESC)`;

    // Better Auth tables (camelCase columns — see server/sql/donor_privacy_phase1.sql)
    await client`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
        image TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE`;
    await client`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        token TEXT NOT NULL UNIQUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS session_userId_idx ON session ("userId")`;
    await client`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" TIMESTAMPTZ,
        "refreshTokenExpiresAt" TIMESTAMPTZ,
        scope TEXT,
        password TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS account_userId_idx ON account ("userId")`;
    await client`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier)`;
    await client`
      CREATE TABLE IF NOT EXISTS "twoFactor" (
        id TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        "backupCodes" TEXT NOT NULL,
        "userId" TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT TRUE`;
    await client`ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "failedVerificationCount" INTEGER NOT NULL DEFAULT 0`;
    await client`ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ`;

    await client`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (key, window_start)
      )
    `;

    // Stripe webhook idempotency (see server/sql/stripe_webhook_phase.sql)
    await client`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payment_intent_id TEXT
      )
    `;
    await client`
      CREATE INDEX IF NOT EXISTS stripe_webhook_events_pi_idx
      ON stripe_webhook_events (payment_intent_id)
    `;

    // Funds / giving goals / offline gifts / staff roles (see server/sql/funds_goals_phase.sql)
    await client`
      CREATE TABLE IF NOT EXISTS funds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        gl_code TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`ALTER TABLE funds ADD COLUMN IF NOT EXISTS gl_code TEXT NOT NULL DEFAULT ''`;
    await client`
      CREATE TABLE IF NOT EXISTS giving_goals (
        fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        goal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (fund_id, year)
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS offline_gifts (
        id TEXT PRIMARY KEY,
        fund_id TEXT NOT NULL REFERENCES funds(id),
        amount NUMERIC(12,2) NOT NULL,
        gift_date DATE NOT NULL,
        entered_by TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`
      CREATE INDEX IF NOT EXISTS offline_gifts_fund_year_idx
      ON offline_gifts (fund_id, gift_date)
    `;
    await client`
      CREATE TABLE IF NOT EXISTS staff_accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        invite_code_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`
      ALTER TABLE offline_gifts ADD COLUMN IF NOT EXISTS donor_email TEXT NOT NULL DEFAULT ''
    `;
    await client`
      ALTER TABLE offline_gifts ADD COLUMN IF NOT EXISTS donor_name TEXT NOT NULL DEFAULT ''
    `;
    await client`
      CREATE TABLE IF NOT EXISTS church_settings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_entity_name TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city_state_zip TEXT NOT NULL DEFAULT '',
        ein TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        senior_pastor TEXT NOT NULL DEFAULT '',
        financial_officer TEXT NOT NULL DEFAULT '',
        tax_exempt_status TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL DEFAULT ''
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS activity_audit (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id TEXT NOT NULL,
        actor_label TEXT NOT NULL DEFAULT '',
        actor_role TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        resource TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        ip_address TEXT NOT NULL DEFAULT ''
      )
    `;
    await client`
      CREATE INDEX IF NOT EXISTS activity_audit_at_idx ON activity_audit (at DESC)
    `;
    await client`
      CREATE TABLE IF NOT EXISTS year_end_statement_sends (
        donor_email TEXT NOT NULL,
        tax_year INTEGER NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_by TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (donor_email, tax_year)
      )
    `;
    await client`ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS user_id TEXT`;
    await client`ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS email TEXT`;
    await client`ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS status TEXT`;
    await client`ALTER TABLE staff_accounts ALTER COLUMN invite_code_hash DROP NOT NULL`;
    await client`
      UPDATE staff_accounts
      SET status = CASE WHEN active THEN 'active' ELSE 'deactivated' END
      WHERE status IS NULL OR status = ''
    `;
    await client`
      CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_user_id_idx
      ON staff_accounts (user_id) WHERE user_id IS NOT NULL
    `;
    await client`
      CREATE TABLE IF NOT EXISTS staff_invites (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        invited_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS staff_session_activity (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS staff_session_mfa (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        verified_at TIMESTAMPTZ,
        failed_attempts INTEGER NOT NULL DEFAULT 0
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS staff_session_mfa_user_id_idx ON staff_session_mfa (user_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS staff_role_audit (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id TEXT NOT NULL,
        actor_label TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL,
        target_label TEXT NOT NULL DEFAULT '',
        old_role TEXT NOT NULL,
        new_role TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT ''
      )
    `;

    // Receipt number sequences — one per year, e.g. AWC-2026-000001
    // We create the current year's sequence at boot and create on-demand for future years.
    const currentYear = new Date().getFullYear();
    await client`
      CREATE SEQUENCE IF NOT EXISTS ${client.unsafe(`receipt_seq_${currentYear}`)}
      START 1 INCREMENT 1
    `;

    // DCB outbox — reliable async delivery to AWC Digital Contribution Book
    await client`
      CREATE TABLE IF NOT EXISTS dcb_outbox (
        id TEXT PRIMARY KEY,
        donation_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('contribution', 'refund')),
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'failed', 'needs_review')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        dcb_voucher_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (donation_id, event_type)
      )
    `;
    await client`
      CREATE INDEX IF NOT EXISTS dcb_outbox_worker_idx
        ON dcb_outbox (next_attempt_at)
        WHERE status = 'pending'
    `;
    await client`
      CREATE INDEX IF NOT EXISTS dcb_outbox_donation_idx
        ON dcb_outbox (donation_id)
    `;

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

/**
 * Allocate the next receipt number from a per-year Postgres sequence.
 * Format: AWC-2026-000123
 *
 * Called from within the pg.PoolClient transaction in handleWebhook.ts so the
 * sequence value is assigned atomically with the donation row.
 *
 * Falls back to a random number (dev/memory mode) when no pg client is available.
 */
export async function nextReceiptNumber(
  pgClient: import('pg').PoolClient,
  year: number
): Promise<string> {
  const seqName = `receipt_seq_${year}`;
  // Ensure the sequence exists for this year (idempotent)
  await pgClient.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1 INCREMENT 1`);
  const result = await pgClient.query(`SELECT nextval($1) AS n`, [seqName]);
  const n = Number(result.rows[0]?.n ?? 1);
  return `AWC-${year}-${String(n).padStart(6, '0')}`;
}

/**
 * Fallback receipt number for the in-memory (dev) store.
 * Uses Math.random — acceptable for local dev only.
 */
export function devReceiptNumber(year: number): string {
  return `AWC-${year}-${String(Math.floor(1 + Math.random() * 999999)).padStart(6, '0')}`;
}
