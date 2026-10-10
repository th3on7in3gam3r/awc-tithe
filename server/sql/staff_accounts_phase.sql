-- Individual staff accounts. Does not delete existing rows.
-- Legacy invite-code rows stay, but they no longer authorize anyone (no user_id).

ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE staff_accounts ALTER COLUMN invite_code_hash DROP NOT NULL;

UPDATE staff_accounts
SET status = CASE WHEN active THEN 'active' ELSE 'deactivated' END
WHERE status IS NULL OR status = '';
ALTER TABLE staff_accounts ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE staff_accounts ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_accounts_status_check'
  ) THEN
    ALTER TABLE staff_accounts
      ADD CONSTRAINT staff_accounts_status_check
      CHECK (status IN ('active', 'deactivated')) NOT VALID;
  END IF;
END $$;
ALTER TABLE staff_accounts VALIDATE CONSTRAINT staff_accounts_status_check;

CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_user_id_idx
  ON staff_accounts (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_session_activity (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL
);

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "twoFactor"
  ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "twoFactor"
  ADD COLUMN IF NOT EXISTS "failedVerificationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "twoFactor"
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ;
