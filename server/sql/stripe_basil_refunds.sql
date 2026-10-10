-- Partial refunds. Does not delete existing rows.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
