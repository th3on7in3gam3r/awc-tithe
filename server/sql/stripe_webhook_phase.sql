-- Stripe webhook idempotency + gift status (applied via server/db.ts ensureSchema)

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_intent_id TEXT
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_pi_idx
  ON stripe_webhook_events (payment_intent_id);

-- donations.status already exists: completed | pending | refunded | failed
