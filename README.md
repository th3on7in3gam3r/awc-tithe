# AWC Tithe

Church giving front door for **AWC** — cards via Stripe, bank ACH via Plaid (equal donor choice), settlement to **DCU Credit Union**, contribution ledger bridge to the **AWC Digital Contribution Book (DCB)**.

Card numbers and bank credentials never touch AWC Tithe servers — Stripe Elements and Plaid Link collect them. Tithe stores gift metadata (amount, fund, name or Anonymous, email, receipt IDs) and posts to DCB.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install` (or `npm install --legacy-peer-deps` if peer deps conflict)
2. Copy env placeholders: `cp .env.example .env.local` (keys optional — simulator works without them)
3. Run web + API together:
   `npm run dev:all`
   - Web: http://127.0.0.1:3000
   - API: http://127.0.0.1:3001 (`GET /api/health`, `GET /api/config`)

### Render env vars (live rails)

Set these on the **awc-tithe** Web Service:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string (durable gifts / tax portal) |
| `AWC_VAULT_INTEREST_URL` | Optional Vault CMS webhook for newcomer opt-in leads |
| `AWC_VAULT_SETUP_URL` | Link shown after Vault opt-in (member setup / church site) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (browser) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `PLAID_CLIENT_ID` | Plaid client id |
| `PLAID_SECRET` | Plaid secret |
| `PLAID_ENV` | `sandbox` / `development` / `production` |
| `AWC_DCB_API_URL` | DCB base URL (e.g. `https://your-dcb.onrender.com`) |
| `AWC_DCB_SERVICE_SECRET` | Shared HMAC secret with DCB (`AWC_DCB_API_KEY` is an alias) |
| `AWC_DCB_BOOK_ID` | Contribution book id |
| `STAFF_ACCESS_CODE` | Staff Portal invite code |
| `STAFF_TOTP_SECRET` | Optional base32 authenticator secret (production MFA) |

Without Stripe/Plaid keys the Give form uses the built-in simulator (Card and Plaid Bank tabs still both shown). Without `DATABASE_URL`, gifts persist in API memory until restart.

**Neon:** create a project at [neon.tech](https://neon.tech), copy the **pooled** connection string into `DATABASE_URL` (local `.env.local` and Render). Confirm Integrations & Settings → Database shows Live.

### Guided giving

On **Give Now**, choose **Start guided giving** for a step-by-step walkthrough (welcome, returning/new, optional AWC Vault CMS opt-in, frequency, identity, Stripe or Plaid, confirm, send). The classic form remains available.

### Bridge to DCB

1. On **DCB (Render)**: set `AWC_DCB_SERVICE_SECRET` to a long random string.
2. On **Tithe**: set the same secret as `AWC_DCB_SERVICE_SECRET` and `AWC_DCB_API_URL` to the DCB base URL.
3. Tithe signs each POST with `X-AWC-Timestamp` + `X-AWC-Signature` (HMAC-SHA256) to  
   `POST /api/public/giving/contributions`.
4. Payload always includes `amount` and `donorName` (`Anonymous` when the donor opts in).
5. Match Tithe `fundCode` / `fundName` to active funds in DCB (or gifts land in Online Giving → Review).

### Free-tier cold start (Render sleep)

Free Render web services sleep after ~15 minutes idle. The first request after sleep waits for the instance to wake; AWC Tithe shows a branded boot splash once HTML is served.

To reduce sleep (does not make free tier “always on” by itself), ping health every **10–14 minutes** from an external monitor:

- URL: `https://awc-tithe.onrender.com/api/health` (or your service URL)
- Tools: [UptimeRobot](https://uptimerobot.com/), cron-job.org, Render Cron, or the repo workflow [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml)
- For GitHub Actions: add secret `RENDER_HEALTH_URL` = that health URL

### Gift ledger APIs (extended)

- `POST /api/gifts` — record a completed gift (processor paths)
- `POST /api/gifts/offline` — staff Contribution Log → Neon + DCB (requires staff session cookie)
- `GET /api/gifts` — staff ledger list (requires staff session)
- `GET /api/gifts/by-email?email=` — private donor portal lookup
- `POST /api/staff/verify` — invite + MFA; sets `awc_staff_session` httpOnly cookie

Set church legal/support fields in Render env (`CHURCH_LEGAL_NAME`, `CHURCH_ADDRESS`, `CHURCH_CITY_STATE_ZIP`, `CHURCH_EIN`, `CHURCH_PHONE`, `CHURCH_SUPPORT_EMAIL`, etc.) — see `.env.example`. Address for AWC: `4 School St` / `Acton, MA 01720`. Leave `CHURCH_EIN` blank until the Pastor provides it; blank values are omitted from the footer and receipts (no fake EIN).
