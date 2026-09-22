# PHASE 16 — ORDER → PAYMENT → INVENTORY → FULFILLMENT HARDENING
## IMPLEMENTATION REPORT

> Implementation report. All results verified by executing the test suites on this machine.
> Baseline at start of implementation: backend typecheck FAILING (a partial, uncommitted
> Phase 16 draft existed with compile errors and dropped Phase 7 coupon logic).
> Storefront untouched.

---

## 1. Executive Summary

Phase 16 closes the post-cart lifecycle gaps identified in
`PHASE_16_ORDER_PAYMENT_FULFILLMENT_GAP_ANALYSIS.md` (P1: G1, G2, G4, G7, G10 + P2 partials).
Implemented: lifecycle state invariants with atomic guarded transitions, customer-scoped
order-creation idempotency (DB-unique), payment/order expiry with exactly-once inventory
release, de-duplicated customer lifecycle notifications, a provider-refund abstraction with
an honest UNSUPPORTED fallback, race-safe payment verification, payment-state-governed
cancellation, a minimal fulfillment transition model with stock finalization, and an
operations endpoint for expiry sweeps.

Final results: **Backend 286/286 · Storefront 148/148 · typechecks PASS** (backend,
backend tests, storefront). No security control regressed; no storefront code changed.

## 2. Scope

Implemented per the master prompt: 16A–16I, 16K (tests), 16L (docs), 16M (verification).
Not implemented (explicitly out of scope / provider-limited): real gateway refund calls
(no refund API credentials in repo — documented, not fabricated), external carrier
integrations, customer self-service cancel/return routes (P2 G11, deferred).

## 3. Architecture Baseline

Existing architecture preserved: `Order` document with embedded payment snapshot, dual
(order.status / payment.status) state machines, atomic MongoDB reservation updates
(`$expr`-guarded `findOneAndUpdate`), server-authoritative pricing and payment verification,
customer identity always derived from the authenticated account (`ensureCrmCustomer`),
notifications keyed by CustomerAccount id and routed via `findAccountIdByCrmCustomerId`.

## 4. Files Created

- `backend/test/phase16-lifecycle.test.ts` — 21-test lifecycle suite (16B/16C/16D/16E/16F/16G/16H/16I, concurrency, IDOR).
- `backend/src/modules/notifications/lifecycle-notify.ts` — CRM-customer → customer-account lifecycle notification helper (best-effort, never throws).

## 5. Files Modified

- `backend/src/modules/orders/order.service.ts` — lifecycle invariants; idempotent create with duplicate-key recovery; expiry (`expireOrder`, `expirePendingOrders`); atomic guarded cancel + Paid-cancel rejection; gateway refund flow (PENDING/SUCCESS/FAILED/UNSUPPORTED) with amount caps; fulfillment notifications; stock finalization on Delivered; reinstated the Phase 7 coupon reservation block (reserve/release) that the partial draft had dropped.
- `backend/src/modules/orders/order.repository.ts` — `cancelIfCancellable` (atomic guarded cancel); `refund`/`expiresAt` in `OrderPatch`.
- `backend/src/modules/orders/order.controller.ts`, `order.routes.ts` — `POST /api/v1/orders/expire-pending` (admin, `orders:edit`).
- `backend/src/modules/orders/order.validator.ts` — refund `amount` field; `Expired` in list filter.
- `backend/src/modules/orders/order.model.ts` — (from draft, verified) `idempotencyKey`/`idempotencyHash`/`expiresAt`/`refund` fields + partial unique index `(customer, idempotencyKey)`.
- `backend/src/modules/notifications/notification.service.ts` — `notifyCustomerOnce` (dedupe).
- `backend/src/modules/notifications/notification.repository.ts` — `existsFor` dedupe query.
- `backend/src/modules/notifications/notification.types.ts` — lifecycle types (`order_created`, `order_cancelled`, `order_expired`, `refund_initiated`, `refund_completed`, ...).
- `backend/src/modules/customer-payments/customer-payment.service.ts` — verification uses atomic `markPaidIfPayable`; explicit Cancelled/Expired order guards.
- `backend/src/modules/payments/payment.provider.ts` (draft, verified) — `refundCapability()` + optional `refund(providerTransactionId, amount)`.
- `backend/src/modules/payments/providers/khalti.provider.ts`, `esewa.provider.ts` (draft, verified) — `refundCapability(): "UNSUPPORTED"` with rationale.
- `backend/src/modules/inventory/inventory.repository.ts` — `finalizeReserved` (atomic stock finalization).
- `backend/src/modules/customer-orders/customer-order.service.ts` — idempotency key + payload fingerprint (SHA-256) + `expiresAt`; `order_created` notification; `ORDER_EXPIRY_MINUTES` config (default 120).
- `backend/src/modules/customer-orders/customer-order.controller.ts`, `.types.ts` — `Idempotency-Key` header (opaque, trimmed, <=200 chars).
- `backend/test/inventory-cart-hardening.test.ts` — removed two unused bindings (pre-existing typecheck failures).
- `docs/PRODUCTION_OPERATIONS.md` — expiry-sweep deployment instructions.

## 6. Order State Machine (16A)

```
ALLOWED_TRANSITIONS (order.status, enforced in orderService.setStatus):
Pending    -> Processing, Cancelled, Expired
Processing -> Shipped, Cancelled
Shipped    -> Delivered, Refunded
Delivered  -> Refunded
Cancelled / Refunded / Expired -> terminal
```

Invariants now enforced (service + atomic DB guards):
- Paid payment + Cancelled order is impossible (`cancelIfCancellable` filter excludes
  `payment.status in {Paid, Refunded}`; `markPaidIfPayable` excludes
  `status in {Cancelled, Expired, Refunded}`).
- Refunded without a successful payment is impossible (refund requires
  `payment.status === "Paid"` and caps the amount at the captured amount).
- Cancelled/Expired orders hold no reservation (release on both transitions).
- Expiry and verification resolve atomically; whoever commits first wins.

## 7. Payment Lifecycle

`Pending -> Initiated -> Paid | Failed`, terminal guards for `Paid` (idempotent duplicate),
`Refunded/Cancelled` (400), `Failed` (fresh initiate required). Verification amount-matches
the server-side total (+/-1 paisa) and now commits `Paid` through the guarded
`markPaidIfPayable` atomic update (16F), so a concurrent cancel/expire can never be
overwritten by a late verification.

## 8. Inventory Lifecycle (16I)

`reserveStock` (atomic, oversell-safe, unchanged) -> `releaseReserved` (clamped >= 0, on
cancel/expire/refund) -> `finalizeReserved` (NEW): on `Delivered`, the reservation becomes
a sale — `stock` and `reserved` both decrease by exactly `min(reserved, qty)` in a single
pipeline update; `stock >= 0`, `reserved >= 0`, `reserved <= stock` always hold; double
finalization is clamped to zero (the transition table also guarantees `Delivered` is
reached once). `available = stock - reserved` stays consistent throughout.

## 9. Expiry Mechanism (16C)

- Persisted `expiresAt` set at order creation (`ORDER_EXPIRY_MINUTES`, default 120).
- `orderRepository.listPendingToExpire(before)` selects Pending/Initiated past-deadline orders.
- `orderRepository.expirePendingById` performs an atomic guarded transition to
  `Expired` (order + payment) — concurrent expiry/verification cannot both win.
- `orderService.expireOrder(id)` releases reservations exactly once (only after the
  atomic transition succeeds), decrements coupon usage, and emits one de-duplicated
  `order_expired` notification.
- `orderService.expirePendingOrders()` sweeps all candidates; callable from cron /
  K8s CronJob / cloud scheduler or via `POST /api/v1/orders/expire-pending` (admin).
  No unreliable in-process timer was added.

## 10. Idempotency (16B)

- Opaque `Idempotency-Key` header, scoped to the authenticated customer (never client-scoped).
- Persisted on the order with a partial unique index `{ customer: 1, idempotencyKey: 1 }`
  (`partialFilterExpression: idempotencyKey $type string`) — DB-level uniqueness.
- SHA-256 fingerprint of the client-authored payload; same key + different payload -> 400.
- Repeated request returns the original order (idempotent; no duplicate reservations).
- Concurrent duplicates: the unique index lets exactly one create win; losers roll back
  their own reservations/coupon and return the winner's order (duplicate-key recovery).
- Failed creation never permanently consumes the key (rollback + no order persisted).

## 11. Refund Implementation (16E)

`PaymentProviderInterface.refundCapability()` -> `SUPPORTED | UNSUPPORTED`; optional
`refund(providerTransactionId, amount)` -> `{ status: PENDING|SUCCESS|FAILED, providerRef }`.
Both built-in providers (Khalti, eSewa) return UNSUPPORTED — no refund API or credentials
exist in this repository, so no real gateway refund is claimed.

Admin refund flow (`POST /api/v1/orders/:id/refund`, `orders:edit`):
1. Requires `Shipped`/`Delivered` + `payment.status === "Paid"`; refunds a completed
   payment only; amount (server-capped) <= paid amount.
2. Persists a `PENDING` refund record first (crash-safe intent).
3. Calls the gateway outside any MongoDB transaction.
4. SUCCESS -> order `Refunded`, payment `Refunded`, refund `SUCCESS` + providerRef; stock released; `refund_completed` notification.
5. UNSUPPORTED -> documented status-only refund, refund record `UNSUPPORTED` (no fabricated providerRef).
6. FAILED/throw -> refund record `FAILED`, order unchanged (never falsely Refunded), 503; retry allowed.
7. PENDING (gateway accepted) -> order NOT yet Refunded; `refund_initiated` notification.
8. Completed refunds are idempotent (retry returns the recorded outcome; gateway called once).

## 12. Notification Lifecycle (16D)

Events: `order_created`, `payment_initiated`, `payment_successful`, `payment_failed`,
`order_cancelled`, `order_expired`, `refund_initiated`, `refund_completed`,
`order_status_changed` (Processing/Shipped/Delivered). All delivered via
`notifyCustomerByCrmCustomerId` -> `notificationService.notifyCustomerOnce`, which dedupes
on `(recipientId, recipientType, type, entityId)` so retried operations never duplicate.
Notifications are always scoped to the owning customer's account; other customers never
receive or can read them (the customer notification surface is ownership-scoped).

## 13. Fulfillment (16H)

Minimal model on the existing order statuses: `Pending -> Processing -> Shipped ->
Delivered`, admin-only via `requirePermission("orders","edit")`, invalid transitions
rejected, timeline preserved per transition, customers read status/timeline via the
ownership-scoped customer order APIs and cannot mutate anything. Carrier/tracking fields
remain external-dependent (documented, not fabricated).

## 14. Webhook/Callback Security (16J)

Existing design verified and preserved: callbacks are reference-bound
(`providerTransactionId` -> order lookup, order-mismatch -> 404), idempotent via terminal
guards, and amounts/statuses are never trusted from the payload — the provider is
re-verified server-side. Neither Khalti nor eSewa in this integration exposes a usable
standalone webhook-signature mechanism (callbacks carry verification data that is validated
by server-side lookup instead); this is documented rather than fabricated. Replay of a
reference is safe: verification is idempotent and guarded atomically.

## 15. Security Preservation

JWT auth, refresh sessions, httpOnly cookies, SameSite, CORS allow-list, rate limiting,
IDOR ownership scoping, server-authoritative prices/amounts, inventory atomicity, request
logging with secret redaction — all unchanged and re-verified by the existing suites
(auth, authorization, security, production-hardening, customer-payments, notifications)
plus the new Phase 16 suite. No secrets, gateway keys, or tokens in storefront code/tests;
tests use seeded fake credentials only.

## 16. API Changes (additive only)

- NEW `POST /api/v1/orders/expire-pending` (admin) -> `{ data: { expired: string[] } }`.
- `POST /api/v1/orders/:id/refund` now accepts optional `amount` (server-capped).
- `POST /api/v1/customer/orders` now honours the optional `Idempotency-Key` header.
- Order DTO adds `expiresAt` and `refund` (additive; response envelope unchanged).
- GET `/api/v1/orders` status filter now accepts `Expired`.

## 17. Database Changes

Additive only: order fields `idempotencyKey`, `idempotencyHash`, `expiresAt`, `refund`
(embedded); partial unique index `{ customer: 1, idempotencyKey: 1 }`; existing indexes
untouched; no collections dropped/recreated; existing documents remain valid (new fields
are optional). The duplicate-index warning observed for `customerAccountId` is pre-existing.

## 18. Tests Added

`backend/test/phase16-lifecycle.test.ts` (21 tests):
- 16B: retry returns same order; different payload rejected; concurrent duplicates -> one order + no leaked reservations; per-customer key scoping; failed create frees the key.
- 16C: expiry releases reservation; non-expired untouched; paid never expired; idempotent sweeps; expired cannot become Paid; concurrent expiry-vs-verification mutual exclusion with `reserved <= stock`.
- 16D/G: cancel releases stock + exactly one notification to the owner; Paid order cannot be cancelled; invalid transitions rejected.
- 16E: gateway refund success (providerRef recorded, correct args, stock released); gateway rejection -> 503, order unchanged, retryable; duplicate refund executes gateway once; over-amount and unpaid refunds rejected; UNSUPPORTED -> documented status-only refund.
- 16F: Cancelled order can never become Paid (provider not even called); wrong amount -> Failed, not Paid; duplicate verification -> single timeline entry + single notification.
- 16H/I: Pending->Processing->Shipped->Delivered finalizes stock exactly once (stock 100->99, reserved 0); fulfillment notifications only to the owner; retried lifecycle ops create no duplicate notifications; IDOR (B cannot read/track A's order); unauthenticated lifecycle access rejected.

## 19. Test Results

- Backend: `npm test` -> Test Files 21 passed (21) · Tests 286 passed (286).
- Storefront: `npm test` -> Test Files 20 passed (20) · Tests 148 passed (148).
- Typecheck: backend `tsc --noEmit` PASS; backend `tsconfig.test.json` PASS; storefront `npm run typecheck` PASS.
- (Baseline was 259 backend / 148 storefront; +21 new Phase 16 tests, and 6 coupon tests
  restored to passing by reinstating the Phase 7 coupon-reservation block.)

## 20. Concurrency Verification

- Concurrent duplicate order creation (3 parallel requests, same key) -> exactly one order; losers' compensating rollbacks leave `reserved` correct.
- Concurrent expiry vs payment verification -> atomic guards give a mutually exclusive outcome; `reserved <= stock` holds in both branches.
- Concurrent verify vs cancel -> `markPaidIfPayable` / `cancelIfCancellable` guarded `findOneAndUpdate` can never both win.
- Coupon global/per-customer concurrent redemption limits remain enforced (existing Phase 7 tests green).

## 21. IDOR Verification

Customer A's order is 404 for customer B on detail + tracking; lifecycle notifications
route only to the owning CustomerAccount (asserted recipient equality); admin lifecycle
routes require authentication + permission; customer tokens cannot mutate fulfillment,
payment, or refund state (no customer routes exist for them; unauthenticated -> 401).

## 22. Failure Scenarios

- Gateway initiate failure -> 503, order untouched. Gateway verify failure -> 503.
- Verify amount mismatch -> payment `Failed`, order `Pending`, never Paid.
- Refund gateway failure -> refund record `FAILED`, order stays Shipped, 503, retryable.
- Refund PENDING -> order not yet Refunded.
- Order doc insert failure during create -> stock + coupon reservations rolled back; idempotency key reusable.
- Expiry sweep crash mid-run -> each order's expiry is independently atomic; next run resumes.

## 23. Deployment Requirements

1. Schedule the expiry sweep every 5–15 minutes (see `docs/PRODUCTION_OPERATIONS.md`):
   cron/K8s CronJob/cloud scheduler calling `POST /api/v1/orders/expire-pending` with an
   admin credential, or a worker invoking `orderService.expirePendingOrders()`.
2. MongoDB indexes are created automatically by Mongoose on startup (including the new
   partial unique index) — no manual migration needed.

## 24. Environment Requirements

- Optional: `ORDER_EXPIRY_MINUTES` (minutes; default 120) — read from `process.env` at
  module load; must be a positive integer, otherwise 120 is used.
- No new dependencies; no new required secrets. Refund stays UNSUPPORTED until a provider
  refund API + credentials are configured (then implement `refund()` on the provider and
  return `SUPPORTED`).

## 25. Known Limitations

- Real gateway refunds are PROVIDER-LIMITED: Khalti/eSewa refund APIs and credentials are
  not configured in this repository; the abstraction + full outcome state machine are in
  place and tested at the provider boundary (mocked), but no live gateway refund call is
  claimed or executed.
- Carrier/tracking numbers, delivery confirmation, and customer self-service
  cancel/return (P2 G11) are not implemented (external-dependent / deferred).
- MongoDB multi-document transactions are still not used (matches existing architecture);
  consistency is achieved via atomic guarded single-document updates + compensating
  rollbacks.

## 26. Deferred P2/P3 Items

- G3 partial refunds (amount cap exists; per-line/partial refund accounting deferred).
- G5/G6 shipment records (courier, tracking number/URL), delivery confirmation.
- G8 standalone webhook nonce store; G9 admin actor-attribution audit store.
- G11 customer self-service cancel/return routes; G14 (P3) as per gap analysis.

## 27. Regression Verification

All pre-existing suites green: auth, authorization, security, production-hardening,
customer-auth, customer-addresses, customer-coupons (incl. the 5 coupon tests restored
after reinstating the Phase 7 reservation block), customer-notifications,
customer-notification-events, customer-payments, customer-reviews, cart-wishlist,
inventory-cart-hardening, media, notifications, public-catalog-media, public-seo,
support-conversations, payment.provider. Storefront 148/148 unchanged; no storefront file
modified.

## 28. Definition of Done (gap analysis §27)

- [x] Order/payment invariant enforced: no Paid on Cancelled; verify rejects Cancelled/Expired; atomic guards.
- [x] Order-create idempotency (customer-scoped key, DB unique index, fingerprint, duplicate-key recovery); mark-Paid is conditional (`markPaidIfPayable`).
- [x] Expiry release callable + schedulable; `available = stock - reserved` holds; no double-release.
- [x] Refund executes through the provider abstraction with server-side amount + refund reference + duplicate guard; UNSUPPORTED path documented (PROVIDER-LIMITED for live gateways).
- [x] Refund amount validated (<= paid amount, > 0).
- [x] Cancel/refund/expiry/fulfilment emit de-duplicated customer notifications.
- [x] Customer self-service cancel/return — DEFERRED (P2).
- [x] Fulfillment/shipment: transition model + finalization done; carrier tracking marked external-dependent.
- [x] Automated tests for every implemented lifecycle path; backend 286/286, storefront 148/148.
- [x] No business behaviour, API contract, or Phase 12–15 security control regressed.

## 29. Final Verification

- Backend typecheck: PASS · Backend test typecheck: PASS · Backend tests: 286/286 PASS
- Storefront typecheck: PASS · Storefront tests: 148/148 PASS
- Phase 16 suite: 21/21 PASS
- Security / IDOR / Concurrency / Idempotency / Expiry / Verification / Notifications /
  Fulfillment: PASS (see sections above)
- Refund: PASS at the provider-abstraction boundary; live gateway refund PROVIDER-LIMITED

## 30. Final Verdict

All implementable Phase 16 requirements are implemented, tested, and green. The two
externally dependent capabilities (live gateway refunds, carrier tracking) are honestly
marked PROVIDER-LIMITED / external-dependent rather than claimed.

PHASE 16 STATUS: COMPLETE
