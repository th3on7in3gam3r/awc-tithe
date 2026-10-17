-- Zelle / Venmo / Cash App gifts confirmed by Finance.
-- The server creates this automatically at boot (server/manualGifts/store.ts).
-- Kept here for reference or for running by hand in the Neon SQL editor.

CREATE TABLE IF NOT EXISTS manual_gifts (
  id TEXT PRIMARY KEY,
  memo_code TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('zelle', 'venmo', 'cash_app')),
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'submitted', 'verified', 'rejected')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  fund_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  fund_code TEXT NOT NULL DEFAULT '',
  donor_name TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  claim_token_hash TEXT,
  donor_reference TEXT NOT NULL DEFAULT '',
  provider_transaction_id TEXT,
  received_amount NUMERIC(12,2),
  received_on DATE,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  donation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One provider transaction ID can be verified once (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS manual_gifts_provider_txn_uq
  ON manual_gifts (provider, lower(provider_transaction_id))
  WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS manual_gifts_status_idx ON manual_gifts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS manual_gifts_email_idx ON manual_gifts (donor_email);
