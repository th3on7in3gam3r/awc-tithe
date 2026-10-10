-- DCB outbox. Does not delete existing rows.
-- Also applied by ensureSchema in server/db.ts.

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
);

CREATE INDEX IF NOT EXISTS dcb_outbox_worker_idx
  ON dcb_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS dcb_outbox_donation_idx
  ON dcb_outbox (donation_id);
