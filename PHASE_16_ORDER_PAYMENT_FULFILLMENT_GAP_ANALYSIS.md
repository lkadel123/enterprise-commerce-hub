# PHASE 16 — ORDER ↔ PAYMENT ↔ FULFILLMENT ↔ INVENTORY LIFECYCLE
## READ-ONLY GAP ANALYSIS

> Read-only analysis. No source files modified, no dependencies installed, no infrastructure
> fabricated. All findings are from direct inspection of the repository at `b9795e4`.

---

## 1. Executive Summary

Phase 15 verified Product → Inventory → Cart → Checkout → **atomic reservation**. Phase 16 audited
everything **after** order creation. The core check-out → reserve → pay → verify path is
**well-built and server-authoritative**: client cannot mark a payment paid, amounts and inventory
are server-owned, cancellation releases reservations, and callbacks are reference-bound and
idempotent. The Phase 15 concurrency and reservation tests pass.

The audit found **no P0 money-loss or oversell defect in the implemented paths**. However, several
**post-order lifecycle capabilities are partial or missing**, creating operational and consistency
risks that are P1:

1. **No payment-expiry scheduler** — a Pending/never-paid order keeps inventory reserved
   indefinitely until an admin manually cancels it (P1).
2. **Refund is a status flag only** — no provider refund call, no refund amount, no partial refund
   (P1). `orderService.refund` marks Refunded and releases stock, but money is never moved back.
3. **No fulfillment/shipping/tracking** — Shipped/Delivered are bare statuses; no courier, tracking
   number, tracking URL, or delivery confirmation (P1/P2, external-dependent).
4. **Order-creation is not server-idempotent** — a duplicate/retried checkout can create duplicate
   orders (each still individually stock-guarded) (P1).
5. **Stock is never deducted** — `stock` is static; only `reserved` moves (release on cancel/refund);
   delivered orders keep permanent reservations (P2).
6. **Cancellation does not refund payment** and does not notify the customer; a Paid payment can
   coexist with a Cancelled order (P1).
7. **No MongoDB transactions** — multi-document safety relies on manual compensating rollbacks
   (works today, not atomic) (P2).
8. **Concurrent verify/callback** can double-write Paid/timeline/notification (idempotent financial
   outcome, duplicate side-effects) (P2).

**Verdict: READY FOR IMPLEMENTATION** — the lifecycle foundation is solid and implementable;
no code blocker prevents building the missing post-order capabilities on top of the existing
authoritative order/payment engine.

---

## 2. Order Model Audit

**Source:** `backend/src/modules/orders/order.model.ts`, `counter.model.ts`.

- **Identity:** `orderNumber` (unique) generated from atomic `CounterModel` (`findAndModify`) — race-free; `_id` is the internal key.
- **Ownership:** `customer: ObjectId → Customer` (indexed); `email` denormalized snapshot.
- **Line items:** product snapshot (product ref, sku, name, qty, unitPrice, lineTotal) — server-captured at creation.
- **Amounts:** embedded `{ subtotal, discount, shipping, tax, total }` — all `min: 0`, computed server-side.
- **Addresses:** embedded shipping + billing snapshots (nullable).
- **Payment:** embedded `{ method, status, provider, transactionId, providerTransactionId, amount, currency, initiatedAt, paidAt, failureReason, metadata }`.
  - There is **no separate payment model, no separate refund model, no transaction-log model** — payment state lives entirely inside the order document.
- **Timeline:** array of `{ label, at, done }` — in-document audit trail.
- **Fulfillment/shipping:** **NO fields exist** — no trackingNumber, courier, trackingUrl, shipDate, deliveredAt (confirmed by search). Only order `status` Shipped/Delivered.
- **State representation:** **two independent state machines in one document** — `order.status` and `payment.status` are separate enums with separate transitions. No invariant enforces that they stay mutually consistent.

**Reflection:** embedded payment/amount/address/item snapshots give strong historical integrity. The
two-field dual state machine is valid, but the absence of enforcement that `payment.status` and
`order.status` move coherently is the core structural risk (see §6, §10).
## 3. Order State Machine

**Actual enum** (`ORDER_STATUSES`): `Pending, Processing, Shipped, Delivered, Cancelled, Refunded`.
(**No** `Confirmed`, `Failed`, `Completed`.)

**Enforced transitions** (`ALLOWED_TRANSITIONS` in `order.service.ts`), enforced server-side in
`setStatus` (invalid → `badRequest`):

```
Pending    → Processing, Cancelled
Processing → Shipped, Cancelled
Shipped    → Delivered, Refunded
Delivered  → Refunded
Cancelled  → (terminal)
Refunded   → (terminal)
```

- **Who can transition:** admin only (`/api/v1/orders/:id/status`, `requirePermission("orders","edit")`); customers have **no** status/cancel/refund route (customer surface = create/list/getById/getTracking only).
- **Cancellation:** `cancel()` re-checks `ALLOWED_TRANSITIONS`; terminal-status orders reject cancellation. Idempotent in that a repeat cancel is rejected cleanly and `releaseReserved` clamps ≥0.
- **Refund:** `refund()` allows only Shipped/Delivered; idempotent reject elsewhere.
- **Server-enforced:** yes (validator + transition table in service). Invalid transitions rejected.
- **Transition idempotency:** repeated identical `setStatus` to the same state fails if not in `ALLOWED_TRANSITIONS` of current state. No explicit "already applied" skip, but the guard prevents regressions.

**Gaps:**
- **P1:** No automatic Pending→Cancelled/Failed expiry. A permanently-Pending order reserves stock forever.
- **P1:** `cancel()`/`setStatus("Cancelled")` do **not** enforce that payment is not Paid; you can cancel an order whose `payment.status === Paid` without any refund (inconsistency, §6/§10).
- **P2:** No event/side-effect hook on Ship/Deliver (no inventory decrement, no tracking, no delivery notification).

## 4. Payment State Machine

**Actual enum** (`PAYMENT_STATUSES`): `Paid, Pending, Refunded, Failed, Initiated, Cancelled`.
`payment.method` from `PAYMENT_METHODS`; `payment.provider` from `PAYMENT_PROVIDERS` (KHALTI, ESEWA, COD, BANK_TRANSFER).

**Lifecycle in `customer-payment.service.ts`:**

- **Initiate** (`initiate`): ownership-scoped (`findByIdForCustomer` → 404 on other's order). Guards: `Paid` → `duplicate:true` (idempotent); order `Cancelled` → 400; payment in `Failed/Cancelled/Refunded` → 400. Amount is **always** `order.amounts.total` (client amount rejected at validation, never read). Calls provider.initiate; on success persists `Initiated` + providerTransactionId + initiatedAt; on provider failure → `serviceUnavailable`.
- **Verify** (`verify` / `verifyResolvedOrder`): ownership-scoped (`verify`) or reference-bound (`callback`). Terminal guards:
  - `Paid` → `{duplicate:true}` (idempotent, never regressed).
  - `Refunded/Cancelled` → `badRequest`.
  - `Failed` → `{duplicate:true}` (requires a fresh initiate; never auto-promotes).
  - Calls `provider.verify(providerTransactionId, signature)` server-side. On `Paid`, compares provider amount to `order.amounts.total` (±1 paisa); mismatch → `Failed`. On match → `Paid` + capture provider transaction + paidAt.
  - Provider unreachable → `serviceUnavailable` (client may retry).
- **Callback** (`callback`, public): resolves order **by `providerTransactionId`** (`findByTransactionId`), refuses an `orderId` mismatch (404), then runs `verifyResolvedOrder`. Reference-bound + amount-checked + terminal-guarded ⇒ **duplicate/replay callbacks are safe**.

**Server authority — VERIFIED:** frontend cannot supply amount/status; verification requires a
provider server-to-server lookup; amount must match stored order total; ownership is scoped;
client-supplied financial fields in verify payload are rejected (422, tested).

**Gaps:**
- **P1:** No payment-expiry/auto-release; Initiated/Pending payments never expire server-side.
- **P2:** Mark-Paid is a non-conditional update — two concurrent callbacks can both pass the terminal guard and both write Paid/timeline/notification (financial outcome idempotent since the charge is a single provider transaction; only side-effects duplicate).
- **P2:** No refund state machine beyond a single `Refunded`; no partial refund.
## 5. Inventory Lifecycle

**Source:** `inventory.repository.ts`, `order.service.ts`.

- **Reserve** (`reserveStock`): atomically guarded `findOneAndUpdate` on `available = stock - reserved >= qty` then `$inc reserved`. **Cannot oversell.** Returns null → caller aborts.
- **Release** (`releaseReserved`): `updateOne` with `reserved: {$gt:0}` and `$set reserved = max(reserved - qty, 0)` — **never negative**, idempotent, no double-release below zero.
- **Where released:** only inside `releaseReservations`, called from `orderService.cancel()` and `orderService.refund()`. Rollback-release also on order-create partial failure.
- **Payment events do NOT touch inventory:** success, failure, expiry, initiation — none change `stock`/`reserved`.
- **Shipment/Delivery do NOT touch inventory:** `setStatus` only updates status + notifies; there is **no stock deduction at fulfill**.
- **Stock is NEVER deducted.** `stock` stays constant; `reserved` is the only moving quantity, returning to 0 on cancel/refund.

**Consistency `available = stock - reserved`:** holds **structurally** on every path (guarded
reserve; release clamping ≥0), so it cannot go negative. **However** delivered/shipped (actually
sold) orders keep their quantities in `reserved` forever (only cancel/refund release them).
Available stock stays reduced for sold units — arguably correct for "available to sell", but
`reserved` semantically becomes "held or sold, not yet released". Registered as **P2** (no live
decrement on fulfillment / no ledger of sold units).

## 6. Payment ↔ Inventory Atomicity (scenario matrix)

**Architecture:** no MongoDB transactions. Order-creation uses manual compensating rollback
(reserve items; on failure release them + coupon reservations). Payments mutate the order doc via
single `updateById` per step. No cross-document transaction exists.

| # | Scenario | Behaviour (evidence) | Money | Inventory | Order state |
|---|---|---|---|---|---|
| A | Reserve succeeds, initiate fails | initiate → `serviceUnavailable`; reserved stays; order Pending | SAFE | reserved (held) | Pending — needs cancel to release |
| B | Payment succeeds, order update fails | verify marks Paid then a later updateById could fail → Paid applied, notify non-fatal, no compensation | SAFE (paid) | reserved (held) | Paid recorded |
| C | Verify OK but status write fails | `applyVerifiedStatus` throws → 5xx; idempotent retry later re-verifies | SAFE | reserved | may stay pre-Paid; recoverable |
| D | Callback twice | terminal guard `Paid → duplicate:true` | SAFE | unchanged | idempotent |
| E | Two callbacks concurrently | both pass guard pre-write → both write Paid (see §4 P2) | SAFE (single charge) | unchanged | both Paid (idempotent result) |
| F | Customer retries payment | re-initiate guarded; Paid → duplicate; Failed/Cancelled → 400 | SAFE | unchanged | guarded |
| G | Two payment windows | each re-initiate overwrites providerTransactionId (last-write-wins); amount still order total | SAFE | unchanged | second window overwrites ref (P2) |
| H | Provider success after local timeout | verify retried → terminal guard + amount check; marks Paid | SAFE | unchanged | correct |
| I | Provider failure after local success | provider.verify authoritative → Failed; not auto-promoted | SAFE | unchanged | correct |
| J | Others' order verification | ownership query → 404 (never reveals) | SAFE | unchanged | blocked |

**Highest risk outstanding:** scenario **A/B with no expiry** — if a verify never completes or the
customer abandons a Pending order, `reserved` stays held with no automatic release. Money is never
lost, but inventory can be **operationally locked** (not oversold). This is the clearest P1.

## 7. Order Creation Idempotency

- **No idempotency key / no Idempotency-Key header / no unique order-reference dedupe.**
- `orderNumber` uniqueness only prevents number collision, not duplicate order *creation*.
- Customer surface `createCustomerOrderSchema` accepts identical payloads; each POST creates a **new** order + **new** reservation (each reserve still stock-guarded, so no oversell).
- Frontend duplicate-submit is prevented client-side only (loading/disabled button); no server-side double-submit guard.
- Cart is cleared **after** success only — a retry after a timeout that actually succeeded creates a **duplicate order** (the earlier order exists, the cart already cleared).

**Weakness:** **P1** — a double-click/retry can create duplicate orders (two Pending reservations of the same stock, still individually guarded). Recommended: an idempotency key or a "customer's cart → one order in flight" guard.
## 8. Payment Idempotency

- **Initiate:** idempotent for `Paid` (returns duplicate) and safety-rejected for cancellable/failed states.
- **Verify/callback:** terminal `Paid` guard returns `duplicate:true`; `Failed` returns duplicate without promotion (must re-initiate). Amount re-verified on every run. Reference-bound (`findByTransactionId`) so a replayed txn id maps to the same order.
- **Consequence audit:** no double payment (single provider charge; verification references one provider txn), no duplicate order confirmation beyond an idempotent status, no inventory double-release (release only on cancel/refund, clamped), no unsafe status regression.
- **Weaknesses (P2):** mark-Paid is non-conditional → concurrent double-write of timeline/notification; no standalone replay nonce beyond the provider transaction reference (reference serves this adequately).

## 9. Refund Audit

**Status: PARTIAL (status-only; see below).**

- `orderService.refund(id, {reason?})` exists (admin route `POST /api/v1/orders/:id/refund`, `requirePermission orders edit`, `refundOrderSchema` = `{reason?}` only).
- Permits only Shipped/Delivered orders, then sets `order.status="Refunded"`, `payment.status="Refunded"`, adds a timeline entry, and calls `releaseReservations`.
- **No provider refund call** — `PaymentProviderInterface` has **no `refund()` method**; provider code only *reads* a `refunded` flag off Khalti lookups (never writes one). No money is moved back.
- **No refund amount, no partial refund, no duplicate-refund guard beyond terminal status, no linkage to a provider refund transaction, no customer refund endpoint.**

**Classification:** the *order/inventory* side of a refund is implemented and safe (releases stock once, clamps). The *money* side (gateway refund) is **MISSING**. **P1** — implementation must call the provider refund API and record the provider refund reference/amount; **partial refund** is **MISSING/P2**; **customer self-service refund** is **MISSING (P2/P3)**.

## 10. Cancellation Audit

- **Customer:** **cannot cancel** — no customer cancel route exists (customer surface is create/list/getById/getTracking). **MISSING (P2).**
- **Admin:** `POST /api/v1/orders/:id/cancel` (requirePermission orders edit) → `orderService.cancel(orderId, reason)`.
  - Guards: only `Pending`/`Processing` (per `ALLOWED_TRANSITIONS`) may cancel; terminal states rejected.
  - Releases inventory via `releaseReservations`.
  - **Does NOT refund payment** — if `payment.status` was `Paid`/`Initiated`, cancellation leaves the payment field untouched → a Paid + Cancelled order (money taken, no refund). **P1.**
  - **Does NOT notify the customer** (`order_cancelled` type exists but is unused). **P2.**
- **Cancellation vs payment race:** `verifyResolvedOrder` checks payment.status but **not** order.status; `initiate` checks order.status===Cancelled, `verify` does not. A callback for a Cancelled order with payment.status still Pending could mark Paid. **P1 (verify should reject when order.status is Cancelled).**
- **Cancellation vs shipment race:** only Pending/Processing are cancellable, so Shipped + Cancelled is structurally blocked. Good.

## 11. Fulfillment Audit

**Status: MISSING (core).** There is **no fulfillment module**: no packing, no warehouse task, no
courier, no tracking number/URL, no shipment record, no delivery confirmation, no return/return
flow. Fulfillment is represented only by the bare order statuses `Shipped`/`Delivered`, changed by
an admin `setStatus` call.

- Warehouse is a single `warehouse` snapshot per order, but nothing processes it.
- **Fulfillment module:** MISSING.
- **Fulfillment status:** PARTIAL (only order.status Shipped/Delivered).
- **Admin fulfillment UI/API:** PARTIAL (admin can set status; no packing/shipment record).
- **Customer tracking UI:** PARTIAL (tracking endpoint returns status + timeline only).

## 12. Shipping / Delivery Audit

- **Shipping address snapshot:** IMPLEMENTED (embedded order address).
- **Shipping fee:** IMPLEMENTED but **admin-overridable** — `orderService.create` uses `input.shippingFee ?? default`. `createOrderSchema` (admin) accepts `shippingFee` (line 52); the **customer** `createCustomerOrderSchema` does **not** accept it (customer path safe).
- **Shipping method:** MISSING (only a fixed `DEFAULT_SHIPPING_FEE`, no method selection).
- **Courier assignment / tracking number / tracking URL / shipment status / delivery confirmation:** **ALL MISSING** (search returned no courier/tracking fields anywhere).
- **Tax:** fixed `TAX_RATE = 0.075` server-side; no region-specific rates.

## 13. Customer Order Experience

- Checkout → create (totals computed server-side); order confirmation (createdAt + timeline + DTO).
- Order history (`GET /customer/orders`), order detail (`GET /customer/orders/:id`), payment status (`GET /customer/payments/:id/status`) — all ownership-scoped (404 on other's order), rate-limited.
- Tracking (`GET /customer/orders/:id/tracking`) returns current status + timeline only.
- **No customer cancel, no customer refund/return request, no payment retry beyond re-initiate, no tracking number display, no shipment updates beyond timeline.**

**Frontend state accuracy** is not deeply inspected here (read-only backend lifecycle focus), but
backend emits notifications on create/status/payment and DTOs are stable. Any stale-cache concern
is a storefront TanStack-query invalidation matter (out of scope; flagged for customer-UX roadmap).
## 14. Admin Order Experience

| Capability | Backend support | Enforcement |
|---|---|---|
| View orders / filter / paginate | `GET /api/v1/orders` (+ status/payment/date filter) | `requirePermission orders view` |
| Get order detail | `GET /api/v1/orders/:id` | orders view |
| Update status (Pending→…→Delivered) | `PATCH /:id/status` | orders edit + service transition guard |
| Confirm/force payment | `PATCH /:id/payment` (setOrderPaymentSchema) | orders edit |
| Cancel order | `POST /:id/cancel` | orders edit + transition guard |
| Refund order | `POST /:id/refund` (status-only) | orders edit + status guard |
| Fulfillment / assign shipment / tracking | **MISSING** | — |
| Inspect inventory relationship | via inventory module (separate admin surface) | inventory perms |
| Refund amount / provider refund / partial | **MISSING** | — |

Admin restrictions are **back-end enforced** (permissions + state guards), not UI-only. Good.

## 15. Webhook / Callback Security

- **Callback endpoints:** `POST /api/v1/customer/payments/:orderId/callback` (public, deliberately not customer-authenticated) and admin `/api/v1/payments/{khalti/callback, esewa/success, esewa/failure}`.
- **Authenticity:** no local signature/HMAC of incoming callbacks. Authenticity is established by **server-to-server provider verification** (`provider.verify(providerTransactionId, signature)`), which re-queries the gateway — the only trusted source of truth.
- **Reference binding:** customer callback resolves the order by `providerTransactionId` and refuses an `orderId` mismatch (404). Prevents an attacker targeting arbitrary orders.
- **Replay protection:** reference-bound + amount-checked + terminal `Paid` guard ⇒ replayed/duplicate callbacks are no-ops (duplicate:true).
- **Amount validation:** provider-returned amount must equal order total (±1 paisa).
- **Order ownership:** callback validates txn→order mapping; no customer session required by design.
- **Limits:** public callback is under `apiRateLimiter` (not the stricter action limiter).
- **Logging:** verification logged (orderId/gateway/transactionId/amount); amount mismatch logged.

**Assessment:** materially safe (provider verification is the authority). **P2 hardening:** add
provider signature verification where the API supports it and scope callbacks to the provider
configured on the order (currently the gateway re-verifies, so residual risk is low).

## 16. Authorization / IDOR

- **Customer order/payment:** identity always from `req.customer` (CustomerAccount → linked CRM Customer); client-supplied ids never trusted. Ownership enforced in the DB query (`findByIdForCustomer`); cross-customer returns **404 (never reveals existence)**. Tested in `customer-payments.test.ts` and `cart-wishlist.test.ts`.
- **Payment callback:** public but reference-bound, cannot touch another order.
- **Admin ops:** `authenticate` + `requirePermission(orders, …)`; separate admin surface. Good.
- **Gaps:** customer cannot cancel/refund (self-service missing, P2); `verify` should also enforce order.status not Cancelled (§10, P1). No customer→admin escalation observed.

## 17. Financial Integrity

**Server-authoritative, VERIFIED for the customer path:**
- Prices from Product DB; subtotal/lineTotal computed server-side; tax fixed-rate server-side; coupon validated + computed server-side; order total server-side; payment initiate amount = `order.amounts.total`; verify amount matches provider.
- Customer `createCustomerOrderSchema` accepts only productId + quantity (+ addresses, paymentMethod, couponCode, notes) — **no price/shipping/discount/total fields** (shippingFee explicitly excluded).
- Initiate/verify payloads strip financial fields (422 on tamper) — tested.
- Refund amount: **N/A** (no financial refund implemented) — must be server-derived from order totals once added.
- **Notable:** admin `createOrderSchema`/`orderService.create` accept `input.shippingFee` (admin override). Admin-trusted, does not affect customer path; flag P2/P3.
## 18. Audit Logging

- Structured pino JSON with **X-Request-Id** correlation (Phase 12); log redaction tested (no tokens/cookies/secrets).
- Payment initiate/verify/failure/amount-mismatch logged (orderId, gateway, provider txn, amount).
- Order create logs; `order.timeline` records every status/payment change in-document — a durable per-order audit trail.
- **Gaps (P1/P2):** admin `setStatus`/`setPayment`/`cancel`/`refund` do **not** emit a dedicated audit log record beyond the timeline + a generic status notification; no actor id on timeline entries. Recommend adding actor + reason to the timeline.

## 19. Notifications

- **Types available:** `order_created`, `order_status_changed`, `payment_initiated`, `payment_successful`, `payment_failed`, `refunded`, `order_cancelled`.
- **Emitted:** order_created (create), order_status_changed (`setStatus`), payment_initiated/successful/failed (payment service). All best-effort/non-fatal.
- **NOT emitted:** `orderService.cancel()`/`orderService.refund()` do **not** call `notifyCustomer` — `order_cancelled`/`refunded` types exist but are unused on admin-cancel/refund paths. **P1**: emit cancellation/refund notifications.
- Customer notification API + storefront display exist (Phase 8/11). Duplicate-notification behavior is not special-cased (rely on idempotent emission points).

## 20. Test Coverage Audit

| Area | Coverage | Evidence |
|---|---|---|
| Order creation (pricing/product/status) | INDIRECTLY TESTED | cart-wishlist, inventory-cart suites |
| Inventory reservation (concurrency) | EXPLICITLY TESTED | `inventory-cart-hardening.test.ts` |
| Payment initiation | EXPLICITLY TESTED | `customer-payments.test.ts` |
| Payment verification | EXPLICITLY TESTED | customer-payments (guards, amount tamper, callback unknown ref) |
| Payment failure | EXPLICITLY TESTED | payment_failed / failure paths |
| Payment cancellation | INDIRECTLY TESTED | terminal-state rejection |
| **Payment expiry** | **NOT TESTED** | no expiry scheduler exists |
| **Refund** | **NOT TESTED** | no provider-refund path; status transition untested |
| **Order cancellation (admin)** | **NOT TESTED** | cancel route/service not covered |
| **Admin status transitions** | **NOT TESTED** | no invalid-transition test observed |
| **Duplicate callback / concurrent verify** | PARTIAL | unknown-ref callback tested; same-ref replay/concurrency untested |
| IDOR | EXPLICITLY TESTED | customer-payments IDOR 404 |
| Financial integrity | EXPLICITLY TESTED | amount/fields 422 tests |
| **Fulfillment** | **NOT TESTED** | none exists |
| Bad input validators (order/address) | PARTIAL | covered in suite run |

## 21. Performance / Concurrency

- **Concurrent order creation:** safe from oversell (guarded atomic reserve); `orderNumber` counter is race-free. Manual per-item reserve + rollback is O(items) without a transaction but correct.
- **Concurrent verify/callback:** potential double-write of Paid/timeline/notification (P2).
- **Concurrent cancel + pay (race):** `verify` does not check order.status ⇒ Paid can land on a Cancelled order (P1).
- **Cancellation idempotency:** release clamps to ≥0; repeat cancel rejected. Concurrent double-cancel: both may read Pending and both call `releaseReservations`; because release clamps to ≥0 and is decrement-only, **no double-release below zero**. SAFE.
- **Sanity:** no DB transactions; no deadlocks observed in these single-doc operations.

## 22. Database Consistency

- **Indexes:** Order unique `orderNumber`, `customer`, `status+createdAt`, `createdAt`; Inventory unique `product+warehouse`, `sku`. Good.
- **Transactions:** **none used** — multi-doc actions (order+coupon+inventory) rely on compensating rollback. Works when ops succeed serially; a crash mid-sequence relies on retries/idempotency (present for inventory release).
- **Orphan risk:** inventory records have no FK (Mongo) — product deletion can orphan inventory; orders hold product snapshots so history survives product removal (good).
- **`createdAt`/`updatedAt`:** timestamps on order/inventory.
- **Refunds/cancellations** mutate one order doc + inventory doc; no separate txn log.
## 23. External Provider Dependencies

| Provider | Code support | Config | Credentials | Sandbox | Production | Failure handling |
|---|---|---|---|---|---|---|
| Khalti | IMPLEMENTED (initiate/verify/getStatus; reads `refunded` flag) | `KHALTI_*` env | production keys | via base URL | requires creds + HTTPS return URL | provider errors → serviceUnavailable |
| eSewa | IMPLEMENTED (initiate/verify/getStatus) | `ESEWA_*` env | production | via base URL | requires creds + HTTPS callbacks | provider errors → serviceUnavailable |
| COD | IMPLEMENTED (payment method; admin marks Paid via setPayment) | method only | none | n/a | n/a (manual) | n/a |
| Shipping/courier | **MISSING** | none | none | none | none | none |
| Email/SMS | none found (in-app notifications only) | — | — | — | — | non-fatal |
| Sentry | IMPLEMENTED (optional, env-gated) | `SENTRY_*` | DSN optional | — | env-gated | non-fatal |
| Storage/CDN | S3 adapter | `STORAGE_*`/`S3_*` | keys | — | requires bucket | Phase 12 |
| Provider **refund API** | **MISSING** | — | — | — | — | — |

No production provider integration is claimed beyond the code paths; credentials remain server-only
and uncommitted (Phases 12/13 verified).

## 24. Gap Classification Matrix

| ID | Area | Gap | Evidence | Impact | Current behaviour | Recommended | Pri | Dep |
|---|---|---|---|---|---|---|---|---|
| G1 | Inventory | No payment/order expiry auto-release | no cron; release only on cancel/refund | reserved stock locked on abandoned Pending orders | reserved held indefinitely | scheduled release of Pending/Initiated older than TTL | P1 | deploy (cron) |
| G2 | Refund | Refund is status-only; no gateway refund | interface has no refund(); refund() marks + releases | money not returned on refund | order Refunded, stock back, no payment move | provider refund + amount + refund txn linkage | P1 | provider |
| G3 | Refund | No partial refund | refundOrderSchema = reason only | no partial refunds | n/a | partial amounts | P2 | provider |
| G4 | Order | No server idempotency on create | no Idempotency-Key/unique dedupe | duplicate orders on retry | each POST new order (stock-guarded) | idempotency key / in-flight guard | P1 | none |
| G5 | Fulfillment | No fulfillment module | no courier/tracking fields | no fulfillment ops | bare Shipped/Delivered | fulfillment/shipment/tracking | P1/P2 | external |
| G6 | Shipping | No method/courier/tracking | no fields | no tracking UX | n/a | courier integration | P2 | external |
| G7 | State | cancel doesn't refund / verify ignores order.state | cancel no payment action; verify no order.state check | Paid+Cancelled possible | Paid can coexist with Cancelled | enforce consistency + block verify on Cancelled | P1 | none |
| G8 | State | Ship/Deliver doesn't decrement stock / ledger | stock never deducted | sold units stay reserved forever | reserved persists post-fulfillment | sold ledger / decrement on ship | P2 | none |
| G9 | Concurrency | Non-conditional mark-Paid | updateById without status guard | duplicate side-effects on concurrent verify | double timeline/notify | conditional `{status:{$ne:'Paid'}}` | P2 | none |
| G10 | Notification | cancel/refund no customer notify | types unused | customer not informed | silent cancel/refund | emit order_cancelled/refunded | P1 | none |
| G11 | Auth | Customer cannot cancel/return | no routes | no self-service | n/a | customer cancel/return routes | P2 | none |
| G12 | Audit | No actor on timeline; no audit store | timeline lacks actor | admin actions unattributed | partial trail | actor+reason in timeline | P2 | none |
| G13 | Payments | No webhook signature verification | callback trusts provider re-verify | low residual risk | provider re-verify | signature verify where supported | P2 | provider |
| G14 | Financial | Admin overrides shippingFee | createOrderSchema.shippingFee | admin can alter shipping | admin-trusted override | keep admin-only | P3 | none |
| G15 | Tests | Missing lifecycle tests | coverage map §20 | untested paths | — | tests per roadmap | P1/P2 | none |
## 25. Required Questions (evidence-based)

1. **Order without reservation?** NO — `orderService.create` reserves every item before ordering; failure aborts.
2. **Reserved twice for one order?** NO — reservation is per order-create; a second order is a separate order.
3. **Released twice?** NO for negative — `releaseReserved` clamps ≥0; double cancel/refund rejected or clamped.
4. **Frontend mark paid?** NO — client cannot supply status/amount; verification is provider + server, amount-checked.
5. **Verify another's payment?** NO — ownership query → 404 (tested); callback reference-bound.
6. **Duplicate callbacks duplicate transitions?** NO financial risk — terminal `Paid` guard; minor P2 side-effect duplication on concurrent verify.
7. **Order paid twice?** NO — single provider txn + terminal guard; re-initiate returns duplicate when Paid.
8. **Failed payment lock inventory?** A Failed payment stays `reserved` until an admin cancel/refund; **no auto-release**. (G1/G8.)
9. **Expired payment release?** Only via cancel/refund — **no automatic expiry release** exists (scheduler MISSING; deployment-dependent).
10. **Customer cancel shipped?** Customers cannot cancel; admin cancel blocks Shipped (only Pending/Processing cancellable).
11. **Refund implemented?** PARTIAL — status/stock side only; **gateway money refund MISSING**.
12. **Partial refund?** NO — MISSING.
13. **Fulfillment implemented?** NO — MISSING (bare statuses only).
14. **Shipment tracking?** NO — MISSING.
15. **Delivery confirmation?** No automated delivery confirmation; only admin `Delivered` status.
16. **Payment amounts server-authoritative?** YES — initiate = order total; verify amount-matched (±1 paisa); tested.
17. **Refund amounts server-authoritative?** N/A — no financial refund implemented; must be server-side when added.
18. **All order transitions server-enforced?** YES — `ALLOWED_TRANSITIONS` + validator + permission; admin-only.
19. **Order creation idempotent?** NO — missing idempotency key (P1, G4).
20. **Payment verification idempotent?** YES for financial outcome — terminal guard + reference-bound; P2 concurrency nuance.
21. **Callback/webhook replay protected?** YES via reference-bound + terminal guard + provider re-verify; no standalone nonce (P2).
22. **Actions fully audited?** PARTIAL — structured logs + in-doc timeline; no actor attribution/audit store (P2).
23. **Lifecycle failures recoverable?** MOSTLY — compensating rollback + idempotent release + terminal guards; **no expiry recovery** is the main gap (P1).
24. **Which paths lack tests?** refund, admin cancel, invalid transitions, payment expiry, concurrent verify, fulfillment (§20).
25. **Highest-risk missing functionality?** **Auto-release on payment/order expiry + refund that returns money** (G1+G2): abandoned orders can lock inventory and refunds don't move money back.
## 26. Implementation Roadmap (only what findings justify)

- **16A** Foundation: enforce order/payment consistency invariant (block Paid on Cancelled; validate cancel/refund against payment state). *(G7)*
- **16B** Idempotency: add order-create idempotency key / in-flight guard + conditional mark-Paid. *(G4, G9)*
- **16C** Expiry/release: implement callable `releaseExpiredReservations` service + schedule (document cron deployment). *(G1, G8 partial)*
- **16D** Notifications: emit `order_cancelled` + `refunded`; add actor/reason to timeline. *(G10, G12)*
- **16E** Refund: implement provider refund (amount server-side, refund txn linkage, idempotent/duplicate-guard), then partial refund. *(G2, G3)*
- **16F** Customer self-service: customer cancel/return request routes. *(G11)*
- **16G** Fulfillment/shipment/tracking: ship record + courier/tracking fields + tracking enrichment (external-dependent). *(G5, G6)*
- **16H** Tests: lifecycle suite (refund, cancel, transitions, expiry, concurrent verify, IDOR). *(G15)*
- **16I** Observability/security: webhook signature verify where supported; dedicated audit log. *(G13)*
- **16J** Final verification + regression.

## 27. Definition of Done (objective, for implementation phase)

- [ ] Order/payment invariant enforced: no Paid on Cancelled; verify rejects Cancelled.
- [ ] Order-create idempotency guard in place; mark-Paid is conditional.
- [ ] Expiry release callable and scheduled-capable; `available=stock−reserved` holds; no double-release.
- [ ] Refund executes a real provider refund with server-side amount + refund reference; duplicate refunds blocked.
- [ ] Partial refund supported (amount ≤ original) with amount validation.
- [ ] Cancel/refund emit customer notifications and record actor/reason.
- [ ] Customer self-service cancel/return present (if in scope).
- [ ] Fulfillment/shipment/tracking implemented or explicitly marked external-dependent.
- [ ] Automated tests added for every implemented lifecycle path; all existing suites stay green (backend 259, storefront 148).
- [ ] No business behaviour, API contract, or Phase 12/13/14 security controls regressed.

## 28. File Impact Map (read-only; nothing changed)

**Existing relevant files (no changes in this phase):** `orders/order.model.ts`, `orders/order.service.ts`,
`orders/order.routes.ts`, `orders/order.validator.ts`, `orders/counter.model.ts`,
`customer-orders/*`, `customer-payments/*`, `payments/{payment.provider.ts,payment.providers.ts,providers/*}`,
`inventory/inventory.repository.ts`, `notifications/notification.*`, `test/{customer-payments.test.ts,
inventory-cart-hardening.test.ts,cart-wishlist.test.ts}`.

**Files likely requiring modification during implementation:** `order.service.ts` (invariant +
expiry release + refund + notifications), `payment.provider.ts` + `providers/*` (refund method),
`customer-payment.service.ts` (verify order-state guard, conditional Paid, refund),
`order.validator.ts`/`customer-order.validator.ts` (partial-refund, idempotency), `customer-order.routes.ts`
(cancel/return), new `fulfillment`/`shipment` module, notification service (cancelled/refunded).

**Tests to add:** refund lifecycle, cancel races, invalid transitions, order idempotency, payment
expiry release, concurrent verify, IDOR for new routes.

**Docs to update:** `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`, `docs/PRODUCTION_OPERATIONS.md`, runbooks.

## 29. Readiness Score (evidence-based)

| Area | Score | Basis |
|---|---|---|
| Order lifecycle | 70% | solid state machine; missing expiry/idempotency |
| Payment lifecycle | 85% | server-authoritative, idempotent terminal guards; concurrency P2 |
| Inventory lifecycle | 75% | atomic reserve/release safe; no expiry/decrement |
| Cancellation | 55% | admin-only, guarded, releases stock; no refund/notify/verify-guard |
| Refund | 25% | status-only; no gateway refund/partial |
| Fulfillment | 5% | none |
| Shipment | 5% | none |
| Customer UX | 50% | history/tracking/view good; no cancel/refund/retry-expiry UX |
| Admin UX | 60% | status/payment/cancel/refund(status); no fulfillment/refund-amount |
| Security | 85% | strong IDOR/amount/ownership; callback + concurrency P2 |
| Observability | 60% | structured logs+timeline; no actor/audit store |
| Testing | 60% | strong payments/inventory; refund/expiry/fulfillment untested |
| **Overall** | **≈ 55%** | foundation solid; post-order capabilities are the open half |

## 30. Final Verdict

The pre/post-checkout foundation (reservation atomics, server-authoritative money, IDOR, callback
safety) is strong and **without a P0 financial or oversell defect**. The remaining gaps are
**implementable** lifecycle features (expiry, refund via gateway, fulfillment/shipment, idempotency,
consistency invariants, notifications) plus provider/external integrations, none of which is a code blocker.

**READY FOR IMPLEMENTATION.**

Overall readiness: **≈ 55%** · P0: **0** · P1: **6** (G1,G2,G4,G7,G10,G15) · P2: **8** (G3,G5,G6,G8,G9,G11,G12,G13) · P3: **1** (G14)

Highest-risk gap: **no automatic expiry/cancellation release + refund does not return money** (G1+G2).

Most important existing strength: **server-authoritative payment verification + atomic, oversell-safe
inventory reservation with idempotent release** (Phases 12/15).

Implementation recommendation: proceed **16A → 16E** first (consistency invariants, idempotency,
expiry release, notifications, gateway refund), then fulfillment/customer UX, with a regression gate
that keeps backend 259/259 and storefront 148/148 green.

---

**PHASE 16 STATUS:** READ-ONLY GAP ANALYSIS COMPLETE
**READINESS:** ≈ 55% (READY FOR IMPLEMENTATION)
**P0:** 0 · **P1:** 6 · **P2:** 8 · **P3:** 1
**FILES MODIFIED:** 0
**DEPENDENCIES INSTALLED:** 0
