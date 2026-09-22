# Payment Gateway Migration — Cybersource Unified Checkout

**Final Audit & Implementation Report (Phases 1–19)**

## 1. Previous payment gateway identified

The legacy online gateways were **Khalti** and **eSewa** (Nepali redirect-based
gateways). They were already fully decommissioned in this working tree:

- Their provider modules (`providers/khalti.provider.ts`,
  `providers/esewa.provider.ts`) are gone; `providers/` contains only
  `cybersource/`.
- Their public callback route is gone.
- Their env vars (`KHALTI_SECRET_KEY`, `KHALTI_PUBLIC_KEY`, `KHALTI_BASE_URL`,
  `KHALTI_RETURN_URL`, `ESEWA_MERCHANT_CODE`, `ESEWA_SECRET_KEY`,
  `ESEWA_BASE_URL`, `ESEWA_SUCCESS_URL`, `ESEWA_FAILURE_URL`,
  `PAYMENT_CALLBACK_BASE_URL`) appear **nowhere in active source** — only in
  historical log/report artifacts.
- The storefront return page
  (`storefront/src/features/paymentReturn/PaymentReturnPage.tsx`) and the
  `/payment/khalti`, `/payment/esewa/{success,failure}` routes are removed.

**Historical data compatibility is preserved.** The `PaymentProvider` union
retains `"KHALTI" | "ESEWA"` **only as string literals** for records that
already exist in the database; they cannot be initiated, verified, or reached
by any active code path (`payment.providers.ts` exposes only `CYBERSOURCE`).

> Note on the brief: this repository is **not Next.js**. It is a Vite +
> TanStack Router + Nitro storefront (`storefront/`), an Express 5 + Mongoose 8
> + Zod backend (`backend/`), and a Vite admin console (`src/`). The Cybersource
> implementation follows the repository's own service-layer conventions
> (`backend/src/modules/payments/providers/*`) rather than a Next.js layout.

## 2. Files removed

| File | Reason |
| --- | --- |
| `backend/src/config/env.ts.bak` | Stale pre-migration backup of `env.ts` sitting inside `src/`; dead artifact. |
## 4. Cybersource files created (by this migration, verified present)

Backend (`backend/src/modules/payments/providers/cybersource/`):

- `cybersource.config.ts` — centralised config; env-driven API/JWKS hosts; fail-fast credential validation; no hardcoded URLs elsewhere.
- `cybersource-auth.ts` — HTTP Signature / HMAC-SHA256 request signing (digest, Date, v-merchant).
- `cybersource-client.ts` — fetch wrapper with 15s timeout, abort handling, safe error mapping, safe logging.
- `cybersource-session.ts` — `POST /uc/v1/sessions` capture-context creation + request builder + merchant-reference generator.
- `cybersource-token.ts` — RS256 JWT verification against Cybersource's JWKS (`/flex/v2/public-keys/{kid}`), kid allowlisting, key caching, expiry checks; client-library URL extraction + Cybersource-host allowlist.
- `cybersource-types.ts` — typed API subset (capture context, payment response, JWK).
- `cybersource.provider.ts` — `PaymentProviderInterface` implementation (Complete Mandate flow).

Backend customers surface (`backend/src/modules/customer-payments/`):

- `customer-payment.routes.ts` / `.controller.ts` / `.service.ts` / `.types.ts` / `.validator.ts` / `.repository.ts` — authenticated, ownership-scoped `initiate` / `verify` / `status`.

Storefront:

- `storefront/src/features/payment/CybersourceCheckout.tsx` — embedded Unified Checkout: server capture context → decode public session data → dynamic SDK load (URL + SRI from the capture context, never hardcoded) → `unifiedPayments.complete()` → server verify; lifecycle-safe (SSR guard, script dedupe, Strict-Mode in-flight lock, `destroy()` on unmount/retry).
- `storefront/src/features/payment/capture-context.ts` (+ `.test.ts`) — client-side public-session decoder with host allowlist.
- `storefront/src/lib/api/payments.ts` — typed API client (no financial fields ever sent).

## 5. Database changes

**None and none needed.** Payment state stays embedded in `Order.payment.*`
(`method`, `status`, `provider`, `transactionId`, `providerTransactionId`,
`amount`, `currency`, `initiatedAt`, `paidAt`, `failureReason`, `metadata`),
which already satisfies the storage requirements. No destructive migrations, no
data deletion. Historical `provider: "KHALTI"/"ESEWA"` values remain valid for
the `PAYMENT_PROVIDERS` enum (backward compatible).

## 6. Environment variables required

`backend/.env.example` (placeholders only, never committed):

```
CYBERSOURCE_ENVIRONMENT=test                 # test | production
CYBERSOURCE_MERCHANT_ID=replace-me
CYBERSOURCE_KEY_ID=replace-me
CYBERSOURCE_SHARED_SECRET=replace-me
# CYBERSOURCE_ORGANIZATION_ID=               # portfolio/multi-org only
CYBERSOURCE_CURRENCY=USD
CYBERSOURCE_LOCALE=en_US
CYBERSOURCE_COUNTRY=US
CYBERSOURCE_ALLOWED_CARD_NETWORKS=VISA,MASTERCARD
CYBERSOURCE_ALLOWED_PAYMENT_TYPES=CARD
CYBERSOURCE_REQUEST_TIMEOUT_MS=15000
CYBERSOURCE_COMPLETE_MANDATE_ENABLED=true
CLIENT_ORIGIN=http://localhost:8080          # also drives Unified Checkout targetOrigins
PUBLIC_BASE_URL=http://localhost:8090        # storefront public origin
```

Security rules enforced: **no `NEXT_PUBLIC_*`/`VITE_*` Cybersource variables
exist** (verified by repo-wide search); the shared secret never reaches the
browser; Zod validates the schema at boot (`backend/src/config/env.ts`) and
`cybersourceConfig.validate()` fails clearly at payment time when credentials
are missing/placeholder.

## 8. Payment flow (server-authoritative)

```
CUSTOMER → Checkout (/checkout) → place order (cart cleared only server-side)
   → /order-confirmation/:orderId
   → POST /customer/payments/:orderId/initiate (auth, ownership check)
   → server computes amount from Order.amounts.total (never from client)
   → POST /uc/v1/sessions (HTTP Signature)   [test: apitest.cybersource.com / prod: api.cybersource.com]
   → capture-context JWT + clientLibrary + SRI hash returned
   → browser decodes public session data only, injects the SDK (SRI-validated, allowlisted host)
   → Unified Checkout renders; customer pays
   → unifiedPayments.complete() → Cybersource-signed response token
   → POST /customer/payments/:orderId/verify
   → server: verify RS256 signature (JWKS), bind merchant reference (replay protection),
     match stored providerTransactionId, compare amount (minor units, ±1) + currency,
     check order not Cancelled/Expired/Paid/Refunded, then atomic markPaidIfPayable()
   → Paid/Failed/Pending reflected in Order.payment.*; storefront polls /status every 5s
```

Success is **never** decided from the frontend; a declined/tampered/amount-mismatch
token can never mark an order Paid.

## 9. Security measures implemented

- HTTP Signature (HMAC-SHA256) request authentication; server-only secrets.
- Amounts/currency/ownership always server-derived; request Zod schemas `.strict()`
  reject any client-supplied financial field.
- Customer ownership enforced via CRM-scoped lookup → 404 on foreign order IDs (no IDOR).
- Terminal-state guards (Paid/Refunded/Cancelled/Expired) + atomic `markPaidIfPayable`
  to win races.
- Idempotent verification (duplicate → no re-mark, single timeline entry/notification).
- Signed-token verification: RS256 only, kid allowlisted, JWKS key cache, expiry checks,
  merchant-reference binding, library-host allowlist, SRI on the script tag.
## 10. Test results (this run)

| Suite | Result |
| --- | --- |
| `backend` full suite (`vitest run`) | **23 files / 319 tests passed** |
| `test/cybersource-provider.test.ts` | 18/18 (config validation, missing credentials, HTTP signature, amount formatting, session creation, invalid client-library host, AUTHORIZED→Paid, wrong reference, tampered signature, unknown key, DECLINED/PENDING_AUTHENTICATION mapping, missing token) |
| `test/customer-payments.test.ts` | 14/14 (401s, IDOR 404, tampered amount 422, financial-field rejection, unsupported gateway, malformed id, uninitiated verify 400, state guards, notification ordering) |
| `test/phase16-lifecycle.test.ts` | incl. verify happy path → Paid, amount mismatch → Failed, idempotent duplicate verify, cancelled/expired never become Paid |
| Storefront `capture-context`, `checkout-validation`, `checkout-hooks` | 24/24 |

No real credentials are used; `fetch`/JWKS/provider are mocked.

## 11. Build / typecheck / lint results

- Backend `tsc --noEmit`: **pass**
- Backend production build (`tsc -p tsconfig.json`): **pass**
- Storefront `tsc --noEmit`: **pass**
- Storefront production build (`vite build`): **pass**
- ESLint (TypeScript/react-hooks logic rules) on all payment files: **0 errors**
  (after fixing the only two `no-explicit-any` findings)
- Prettier: the repo-wide baseline (CRLF on-disk vs LF-expected and pre-existing
  formatting drift across **all** files incl. committed admin code) is untouched,
  per the instruction not to refactor unrelated legacy lint noise.

## 12. Manual Cybersource dashboard configuration still required (cannot be done from code)

1. **Merchant ID** (`CYBERSOURCE_MERCHANT_ID`) — from the Business Center.
2. **HTTP Signature key** — Key ID (`CYBERSOURCE_KEY_ID`) + **Shared Secret**
   (`CYBERSOURCE_SHARED_SECRET`), created under Payment Configuration →
   Key Management. **Never** use the dashboard username/password.
3. **`CYBERSOURCE_ENVIRONMENT=production`** switch + production credentials
   when going live (test creds are for `apitest.cybersource.com`).
4. **Enabled payment methods / card networks** must be activated on the merchant
   account and reflected in `CYBERSOURCE_ALLOWED_PAYMENT_TYPES` /
   `CYBERSOURCE_ALLOWED_CARD_NETWORKS` (default only `CARD`, `VISA,MASTERCARD`).
5. **Unified Checkout merchant configuration** (Complete Mandate / auto-processing)
   must be enabled on the account — the code sends `completeMandate.type=AUTH`.
   If the account is not enabled for Complete Mandate, set
   `CYBERSOURCE_COMPLETE_MANDATE_ENABLED=false` and the flow degrades to
   manual/transient-token mode (the abstraction already supports it).
6. **Allowed origins**: the storefront HTTPS origin must be in `CLIENT_ORIGIN`
   (drives `targetOrigins`) and, where the bank requires, registered with
   Cybersource.
7. **Bank-specific settings** (settlement, MCC, 3-D Secure, currencies) are
   outside the codebase — confirm USD/local currency is enabled on the account.

## 13. Values that MUST be configured by us (summary)

`CYBERSOURCE_MERCHANT_ID`, `CYBERSOURCE_KEY_ID`, `CYBERSOURCE_SHARED_SECRET`,
production `CYBERSOURCE_ENVIRONMENT`, enabled payment methods/card networks,
complete-mandate capability, and the production `CLIENT_ORIGIN` /
`PUBLIC_BASE_URL` origins. Everything else ships configured with safe defaults
and placeholders.
- Rate limiting on the whole payment surface + stricter action limiter on mutations.
- Safe logging (no secrets, no card data, no raw provider payloads).
- Env validation with fail-fast; `.env` gitignored repo-wide.
- No card data is ever stored; the stack never touches PAN/CVV (Cybersource handles entry).
## 7. API routes added (current surface)

- `POST /api/v1/customer/payments/:orderId/initiate` — customer-authenticated; body `{ gateway: "CYBERSOURCE" }` only; returns the server-created capture context.
- `POST /api/v1/customer/payments/:orderId/verify` — customer-authenticated; body `{ gateway, providerTransactionId, responseToken }`; server-authoritative settlement.
- `GET  /api/v1/customer/payments/:orderId/status` — customer-authenticated; authoritative polling.
- Admin: `POST /api/v1/payments/initiate`, `POST /api/v1/payments/verify`, `GET /api/v1/payments/status/:id`, `PATCH /api/v1/payments/:id/payment`.

**Webhook (Phase 12): not required.** The implemented production flow is
**Complete Mandate (auto-processing)**: Cybersource authorizes inside Unified
Checkout using the server-set amount and returns a Cybersource-*signed*
response token synchronously. Verification is signature-based (RS256/JWKS), so
no asynchronous webhook is part of this architecture. No fake/insecure webhook
was added. (If a future merchant configuration switches to manual processing
with a transient token, a signed webhook + `POST …/cybersource/webhook` would
be the follow-up.)
| (already removed before this audit) | `providers/khalti.provider.ts`, `providers/esewa.provider.ts`, legacy callback routes, storefront `paymentReturn` feature + `/payment/*` routes. |

## 3. Files modified (during this completion pass)

| File | Change |
| --- | --- |
| `backend/src/modules/payments/payment.service.ts` | Replaced both `as any` casts with typed `OrderPatch` payloads; explicit `typeof` guard on `metadata.error`; `PaymentProvider`/`OrderPatch` type imports. Removes the only two ESLint `no-explicit-any` errors in the payments module. |
| `.gitignore` (repo root) | Added `.env`, `.env.*` (keep `!.env.example`) so admin-console env files can never be committed. |
| `backend/.env.example` | Removed the stale "MarkupPay (Khalti + eSewa)" comment block; documents Cybersource as the single active gateway and the historical-data note. |
| `storefront/src/features/checkout/CheckoutPage.tsx` | Corrected a stale doc comment that described the removed gateway-redirect flow; now documents the embedded Cybersource Unified Checkout flow. |
