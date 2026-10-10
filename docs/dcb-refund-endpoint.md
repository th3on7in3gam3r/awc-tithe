# DCB Refund Endpoint — Required Specification

**Status:** `needs_review` rows are written to `dcb_outbox` on every `charge.refunded`
Stripe event but no DCB endpoint exists yet. This document describes what DCB must
implement and what Tithe will wire up once it is available.

---

## Background

When Stripe issues a refund the AWC Tithe webhook:

1. Sets the `donations` row to `status = 'refunded'`.
2. Inserts a `dcb_outbox` row with `event_type = 'refund'` and
   `status = 'needs_review'`.

The row stays at `needs_review` because there is no DCB endpoint to call.
Staff can see these rows in the **DCB Sync Status** tab of the Staff Portal
and must manually reconcile them in DCB until the endpoint is live.

---

## Proposed DCB Endpoint

### Option A — Void/reverse by voucher

```
POST /api/public/giving/contributions/:voucherId/void
```

**Headers** (same signing scheme as contribution POST):

```
Content-Type:    application/json
X-AWC-Key-Id:   tithe
X-AWC-Timestamp: <unix-ms>
X-AWC-Signature: HMAC-SHA256(AWC_DCB_KEY_TITHE, "<timestamp>.<rawBody>")
Idempotency-Key: <stripePaymentIntentId>
```

**Request body:**

```json
{
  "voucherId": "REC-2025-84321",
  "refundedAt": "2026-10-08T14:32:00.000Z",
  "refundAmount": 100.00,
  "currency": "usd",
  "reason": "donor_request"
}
```

**Success response (200):**

```json
{
  "ok": true,
  "voucherId": "REC-2025-84321",
  "reversedAt": "2026-10-08T14:32:05.000Z"
}
```

**Duplicate response (409):** DCB should return `{ "duplicate": true }` so
Tithe can mark the outbox row as `sent` without error.

---

### Option B — DELETE by voucher

```
DELETE /api/public/giving/contributions/:voucherId
```

Same headers as Option A. No body required; query params for `refundedAt`
and `reason` are acceptable.

---

## How Tithe will wire it up

Once DCB ships either endpoint:

1. In `server/dcb/client.ts`, add `postRefundToDcb(payload)` using the same
   signing helper as `postContributionToDcb`.

2. In `server/dcb/worker.ts`, change `processRow` so `event_type = 'refund'`
   rows call `postRefundToDcb` instead of immediately going to `needs_review`.

3. Existing `needs_review` refund rows can be re-queued via the Staff Portal
   **Retry** button once the endpoint is live.

4. Update this document and set its status to **Implemented**.

---

## Outbox row payload (for reference)

The `dcb_outbox.payload` column for a refund row contains:

```json
{
  "voucherNumber": "REC-2025-84321",
  "transactionId": "pi_3ABC...",
  "refundedAt": "2026-10-08T14:32:00.000Z",
  "refundAmount": 100.00
}
```

---

## Manual reconciliation (until endpoint is live)

1. Open the **DCB Sync Status** tab in the AWC Tithe Staff Portal.
2. All `needs_review` rows are refund events.
3. In DCB, manually locate the contribution by voucher number and void/reverse it.
4. The `needs_review` row in Tithe's outbox is informational only — it will not
   auto-resolve until the endpoint is implemented. Contact the DCB team to
   prioritise this endpoint.
