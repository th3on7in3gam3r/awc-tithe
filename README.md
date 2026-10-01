# AWC Tithe

Church giving front door for **AWC** — cards via Stripe, bank ACH via Plaid, settlement to **DCU Credit Union**, contribution ledger bridge to the **AWC Digital Contribution Book (DCB)**.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy env placeholders: `cp .env.example .env.local` (keys optional — simulator works without them)
3. Run web + API together:
   `npm run dev:all`
   - Web: http://127.0.0.1:3000
   - API: http://127.0.0.1:3001 (`GET /api/health`, `GET /api/config`)

### Optional live keys (`.env.local`)

```
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
AWC_DCB_API_URL=https://your-dcb.onrender.com
AWC_DCB_SERVICE_SECRET=same-as-dcb-AWC_DCB_SERVICE_SECRET
AWC_DCB_BOOK_ID=AWC-DCB-2026-GCC
```

Without Stripe/Plaid keys the Give flow uses the built-in simulator. DCB posts go to the local mock at `/api/dcb/mock/entries` until `AWC_DCB_API_URL` is set.

### Bridge to DCB

1. On **DCB (Render)**: set `AWC_DCB_SERVICE_SECRET` to a long random string.
2. On **Tithe**: set the same secret as `AWC_DCB_SERVICE_SECRET` and `AWC_DCB_API_URL` to the DCB base URL.
3. Tithe signs each POST with `X-AWC-Timestamp` + `X-AWC-Signature` (HMAC-SHA256) to  
   `POST /api/public/giving/contributions`.
4. Match Tithe `fundCode` / `fundName` to active funds in DCB (or gifts land in Online Giving → Review).
