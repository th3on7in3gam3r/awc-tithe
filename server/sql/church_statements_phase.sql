-- Church identity, server audit, year-end statement idempotency.
-- Applied via server/db.ts ensureSchema. Does not delete existing rows.

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
);

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
);

CREATE INDEX IF NOT EXISTS activity_audit_at_idx ON activity_audit (at DESC);

CREATE TABLE IF NOT EXISTS year_end_statement_sends (
  donor_email TEXT NOT NULL,
  tax_year INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (donor_email, tax_year)
);

ALTER TABLE offline_gifts ADD COLUMN IF NOT EXISTS donor_email TEXT NOT NULL DEFAULT '';
ALTER TABLE offline_gifts ADD COLUMN IF NOT EXISTS donor_name TEXT NOT NULL DEFAULT '';
