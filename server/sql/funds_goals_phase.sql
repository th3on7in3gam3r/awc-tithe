-- Funds, giving goals, offline gifts, staff accounts (admin vs staff)
-- Applied idempotently via server/db.ts ensureSchema.

CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  gl_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS giving_goals (
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  goal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (fund_id, year)
);

CREATE TABLE IF NOT EXISTS offline_gifts (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  amount NUMERIC(12,2) NOT NULL,
  gift_date DATE NOT NULL,
  entered_by TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offline_gifts_fund_year_idx
  ON offline_gifts (fund_id, gift_date);

CREATE TABLE IF NOT EXISTS staff_accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  invite_code_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);
