# AWC Tithe

Church giving front door for **AWC**. Every online gift is a Stripe Payment Element charge (card, Apple Pay, Google Pay, or US bank account). Recurring gifts are Stripe Subscriptions. Donation rows are written only by the verified Stripe webhook.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install` (or `npm install --legacy-peer-deps` if peer deps conflict)
2. Copy env placeholders: `cp .env.example .env.local` and set Stripe test keys plus `STRIPE_WEBHOOK_SECRET` from `stripe listen`. Without Stripe keys the Give page says online giving is unavailable; without the webhook signing secret, webhook events are rejected and no gifts are written.
3. In the Stripe Dashboard, the webhook endpoint API version must be **`2025-08-27.basil`** (same as this app’s Stripe client). Using an older endpoint version will drop subscription fields Tithe needs.
4. Run web + API together:
   `npm run dev:all`
   - Web: http://127.0.0.1:3000
   - API: http://127.0.0.1:3001 (`GET /api/health`, `GET /api/config`)

### Render env vars (live rails)

Set these on the **awc-tithe** Web Service:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string (durable gifts / tax portal) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (browser) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `AWC_DCB_API_URL` | DCB base URL (e.g. `https://your-dcb.onrender.com`) |
| `AWC_DCB_KEY_TITHE` | Per-app HMAC key DCB issues for Tithe (`X-AWC-Key-Id: tithe`) |
| `DCB_REQUIRED` | Set `true` in production to refuse boot if DCB vars are missing |
| `BETTER_AUTH_SECRET` | Signs donor and staff sessions. Required in production. |

Without Stripe keys the Give page shows “Online giving is temporarily unavailable.” Without `DATABASE_URL`, gifts persist in API memory until restart. `npm run recompute-donor-totals` prints a dry-run diff of donor lifetime totals; add `--apply` to write them.

**Neon:** create a project at [neon.tech](https://neon.tech), copy the **pooled** connection string into `DATABASE_URL` (local `.env.local` and Render). Confirm Integrations & Settings → Database shows Live.

### Giving

The Give form uses one Stripe Payment Element for cards, Apple Pay, Google Pay, and US bank accounts through Stripe Financial Connections. Covering the fee updates the PaymentIntent on the server before confirmation. One-time gifts are PaymentIntents. Weekly, bi-weekly, monthly, and annual gifts are Stripe Subscriptions. The browser shows a processing confirmation and polls `GET /api/stripe/payment-status/:paymentIntentId`; only verified Stripe webhooks create donation rows. My Giving’s Customer Portal manages the real subscriptions.

### Bridge to DCB

Completed gifts are queued in `dcb_outbox` inside the same Stripe webhook transaction that writes the donation. A background worker delivers pending rows with backoff. DCB is never called from a webhook or request handler.

1. On **Tithe**: set `AWC_DCB_API_URL` to the DCB base URL and `AWC_DCB_KEY_TITHE` to the per-app key DCB issued for Tithe.
2. Tithe POSTs to `/api/public/giving/contributions` with `X-AWC-Key-Id: tithe`, `X-AWC-Timestamp`, `X-AWC-Signature` (HMAC-SHA256 of `timestamp.body` with `AWC_DCB_KEY_TITHE`), and `Idempotency-Key` set to the full Stripe PaymentIntent or invoice ID.
3. The payload includes `source: "awc-tithe-bridge"`, `amount`, `donorName` (`Anonymous` when the donor opts in), and `voucherNumber` from the receipt number.
4. If those env vars are missing, outbox rows stay pending and boot logs a warning. With `DCB_REQUIRED=true`, the process refuses to start.
5. Refunds write a `needs_review` outbox row until DCB has a refund endpoint. See [`docs/dcb-refund-endpoint.md`](docs/dcb-refund-endpoint.md). Admins retry failed contribution rows from Staff Portal → DCB Sync. Schema: [`server/sql/dcb_outbox.sql`](server/sql/dcb_outbox.sql).

### Free-tier cold start (Render sleep)

Free Render web services sleep after ~15 minutes idle. The first request after sleep waits for the instance to wake; AWC Tithe shows a branded boot splash once HTML is served.

To reduce sleep (does not make free tier “always on” by itself), ping health every **10–14 minutes** from an external monitor:

- URL: `https://awc-tithe.onrender.com/api/health` (or your service URL)
- Tools: [UptimeRobot](https://uptimerobot.com/), cron-job.org, Render Cron, or the repo workflow [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml)
- For GitHub Actions: add secret `RENDER_HEALTH_URL` = that health URL

### Gift ledger APIs (extended)

- `POST /api/gifts` — removed. The Stripe webhook is the only donation writer.
- `POST /api/gifts/offline` — staff cash/check log into `offline_gifts` (does not create a donation row)
- `GET /api/gifts` — staff ledger list (requires staff session)
- `POST /api/stripe/create-payment-intent` — one-time PaymentIntent or incomplete Subscription; sets a short-lived signed cookie
- `POST /api/stripe/update-payment-intent` — server recomputes the fee and updates the PaymentIntent amount
- `GET /api/stripe/payment-status/:paymentIntentId` — `{ status, receiptNumber? }` for a PaymentIntent in that cookie
- `POST /api/stripe/webhook` — signature verify, then a transaction that inserts the event id before processing
- `POST /api/donor/request-code` — anti-enumeration OTP request (uniform response)
- `GET /api/donor/me/gifts` — session-bound donor gifts (Better Auth cookie)
- `GET /api/donor/me/profile` — session-bound prefill for Give form
- `POST /api/donor/logout` — end donor session
- `GET /api/dcb/outbox` — admin: failed and needs_review DCB rows
- `POST /api/dcb/outbox/:id/retry` — admin: re-queue a row (payload rebuilt from the database)
- `/api/auth/*` — Better Auth (email OTP)
- Staff Portal sign-in is individual Better Auth email OTP at `/api/staff-auth`, separate from donor My Giving. Staff must have an active `staff_accounts` row linked to their Better Auth user. Admins must enroll and verify an authenticator before using staff features; staff may enroll optionally. Staff sessions have a 12-hour absolute lifetime and a 30-minute idle timeout; donor sessions retain their 30-day lifetime.
- Admin invitations are emailed, single-use, and expire after 72 hours. The staff schema migration is [`server/sql/staff_accounts_phase.sql`](server/sql/staff_accounts_phase.sql); the server also ensures the Better Auth/TOTP tables at startup. To bootstrap the first administrator, run `npm run create-admin -- email@example.com`. It refuses when an active admin already exists and prints the one-time invite link.

Public `GET /api/gifts/by-email` was removed (donor privacy). See `docs/privacy-phase1-test-plan.md`.
Stripe fee/webhook checks: [`docs/stripe-webhook-test-plan.md`](docs/stripe-webhook-test-plan.md).

Set church legal/support fields in Render env (`CHURCH_LEGAL_NAME`, `CHURCH_ADDRESS`, `CHURCH_CITY_STATE_ZIP`, `CHURCH_EIN`, `CHURCH_PHONE`, `CHURCH_SUPPORT_EMAIL`, etc.) — see `.env.example`. Address for AWC: `4 School St` / `Acton, MA 01720`. Leave `CHURCH_EIN` blank until the Pastor provides it; blank values are omitted from the footer and receipts (no fake EIN).
