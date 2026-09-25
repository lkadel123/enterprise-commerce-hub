# Fonepay QR Integration — operator & audit reference

> **Status: live-money gateway, DISABLED by default and enabled explicitly.**
> The provider is registered only when `FONEPAY_ENABLED=true` **and** the full
> credential set is present. While disabled, checkout does not offer it and any
> Fonepay attempt fails fast with `503 not_configured`. Nothing about the
> gateway is decided in the browser: credentials, signing and every settlement
> decision live server-side.

This document records exactly how the integration is wired, which values must
come from Fonepay merchant onboarding, and which provider facts are *not*
documented in this repository (so nobody invents them).

## 1. Activation model

| Variable | Meaning |
|---|---|
| `FONEPAY_ENABLED` | `true`/`false`, default **false**. The explicit on/off switch. |
| `FONEPAY_ENVIRONMENT` | `uat` \| `production`. Required when enabled; must agree with `FONEPAY_BASE_URL`. |
| `FONEPAY_BASE_URL` | Absolute `https://` base URL; API paths are appended in code. |
| `FONEPAY_USERNAME` / `FONEPAY_PASSWORD` | Merchant API credentials (login endpoint, Basic auth). |
| `FONEPAY_PRIVATE_KEY` | PKCS8 RSA private key, Base64 **or** hex, **without** PEM headers. |
| `FONEPAY_TERMINAL_ID` | Merchant terminal id, 1–16 characters. |
| `FONEPAY_REQUEST_TIMEOUT_MS` | Per-request timeout, default `15000`. |

Boot-time guards (`backend/src/config/env.ts`, rules in
`fonepay.validation.ts`):

- `FONEPAY_ENABLED=true` **requires** all five credentials — enabling without
  them refuses to start instead of failing at the till.
- A **partial** credential set (any subset) is never intentional and refuses to
  start; the terminal id is validated (required, ≤ 16 chars) only once other
  credentials exist.
- `FONEPAY_BASE_URL` must be an absolute `https://` URL.
- `FONEPAY_ENVIRONMENT` must be explicit when enabled, and
  `production` must not point at a UAT/dev/sandbox host (per DNS label).
- `FONEPAY_PRIVATE_KEY` must actually parse as a PKCS8 RSA key.
- In `NODE_ENV=production`, `FONEPAY_ENVIRONMENT` must be exactly
  `production` — so live QR payments can never route at the UAT host.
- Template placeholders (`your-fonepay-*`, as shipped in `.env.example`) are
  normalized to *unset*: the gateway stays unregistered. If
  `FONEPAY_ENABLED=true` was set alongside placeholders, boot **refuses**
  rather than silently disabling a gateway the operator believes is live.

## 2. End-to-end flow

1. **Order placed** with the Fonepay choice (advisory
   `payment.metadata.gatewayChoice`). No provider call yet.
2. **Initiate** (`POST /api/v1/customer/payments/:orderId/initiate`):
   server logs in, generates an `INTENT_QR` for the **server-side order total**
   (major units, 1 .. 9,999,999) with a unique, order-bound `referenceLabel`,
   renders the QR payload to a PNG data URL with the installed `qrcode`
   package, stores the reference in `payment.providerTransactionId`
   (+ `payment.metadata.fonepay`) and opens a backend WebSocket listener.
3. **Customer scans** with any Fonepay-supported banking app and pays.
4. **Notification** arrives on the per-QR WebSocket — **display only**. It
   triggers a Status API verification and can never settle an order.
5. **Verification** (`POST /:orderId/verify`, or the status poll
   `GET /:orderId/status`) calls the documented Status API and applies the
   settlement rules in §4. Settlement is atomic
   (`markPaidIfPayable`, guarded `findOneAndUpdate`), so a concurrent
   cancel/expiry wins safely and no order is ever paid twice.
6. **Refunds are `UNSUPPORTED`** — the Fonepay API document defines no refund
   endpoint; refunds follow the documented status-only manual flow.

There is deliberately **no `FONEPAY_CALLBACK_URL`**: Fonepay's Intent/QR flow
uses the WebSocket notification (display only) plus the server-to-server Status
API, so a callback URL would be dead configuration.

## 3. Provider API surface used

Base URL: `FONEPAY_BASE_URL` (no trailing path). Paths are appended in
`backend/src/modules/payments/providers/fonepay/fonepay.client.ts`:

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/merchant/merchantDetailsForThirdParty/v2/login` | `Authorization: Basic base64(user:pass)` | Obtain the access token (cached in-process, never logged). |
| `POST /api/merchant/third-party/v2/generate-intent-qr` | Bearer token + `signature` | Create the `INTENT_QR` (`qrString`, `prn`, `terminalId`, `websocketId`, …). |
| `POST /api/merchant/third-party/v2/thirdPartyDynamicQrGetStatus` | Bearer token + `signature` | Authoritative payment status for a reference. |
| `POST /api/merchant/third-party/v2/banks/list` | Bearer token + `signature` | Bank list capability — implemented and unit-tested, **not** used by the checkout flow. |

Every body is validated against a documented Zod contract. A violation is a
typed `invalid_response` error carrying **redaction-safe diagnostics** (field
names, wire types, issue paths — never provider values, the QR payload, tokens
or signing material), so an operator can diagnose a live mismatch from the log
alone.

## 4. Request signing

- The request JSON body is serialized **exactly once**; that exact string is
  signed and sent unmodified (nothing is re-serialized or reordered).
- `SHA256withRSA` (OpenSSL `RSA-SHA256`) over the body bytes; the Base64
  signature travels in the `signature` header. Fonepay verifies it with the
  merchant's registered public key.
- The private key is PKCS8, supplied Base64- or hex-encoded **without PEM
  headers**; normalization follows the same branch order as Fonepay's Postman
  collection (hex first, then Base64) and is reproduced in
  `fonepay.signature.ts`. The key never leaves that module and is never logged.
- Login uses HTTP Basic (`base64(username:password)`); the returned token is
  cached in-process and never exposed to the browser.

## 5. Settlement rules (fail closed)

Status vocabulary (`fonepay.config.ts`; both documented families are covered):

- **Paid**: `success`, `successful`, `completed`, `complete`, `paid`,
  `captured`, `settled`
- **Pending**: `pending`, `initiated`, `processing`, `in progress`,
  `in-progress`, `in_progress`
- **Cancelled**: `cancelled`, `canceled`, `cancel`
- **Expired**: `expired`, `timeout`, `timed out`, `timedout`
- **Failed**: `failed`, `failure`, `declined`, `decline`, `rejected`, `error`
- **Anything else → `Pending`**, with a warning log: an unknown word can never
  settle an order, and can never be falsified into a terminal failure that
  invites a second charge. The order-expiry sweep still terminates the attempt.

Before an order can settle, all of the following must hold:

1. the provider status maps to `Paid`;
2. the verified amount equals the **server-side order total**
   (minor-unit comparison, ≤ 1 minor unit tolerance);
3. the reported currency equals the currency the payment was initiated in
   (Fonepay always declares `NPR`; the Status API itself carries no currency
   field);
4. the stored reference and terminal match the initiated attempt;
5. `requestedAmount` and `totalTransactionAmount`, when both reported, agree —
   otherwise the attempt is `Failed`;
6. the guarded atomic transition still finds the order payable (not
   cancelled/expired/paid).

`payment.transactionId` stores the gateway's own trace id when supplied (else
the `prn`); `payment.providerTransactionId` stores the per-attempt
`referenceLabel`. Reference labels are collision-safe, alphanumeric, ≤ 30
characters, bound to the order id and randomized with `crypto.randomBytes` (a
CSPRNG — the reference travels inside the QR payload).


## 6. Checkout availability contract

- `GET /api/v1/customer/payments/gateways` (authenticated) returns the payment
  catalog with a server-derived `available` flag
  (`backend/src/modules/customer-payments/customer-payment.types.ts`). COD is
  always available; an online gateway is available only while it is
  **registered** in the provider registry (`isProviderEnabled`), i.e. enabled
  *and* fully configured.
- The storefront renders **only** options reported `available: true`
  (`storefront/src/features/checkout/PaymentStep.tsx`). It never decides
  availability itself, and a selection the server stops reporting as available
  is cleared rather than carried into an order.
- Consequence: enabling Fonepay is a server-side change
  (`FONEPAY_ENABLED=true` + credentials, then restart). It appears at checkout
  with **no storefront deploy**, and a misconfigured gateway is never offered.

## 7. Failure taxonomy & troubleshooting

| `FonepayApiError.kind` | HTTP | Meaning |
|---|---|---|
| `not_configured` | 503 | Gateway disabled/unconfigured. Expected while `FONEPAY_ENABLED` is false. |
| `auth` | 401 | Login rejected — check username/password and that the merchant is active. |
| `validation` | 400 | Provider rejected the request (message forwarded). |
| `duplicate_reference` | 409 | Reference already used; each attempt must generate a new reference. |
| `terminal_not_found` | 409 | Terminal id not recognised by Fonepay — confirm it with onboarding. |
| `invalid_response` | 502 | Body violated the documented contract; the log carries safe diagnostics. |
| `timeout` / `network` | 502/504 | Transport failure; the status poll remains authoritative. |
| `provider` | varies | Provider-level failure; includes legacy/unknown HTTP statuses. |
| `not_paid` (provider) | — | Verification returned a non-`Paid` status; the payment is never settled from it. |

Operational notes:

- Unrecognized `paymentStatus` values log a warning
  (`Fonepay returned an unrecognized paymentStatus`) and leave the payment
  `Pending` — extend the mapping only with a documented value.
- The WebSocket listener is bounded (max 500 concurrent monitors, closed at the
  merchant-side wait window or terminal status) and never crashes the process on
  malformed provider input. Connection loss is non-fatal: status polling is the
  documented fallback.
- No credentials, tokens, QR payloads or provider message values are logged.

## 8. Required from Fonepay merchant onboarding (nothing here is invented)

Provide/confirm these before enabling the gateway:

1. **Production merchant API base URL** — the repository documents only the UAT
   host (`https://uat-new-merchant-api.fonepay.com`) and the Postman dev gateway
   (`https://dev-external-gateway-new.fonepay.com/merchantThirdparty`); the
   production host must come from Fonepay.
2. **Merchant API username & password** for
   `/api/merchant/merchantDetailsForThirdParty/v2/login`.
3. **PKCS8 RSA private key** (Base64 or hex, no PEM headers) matching the public
   key registered with Fonepay.
4. **Terminal id** (1–16 characters) for the merchant terminal that will receive
   the QR payments.
5. **Confirmation of the status vocabulary and amount semantics** your merchant
   profile returns from `thirdPartyDynamicQrGetStatus` (`success` vs
   `COMPLETED`, `requestedAmount`/`totalTransactionAmount` strings), and of the
   **QR validity window** — Fonepay documents no QR expiry, so this integration
   applies a merchant-side 30-minute wait window.
6. **Confirmation that settlement currency is NPR** — the Status API carries no
   currency field, so the provider declares `NPR` and the service binds it to
   the order currency.

## 9. Code & test map

| Concern | Location |
|---|---|
| HTTP client, signing, error taxonomy | `backend/src/modules/payments/providers/fonepay/fonepay.client.ts`, `fonepay.signature.ts` |
| Response contracts | `fonepay.types.ts` |
| Status/vocabulary, reference labels, amounts | `fonepay.config.ts` |
| Redaction-safe diagnostics | `fonepay.diagnostics.ts` |
| Boot validation rules | `fonepay.validation.ts` (+ `backend/src/config/env.ts`) |
| Provider (`initiate`/`verify`/`getStatus`) | `fonepay.provider.ts` |
| WebSocket notification listener | `fonepay.websocket.ts` |
| Settlement, availability endpoint | `backend/src/modules/customer-payments/` |
| Storefront checkout | `storefront/src/features/checkout/PaymentStep.tsx`, `storefront/src/lib/api/payments.ts` |

Test coverage: `backend/test/fonepay-{client,provider,diagnostics,configuration}.test.ts`
(74 tests), gateway-catalog tests in `backend/test/customer-payments.test.ts`,
storefront `PaymentStep.test.tsx`, plus the COD/card checkout Playwright
journeys (`storefront/e2e/journeys.spec.ts`).
