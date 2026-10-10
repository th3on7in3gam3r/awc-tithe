# Donor Privacy Phase 1 — manual test plan

## Schema (DDL)

Preview SQL lives in `server/sql/donor_privacy_phase1.sql` (Better Auth tables + `rate_limits`).
Applied idempotently on boot via `ensureSchema()` when `DATABASE_URL` is set.

## Give form (no enumeration)

1. Open Give with no My Giving session.
2. Enter any email → blur / submit fields.
3. Confirm: no “found / no prior gifts” messaging; no autofill from unverified email.
4. Confirm link copy: “Given before? Sign in to My Giving…”.

## Request-code anti-enumeration

1. `POST /api/donor/request-code` with a known donor email and an unknown email.
2. Both responses must match: `{ ok: true, message: "If we have gifts…" }` (same shape/timing pad).
3. Only known emails with prior gifts receive a code (check server logs for `[email] sendDonorCode DEV`).

## Session-bound gifts

1. Sign in to My Giving with OTP; load gifts.
2. `GET /api/donor/me/gifts` without cookie → 401.
3. Confirm gifts match only the signed-in email (cannot pass another email as a query param).

## Turnstile / min gift / rate limits

1. Without `TURNSTILE_SECRET_KEY` in non-production → requests succeed (bypass).
2. With secret set → missing token → 403 `TURNSTILE_FAILED`.
3. Gift / payment-intent under `MIN_GIFT_CENTS` → 400 `AMOUNT_TOO_LOW` / `INVALID_AMOUNT`.
4. Burst OTP or pay endpoints past env limits → 429.

## Build secret check

```bash
npm run build
# Must NOT appear in client bundle (use a real secret value if set locally):
grep -R "TURNSTILE_SECRET_KEY" dist/ || true
# Or grep the actual secret string — must be absent from dist/
```
