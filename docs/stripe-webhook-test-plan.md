# Stripe fees + webhook — manual test plan

## Shared fees

1. On Give, toggle “cover fees” for card/wallet and US bank account — label matches `shared/fees.ts` (card `2.9%+$0.30`, bank `min($5, 0.8%)`).
2. Create a PaymentIntent with cover fees on; response includes `principalAmount`, `feeAmount`, `totalCharged`.
3. Confirm Stripe Dashboard PI amount equals `totalCharged` cents (not a client-summed total).

## Raw-body webhook

1. Endpoint: `POST /api/stripe/webhook` (mounted **before** `express.json`).
2. With `STRIPE_WEBHOOK_SECRET` set, a request without valid `Stripe-Signature` returns 400.
3. Stripe CLI: `stripe listen --forward-to localhost:3001/api/stripe/webhook` then trigger `payment_intent.succeeded`.
4. Replay the same event id twice — second response includes `duplicate: true`; only one donation row for that PI.
5. Force processing to throw after the idempotency insert — response must be 500, no event id or donation persists, and Stripe retry succeeds.

## Gift status

1. `payment_intent.processing` → donation `status` becomes `pending`; `payment_intent.succeeded` → `completed`.
2. `invoice.paid` creates one completed donation per invoice; `invoice.payment_failed` creates/marks one failed donation and sends a My Giving email.
3. `customer.subscription.deleted` marks the recurring gift inactive; `charge.refunded` marks a completed donation `refunded`.
4. Event ids live in Neon `stripe_webhook_events` in the same transaction as donation/outbox writes.

## Recurring gifts

Use a Stripe test clock to create a monthly subscription and advance it through two paid invoices. Verify each invoice id has exactly one donation row and one receipt. Test a failing US bank account and verify it remains failed until a later paid invoice.

## Polling privacy

1. Payment status is available only when the signed, short-lived browser cookie contains that PaymentIntent id.
2. The status response contains only `status` and (for completed gifts) `receiptNumber`.
3. `GET /api/dcb/mock/entries`, `GET/POST /api/vault/interest`, and public `POST /api/gifts` return 404.

## Secrets

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are server-only (never `VITE_`).
- After `npm run build`, grep `dist/` — secret values and `STRIPE_WEBHOOK_SECRET` must be absent.
