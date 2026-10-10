-- Per-session MFA verification for Staff Portal admins. Does not delete existing rows.
CREATE TABLE IF NOT EXISTS staff_session_mfa (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS staff_session_mfa_user_id_idx ON staff_session_mfa (user_id);
