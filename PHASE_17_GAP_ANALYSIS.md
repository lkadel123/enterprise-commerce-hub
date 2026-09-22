# PHASE 17 — CUSTOMER ORDER LIFECYCLE, PAYMENT STATUS & FULFILLMENT UX
## STRICT READ-ONLY GAP ANALYSIS

> Read-only analysis. No source code, tests, configuration, or dependencies were modified.
> Every finding below cites exact files/lines inspected in the working tree at analysis time.
> Phase reports were NOT trusted over source code; several Phase 16 backend behaviors were
> verified directly and several were found to be **unexposed or mismatched** in the storefront.

---

## 1. Executive Summary

The Phase 16 backend lifecycle (idempotent creation, expiry + release, atomic payment
verification, guarded cancellation, provider-refund abstraction, de-duplicated lifecycle
notifications, fulfillment transitions, stock finalization) is real and tested at the
backend. The storefront, however, was built against the **pre-Phase-16** contract and has
not been updated for it. The result is a customer-facing lifecycle with three broken or
unwired seams:

1. **Gateway return flow is broken outside the E2E mock.** `KHALTI_RETURN_URL` /
   `ESEWA_SUCCESS_URL` / `ESEWA_FAILURE_URL` point to `/payment/...` pages that do not
   exist in the storefront (the only `/payment/*` routes in the repository live in the
   admin console app at repository root `src/routes/`, not the storefront), and
   `.env.example` points them at port 5173 while the storefront dev server runs on **8090**
   (`storefront/vite.config.ts:15`). The storefront compensates by polling
   `GET /customer/payments/:orderId/status` on the confirmation page, but a customer who
   returns from a real gateway lands on a 404 unless the deployment re-points the URLs.
2. **Notification deep links are wrong.** Backend lifecycle notifications emit
   `actionUrl: /customer/orders/:id`; the storefront route is `/account/orders/$orderId`.
   Every order/payment/refund notification links to a non-existent storefront path.
3. **The storefront never sends the Phase 16 `Idempotency-Key`**, so the backend's
   order-creation idempotency — its primary defense against duplicate orders from retries —
   is unused by the only client that places orders.

Additionally the storefront type model has drifted (`Expired` status, `refund`, `expiresAt`
missing from `OrderDto`/status unions), there is **no customer cancellation or refund UX at
all** (and no backend customer cancel/refund routes either — Phase 16 deferred these), and
review eligibility is not linked to delivered orders.

No P0 (money-loss / data-leak / correctness-critical) defect was found in the implemented
paths: payment success is server-authoritative end-to-end, ownership is enforced
server-side on every customer surface, and no private data reaches unauthenticated SSR HTML
(protected queries are gated by `useCustomerAuthReady()`; SSR renders the auth-pending shell
only).

**Verdict: READY FOR IMPLEMENTATION** — all gaps are implementable storefront/backend
additions; none is a code blocker.

## 2. Authoritative Sources & Phase-Numbering Conflict

Read and used: `docs/frontendarchitecture.md`, `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`,
`docs/PRODUCTION_OPERATIONS.md` (incl. the Phase 16C expiry-sweep section),
`docs/PRODUCTION_ENVIRONMENT.md`, `docs/PRODUCTION_RELEASE_RUNBOOK.md`,
`PHASE_11_REPORT.md`, `PHASE_12/13_IMPLEMENTATION_REPORT.md`, `PHASE_14_GAP_ANALYSIS.md`,
`PHASE_15_IMPLEMENTATION_REPORT.md`, `PHASE_16_ORDER_PAYMENT_FULFILLMENT_GAP_ANALYSIS.md`,
`PHASE_16_IMPLEMENTATION_REPORT.md`.

**Conflict documented:** report naming is inconsistent across phases (`PHASE_11_REPORT.md`
vs `PHASE_12_IMPLEMENTATION_REPORT.md` vs `PHASE_14_GAP_ANALYSIS.md`), and the repository
contains **two** front-end applications: the admin console (repository root `src/`, which
contains `src/routes/payment.success.tsx` / `payment.failure.tsx`) and the customer
storefront (`storefront/`). Older documents sometimes blur these two. This analysis treats
`docs/CUSTOMER-WEBSITE-ARCHITECTURE.md` + the `storefront/` source tree as authoritative
for the customer-facing lifecycle, and the actual completed phase sequence (Phase 16 report
present; 16A–16I behavior verified directly in `backend/src/modules/orders/order.service.ts`)
as authoritative over any prose.

## 3. Verified Architecture Baseline (from source, not reports)

Backend (direct inspection):
- `backend/src/modules/orders/order.service.ts` — idempotency pre-check + duplicate-key
  recovery; `expiresAt` deadline; atomic `cancelIfCancellable` / `markPaidIfPayable` /
  `expirePendingById`; provider-capability refund flow; fulfillment notifications;
  `finalizeReserved` on Delivered (all present in source).
- `backend/src/modules/customer-orders/customer-order.routes.ts` — customer surface is
  create / list / getById / tracking ONLY. **No customer cancel route. No customer refund
  route.** Cancellation and refund remain admin-only.
- `backend/src/modules/customer-payments/customer-payment.routes.ts` — initiate/verify/
  status (customer-authenticated) + `POST /:orderId/callback` (public, reference-bound,
  idempotent).
- `backend/src/modules/payments/providers/khalti.provider.ts:61` — gateway `return_url` =
  `env.KHALTI_RETURN_URL`; `esewa.provider.ts` uses `ESEWA_SUCCESS_URL` / `ESEWA_FAILURE_URL`.
- `backend/.env.example:93-103` — `KHALTI_RETURN_URL=http://localhost:5173/payment/khalti`,
  `ESEWA_*_URL=http://localhost:5173/payment/esewa/{success,failure}`,
  `PAYMENT_CALLBACK_BASE_URL=http://localhost:4000`.
- Lifecycle notifications (`order.service.ts`, `customer-payment.service.ts`) emit
  `actionUrl: "/customer/orders/<id>"`.

Storefront (direct inspection):
- `storefront/vite.config.ts:15` — dev server port **8090**; TanStack Start (SSR-capable).
- Routes present: `/order-confirmation/$orderId`, `/account/orders` (index + `$orderId`),
  `/account/notifications`, `/account/support/*`, `/checkout`. **No `/payment/*` route
  exists anywhere under `storefront/src/routes/`** (verified by directory listing and
  `Test-Path`; payment result pages exist only in the admin console root app).
- `storefront/src/lib/api/orders.ts` — create/list/getById/getTracking; **no cancel client,
  no refund client**; `create()` does **not** send an `Idempotency-Key` header.
- `storefront/src/features/checkout/checkout-hooks.ts` — `usePaymentStatusQuery` polls
  every 5s while Pending/Initiated; `usePlaceOrderMutation` sends the body only.
- `storefront/src/types/index.ts:326-331` — `OrderStatus` / `PaymentStatus` **lack
  `"Expired"`**; `OrderDto` (lines 380-397) **lacks `refund` and `expiresAt`**.
- `storefront/src/components/common/StatusBadge.tsx:11-33` — no intent mapping for
  `expired` / `initiated` (falls through to the default gray variant).
- `storefront/src/routes/account.orders.index.tsx:28-36` — status filter offers no
  `Expired` option.
- `storefront/src/lib/api/client.ts` — in-memory access token, single-flight 401 refresh,
  `credentials: "include"`; two `console.debug` calls in production code (lines 169, 220).
- E2E `storefront/e2e/journeys.spec.ts:144-189` — COD + wallet checkout with the gateway
  mocked at the network boundary (`/mock-khalti/*`); the mock returns to `localhost:8090`.
  Phase 15/16 reports record E2E as BLOCKED in the working environment (no verified
  Playwright execution); this analysis repeats that observation rather than claiming E2E.

## 4. Detailed Lifecycle Audit (scope sections 3–12)

### Order Confirmation (`storefront/src/routes/order-confirmation.$orderId.tsx`)
Present and correct: `noindex` head; `AuthGuard`; loading skeleton (`aria-busy`); error
state with retry and honest "may belong to another account" copy; authoritative payment
status via `usePaymentStatusQuery` (5s poll while Pending/Initiated) with the order's
embedded payment snapshot only as pre-poll fallback; server-rendered totals/items; retry
payment with wallet selection; "Retrying uses your existing order" copy; refresh-status
button for gateway orders.
Gaps: no "View your order" link to `/account/orders/$orderId` (only "Continue shopping" /
"Back to cart" — the cart is empty at this point); the `Expired` payment/order state has no
dedicated UX (raw gray badge; retry will 400); the order query (`["order", orderId]`) is
never invalidated when the poll observes `Paid`, so the fallback snapshot can go stale
within a visit (impact limited because the polled DTO is used first).

### Order History (`storefront/src/routes/account.orders.index.tsx`)
Present and correct: pagination (`keepPreviousData`), status filter, desktop table +
mobile cards, empty/error/loading states, `aria-live` page indicator, 44px targets,
ownership enforced server-side.
Gaps: filter list omits `Expired` (backend accepts it); no date-range/sort control although
`ordersApi.list` forwards `from`/`to`/`sort`; no refund/expiration indicators beyond raw
status badges.

### Order Detail (`storefront/src/routes/account.orders.$orderId.tsx`)
Present and correct: ownership-scoped queries (404 for others), server-derived amounts,
shipping address, payment failure reason (`role="alert"`), tracking timeline from the
dedicated endpoint, semantic `<ol>` with `aria-label`.
Gaps: no payment retry entry (retry lives only on the confirmation page — a customer with a
Failed wallet payment in history has no recovery path from the detail page); no refund
state display (`OrderDto.refund` is absent from the storefront type); no cancellation
affordance (none exists server-side either); no support entry point even though the backend
supports `relatedOrderId` and the support page already loads the customer's own orders.

### Tracking / Fulfillment
Statuses render as raw string badges; the timeline renders backend labels ("Processing",
"Shipped", "Delivered", "Payment Paid", "Order expired — payment not completed"). No
carrier / tracking number / tracking URL / estimated delivery exists anywhere (backend has
no such fields — consistent with Phase 16 scope). Unknown/legacy statuses degrade to the
default gray badge with raw text (documented degradation). Tracking is fetched once; status
changes are only visible on revisit.

### Payment UX
- COD / Bank Transfer: order placed -> confirmation page, no gateway initiation. Correct.
- Digital Wallet: full-page redirect using ONLY the backend-provided `paymentUrl`. Safe.
- Verification: the client never posts amounts; the primary path is the backend callback +
  status polling. Client never determines success. Refresh after callback is safe
  (idempotent terminal guards); back/forward is safe (the confirmation page re-polls).
- Broken seam: the gateway `return_url` does not resolve to any storefront route
  (Finding G17-01). The E2E mock redirects to `:8090`, hiding this gap.
- Expired payment: the backend rejects initiation/verification for expired orders, but the
  storefront has no expired-state recovery UX ("order expired — place a new order").

### Cancellation / Refund UX
No customer-facing cancellation exists (no backend route; no client; no UI/dialog).
Refund status is invisible to customers. The storefront therefore never promises a money
movement the provider cannot perform (no refund promise exists) — but the Phase 16
`refund_completed` / `refund_initiated` notifications deep-link to a non-existent route and
there is no page where the customer can see the refund state they refer to.

### Notifications
`/account/notifications` lists, filters, marks read/all-read, deletes, and renders internal
`actionUrl` links starting with `/` — but backend order-related `actionUrl`s point to
`/customer/orders/:id` (Finding G17-02). Unread badge uses a 30s staleTime and no
refetch-on-focus; lifecycle events are not pushed client-side (documented polling posture).
Types render as raw badge text (no humanized labels).

### Review Eligibility
Backend (`customer-review.service.ts`) requires only an Active/searchable product and
enforces one review per (customer, product) via a unique index + concurrency-safe
duplicate check. There is NO Delivered-order requirement and no order→review linkage; the
storefront has no "review your delivered order" flow. Business-policy decision required
(classified P2).

### Support Integration
`/account/support` lets the customer pick one of their own recent orders as
`relatedOrderId` (`account.support.index.tsx:34-56`); the backend re-checks ownership.
Conversations/messages/status updates work with proper cache invalidation. Support works
identically after cancellation/refund/delivery (no state gating). Only gap: no entry point
from the order detail page.

### Inventory Relationship
Cart add/update clamps server-side; order creation reserves atomically; cancel/expire
releases; Delivered finalizes stock. Storefront availability is computed live by the
backend (public product API + cart API). The only stale-cache risk is a held-open cart tab
whose quantities were since reserved/expired elsewhere; checkout re-validates server-side
and surfaces the existing insufficient-stock error. No defect found; consistency is
maintained by the backend.

## 5. API Client / Query Audit (scope 13)

- Endpoints/methods/bodies in `storefront/src/lib/api/*` match the backend routes
  (verified file-by-file); the gateway callback endpoint is correctly NOT exposed
  client-side.
- Query keys: `["order", orderId]` is shared between `checkout-hooks` and the order detail
  page (consistent), but nothing invalidates it after payment success; `["orders","list"]`
  is not invalidated after placing an order (fresh navigation in E2E masks this).
- Mutations: no optimistic updates in the lifecycle (safe); order queries use
  `retry: false` (good for 404), mutations use the TanStack default (3 retries) — a
  `placeOrder` retry after a network timeout can create a duplicate order because no
  `Idempotency-Key` is sent (Finding G17-03).
- Error mapping is consistent via `ApiClientError` + `apiErrorMessage`.
- `storefront/src/lib/api/client.ts` ships two `console.debug` calls (lines 169, 220).
## 6. SSR / Hydration (scope 14)

Verified: TanStack Start SSR renders only the authenticated shell for protected routes —
all protected queries are gated by `useCustomerAuthReady()` (which is false until the
session is restored on the client), so no private order/payment/notification data is
fetched during SSR and none can appear in unauthenticated/unauthored SSR HTML. The
confirmation route sets `noindex, nofollow` in the head. Page-level auth is enforced by
`AuthGuard` (`/account` layout `account.tsx:115`; confirmation `order-confirmation.tsx:48`).
The refresh token is an httpOnly cookie; the access token is in-memory only (never
localStorage). No hydration mismatch risk beyond the known `useCustomerAuthReady` false→true
transition, which is handled by the loading gate. **No private customer data leak to SSR
HTML found.**

Gaps (P3): the `:8090` dev origin and `noindex` are the only cache-control signals; there is
no explicit `Cache-Control: no-store` on SSR responses for `/account/*` or
`/order-confirmation/*` at the server middleware level (relies on authenticated, per-user
/content from the client). Worth confirming against the caching/CDN layer before
production.

## 7. Accessibility (scope 15)

Existing automated coverage is real and present: `e2e/accessibility.spec.ts` (axe scans
for critical/serious violations + color-contrast rule on key public routes) and
`e2e/security-and-a11y.spec.ts` (skip link first tab stop, focus moved to main, empty-login
focus first invalid field, reduced motion, keyboard/dialog behaviour). The unit/components
suite includes feedback-component and checkout-step tests. Lifecycle UI uses semantic
markup: `<ol>` timelines with `aria-label`, `status`/`alert` roles, `aria-live` page
indicators, 44px targets, `min-h-[44px]` buttons.
Gaps / caveats (P2): the axe scans enumerate public routes only (home/product/categories);
there is **no automated accessibility scan of the authenticated order-history, order-detail,
confirmation, or notifications pages**. Timeline semantics, status-announcement
(`aria-live` for status changes), dialog focus trap (only the mobile menu dialog is
tested), and focus management on the retry-payment/expired states are not covered by an
executed test. These are verification gaps, not necessarily defects. This analysis does not
claim automated a11y verification beyond the routes actually scanned.

## 8. Security / IDOR (scope 16)

Backend enforcement verified source-level: every customer surface
(`customer-orders`, `customer-payments`, `customer-notifications`, `support`, `addresses`,
`reviews`) scopes by the authenticated CRM customer derived from the session; ID-by-URL
returns 404 (never reveals ownership). Order creation ignores client identity; payment
callback is reference-bound and amount/server-verified server-side. IDs in URL/query params
and payment callbacks are all server-scoped.
Storefront behavior verified: product/order ids pass through URL params to ownership-scoped
endpoints; no customer id is ever sent; no private data in localStorage beyond a guest cart
(product ids + qty only). An E2E security journey asserts cross-customer order unreadable
(`journeys.spec.ts:205+`). Payment/refund/notification/support/review IDOR are covered by
existing backend suites (customer-payments, notifications, account-integration).
**No P0 IDOR defect found.**

## 9. Test Coverage (scope 17)

- Backend: Phase 16 added 21 lifecycle tests; existing suites cover payment verification,
  IDOR, notifications, inventory/cart concurrency. Verified via the Phase 16 backend run
  (286/286 in the working tree). No new backend test in this phase (none allowed).
- Storefront unit/component: accounts API integration tests (address/notification/support),
  checkout step tests, feedback tests — all real; the Phase 16 lifecycle types/endpoints
  (refund, Expired, idempotency) are NOT unit-tested client-side (types don't even include
  them).
- Playwright E2E: `journeys.spec.ts` COD + wallet (mocked gateway) + IDOR; `accessibility`.
  These exist but were NOT executed in this analysis environment (reports mark E2E BLOCKED).
  Do not count them as passing here.
- **Tests that exist only by name:** none found — every test inspected has real behavioral
  assertions. However, several lifecycle behaviors that are implemented backend-side have
  **no storefront test** (payment-return rendering, refund state rendering, Expired display,
  notification deep-link correctness, idempotency header, cart invalidation after order).

## 10. Production Readiness (scope 18)

A) Code gaps (this phase): finding set below; core risk = gateway return-URL mismatch,
notification deep-link mismatch, missing Idempotency-Key usage, missing
cancel/refund/expiry customer UX.
B) Test gaps: no executed automated E2E in this environment; no authenticated-page
axe/accessibility scan; client-side lifecycle unit tests absent.
C) Configuration gaps: `.env.example` return URLs point at port 5173 (admin console), not
the 8090 storefront; must be aligned to the real storefront origin in production.
D) Deployment/provider gaps: **no real payment credentials/callbacks configured** — the
repository ships no usable Khalti/eSewa production credentials and relies on the public
callback for return-URL routing; the **expiry scheduler is a required deployment**
(Phase 16C documented sweep, no cron installed); **live gateway refunds are UNSUPPORTED**
(no refund API/credentials — nothing to call); carrier/tracking integration is absent.
E) Business decisions: (1) allow customer-initiated cancellation while paid (requires a
refund flow)? (2) require Delivered for product reviews? (3) allow customer refund
requests? All currently absent and unowned.

## 11. Gap Classification (scope 19)

| ID | Pri | Area | Current | Expected | Evidence | File(s)/fn | Risk | Remediation | Test |
|---|---|---|---|---|---|---|---|---|---|
| G17-01 | P1 | Payment return flow | Gateway return URLs `/payment/...` resolve to no storefront route; `.env.example` points to port 5173 (admin app) not 8090 | Real return lands on a storefront payment-result/confirmation page; env originates to 8090 | `backend/.env.example:93-103`; `storefront/vite.config.ts:15`; no `storefront/src/routes/payment*.tsx`; `khalti.provider.ts:61` | `order-confirmation.$orderId.tsx`; add `/payment/*` or map return_url to `/order-confirmation/:id`; fix `.env.example` | Gateway return 404; payment states only via polling | Add storefront payment-result routes; fix env origin | E2E + unit |
| G17-02 | P1 | Notification deep links | Lifecycle `actionUrl`=`/customer/orders/:id`; storefront route is `/account/orders/:id` | Notifications link to the real order page | notify call sites; `account.notifications.tsx:111-120` | backend notify; storefront render | Every order/payment/refund notification link breaks | Align backend actionUrl to `/account/orders/:id` or map client-side | storefront unit + E2E |
| G17-03 | P1 | Idempotency | `ordersApi.create`/`usePlaceOrderMutation` send no `Idempotency-Key`; mutation default retries | Opaque customer-scoped key per checkout attempt; no duplicates on retry | `orders.ts:25-30`; `checkout-hooks.ts:93-103`; backend partial unique index | Retried place-order -> duplicate order | Send `Idempotency-Key`; keep stable across retries | storefront unit |
| G17-04 | P1 | Types drift | OrderStatus/PaymentStatus lack `Expired`; OrderDto lacks `refund`,`expiresAt` | Types mirror backend DTO | backend `order.types.ts` vs `storefront/src/types/index.ts:326-331,380-397` | Expired gray; refund invisible | Extend types; badge mapping for expired/initiated; add filter option | storefront unit |
| G17-05 | P2 | Cancellation UX | No customer cancel client/UI/dialog; no backend customer cancel route | Customer cancels eligible unpaid orders with confirmation, race-safe | `customer-order.routes.ts`; `orders.ts` | No self-service cancel | Add guarded customer cancel route + dialog | backend+storefront+E2E |
| G17-06 | P2 | Refund UX | No refund-state display; notifications only | Customer sees PENDING/SUCCESS/FAILED/UNSUPPORTED refund | `OrderDto.refund` absent; refund admin-only | Refund state invisible | Render refund from backend; honest labels | storefront unit |
| G17-07 | P2 | Retry on detail | Payment retry only on confirmation page | Retry a Failed/Pending wallet order from order detail | `account.orders.$orderId.tsx` (no retry) | No recovery from history | Reuse initiate/poll on detail | storefront + E2E |
| G17-08 | P2 | Expired UX | No expired branch; raw gray badge; retry 400s | Clear "order expired - place a new order" | `order-confirmation.$orderId.tsx`; `StatusBadge.tsx:11-33` | Confusing expired | Branch on Expired; map badge intent | storefront unit |
| G17-09 | P2 | Query invalidation | `["order",id]`,`["orders","list"]` not invalidated after payment success/placement; unread badge no focus refetch | Live order/notification state | `checkout-hooks.ts`; `account-hooks.ts:43-50` | Stale status/badge | Invalidate on payment success & placement; focus refetch | storefront integration |
| G17-10 | P2 | Review eligibility | No Delivered-order requirement; no order→review linkage | (decision) purchase-gated reviews | `customer-review.service.ts`; `products.$slug.tsx` | Business gap | Add Delivered gate + entry | backend+storefront |
| G17-11 | P2 | Support entry | No "help with this order" from detail | One click pre-associates `relatedOrderId` | `account.support.index.tsx:34-56` supports; detail lacks | Discoverability | Add order-detail support link | E2E |
| G17-12 | P3 | A11y coverage | Auth lifecycle pages not in axe scans; retry/expired/dialog focus untested | Extend scans/focus tests | `accessibility.spec.ts` public only | Verification gap | Extend axe/skip/focus to lifecycle pages | Playwright a11y |
| G17-13 | P3 | Console noise | Two `console.debug` in apiFetch | Remove/gate behind dev | `client.ts:169,220` | Log noise | Remove/gate | none |
| G17-14 | P3 | SSR cache headers | No explicit `Cache-Control: no-store` for account/confirmation SSR | Private-cache explicit | SSR responses; `noindex` only | CDN caching private SSR | Add cache-control | E2E/curl |

## 12. Readiness Scores (scope 20)

- Order confirmation: 70%
- Order history: 75%
- Order detail: 65%
- Tracking / fulfilment UX: 55%
- Payment UX: 70% (server-authoritative secure; return-URL seam broken -> not higher)
- Cancellation UX: 10%
- Refund UX: 15%
- Notifications: 60%
- Review lifecycle: 40%
- Support integration: 80%
- Inventory / cart consistency: 85%
- API / query layer: 70% (idempotency & invalidation gaps)
- SSR / privacy: 85%
- Accessibility: 60% (automation limited to public routes)
- Security / IDOR: 90%
- Test coverage: 60%
- Production readiness: 55%

**Overall Phase 17 readiness: ≈ 62%**

Scores are deliberately not inflated: the secure, ownership-safe backbone is strong, but the
customer-facing lifecycle is incomplete/unwired in the paying seams (return URL, deep links,
idempotency usage, cancel/refund/expiry UX, and storefront type drift).

## 13. File Impact Matrix (scope 21)

| File | Exists | Current purpose | Problem | Required action | Priority | Test impact |
|---|---|---|---|---|---|---|
| storefront/src/types/index.ts | Y | storefront types | lacks Expired/refund/expiresAt | extend OrderStatus/PaymentStatus/OrderDto | P1 | storefront unit |
| storefront/src/lib/api/orders.ts | Y | order client | no idempotency header, no cancel/refund | send Idempotency-Key; add cancel/refund when backend routes added | P1 | storefront unit |
| storefront/src/features/checkout/checkout-hooks.ts | Y | checkout hooks | no idempotency key; no post-payment invalidation | generate key; invalidate on paid/placed | P1 | storefront unit |
| storefront/src/routes/order-confirmation.$orderId.tsx | Y | confirmation | no Expired branch, no view-order link, stale fallback | add Expired UX + link; invalidate on paid | P2 | storefront unit + E2E |
| storefront/src/components/common/StatusBadge.tsx | Y | badge mapper | no expired/initiated intent | add mappings | P1 | storefront unit |
| storefront/src/routes/account.orders.index.tsx | Y | order history | filter omits Expired; no sort/date | add Expired option (+ optional sort/date) | P2 | storefront unit |
| storefront/src/routes/account.orders.$orderId.tsx | Y | order detail | no retry/refund/support/expired | add payment retry, refund display, support link, expired | P2 | storefront unit + E2E |
| storefront/src/routes/account.notifications.tsx | Y | notifications | displays wrong backend actionUrl | fix actionUrl mapping | P1 | storefront unit |
| backend/src/modules/orders/order.service.ts | Y | order lifecycle | notifies actionUrl /customer/orders/:id | change to /account/orders/:id | P1 | backend test |
| backend/src/modules/customer-orders/customer-order.routes.ts | Y | customer order surface | no customer cancel/refund routes | (decision) add guarded customer cancel/refund | P2 | backend tests |
| storefront/src/routes/*payment* | N | - | gateway return landing | add payment-result route(s) mapping to confirmation | P1 | E2E |
| backend/.env.example | Y | env doc | return URLs -> 5173 not 8090 | align to storefront origin | P1 | none |
| storefront/src/lib/api/account-integration.test.ts | Y | account tests | no lifecycle-return/refund/idempotency coverage | extend | P2 | - |
| storefront/e2e/accessibility.spec.ts | Y | a11y E2E | public routes only | add authenticated lifecycle pages | P3 | - |
| storefront/src/lib/api/client.ts | Y | http client | console.debug in prod | remove/gate | P3 | none |

## 14. Implementation Dependency Graph (scope 22)

1. Backend: align notification actionUrl to /account/orders/:id (G17-02); decide customer cancel/refund routes (G17-05/06).
2. Storefront types + StatusBadge mapping for Expired/initiated (G17-04).
3. API client: send Idempotency-Key on order create (G17-03).
4. Storefront payment-result route(s) + align .env.example return URLs to 8090 (G17-01); confirm E2E mock redirect target.
5. Query/state corrections: invalidate order/list/unread after payment success & placement (G17-09).
6. Order detail enhancements: payment retry, refund display, expired branch, support link (G17-06/07/08/11).
7. Cancellation UX (if backend route added): client + dialog + confirm (G17-05).
8. Review-eligibility decision + gating (G17-10).
9. Accessibility E2E for authenticated lifecycle pages (G17-12).
10. Production verification: return-URL reachability, expiry scheduler deployment, refund PROVIDER-LIMITED confirmation.

## 15. Definition of Done (scope 23)

- [ ] All P0 and P1 (G17-01..04) gaps resolved: gateway return-URL resolves; notification deep links work; Idempotency-Key sent; storefront types/badges cover Expired/refund.
- [ ] Payment success/pending/failed/expired states rendered server-authoritatively (client never decides success; no trusted amount fields).
- [ ] Cancellation/refund UX honest: never promises money movement the provider cannot perform; refund state (PENDING/SUCCESS/FAILED/UNSUPPORTED) displayed when present.
- [ ] Tracking functional for states the backend exposes; carrier fields deferred/external-dependent.
- [ ] Notification lifecycle correct and deep-linking; unread badge refreshed.
- [ ] Inventory/cart/order consistency maintained (same backend guarantees).
- [ ] IDOR verified (backend suites + E2E); SSR privacy re-verified (no private data in unauth SSR); cache-control added for private routes.
- [ ] Accessibility: automated checks cover authenticated lifecycle pages (or documented exceptions).
- [ ] Backend regression suite green; storefront regression suite green; E2E lifecycle tests executable/executed in CI.
- [ ] Production-only dependencies (payment credentials, callbacks/return URLs, expiry scheduler, refund-provider capability) explicitly documented.

## 16. Verification of This Report (scope 25)

1. UTF-8: file written as UTF-8 (no encoding errors observed).
2. File exists: `PHASE_17_GAP_ANALYSIS.md` at repo root (untracked `??` in `git status`).
3. Required sections present: findings, readiness scores, file impact matrix, dependency graph, definition of done, classification.
4. Logical order: sources -> baseline -> lifecycle audit -> SSR/a11y/IDOR/tests/readiness -> classification -> impact -> graph -> DoD -> verification -> final block.
5. No secrets/tokens/passwords/API keys/DSNs appear in this report (none were used).
6. No source files changed in Phase 17: only `PHASE_17_GAP_ANALYSIS.md` was created/edited; the pre-existing Phase 16 working-tree diff was already present and left untouched.
7. No dependencies installed.
8. `git status --short PHASE_17_GAP_ANALYSIS.md` confirms the report is the only Phase-17 addition (untracked).
9. Evidence paths above are exact and were inspected in source.
10. Ends with the required final status block.

## 17. Deferred / Provider-Dependent Items (scope 18 D/E)

- Live Khalti/eSewa gateway refund: PROVIDER-LIMITED (no credentials/API; nothing to call). No UI claims otherwise.
- Real payment initiation/verification: requires production credentials + public callback endpoints (not configured in this repo). E2E uses a `:8090`-origin mock.
- Carrier/tracking numbers, tracking URL, estimated delivery: absent; external integration deferred.
- Order-expiry scheduler: required deployment (Phase 16C `orderService.expirePendingOrders()`); no cron installed in this repo.
- Customer self-service cancel/refund: BUSINESS DECISION + backend routes required before the storefront can offer them.
- Review eligibility (Delivered-gated reviews): BUSINESS DECISION and backend enforcement required.

PHASE 17 STATUS: READ-ONLY GAP ANALYSIS COMPLETE

VERDICT: READY FOR IMPLEMENTATION

READINESS: 62%

P0: 0
P1: 4
P2: 7
P3: 3

FILES MODIFIED: 0
DEPENDENCIES INSTALLED: 0

REPORT: PHASE_17_GAP_ANALYSIS.md

IMPLEMENTATION STATUS: NOT STARTED
