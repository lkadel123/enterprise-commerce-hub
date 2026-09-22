# Enterprise Commerce Hub — Environment & Deployment

This document describes the environment variables required by the API
(`backend/`) and the storefront (`storefront/`), and how to build and run the
system. **No runtime behavior is defined here** — the authoritative source is
`backend/src/config/env.ts` (validated at startup with Zod; the process exits
on invalid configuration).

## Backend (`backend/`)

All variables are read from `backend/.env` (or the process environment).
Production startup is **refused** unless `COOKIE_SECURE=true` and all JWT
secrets are unique values of at least 32 characters (see the production guard
in `env.ts`).

### Core

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `4000` | API listen port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/enterprise-commerce-hub` | MongoDB connection string |
| `MONGO_DEBUG` | `false` | Verbose Mongoose logging |
| `LOG_LEVEL` | `info` | pino level |
| `CLIENT_ORIGIN` | `http://localhost:8080` | CORS allow-list entry |

### Auth / sessions

| Variable | Default |
| --- | --- |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev-only secrets (must be replaced in production) |
| `ACCESS_TOKEN_TTL` | `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | `7` |
| `COOKIE_NAME` | `refresh_token` |
| `COOKIE_DOMAIN` | unset |
| `COOKIE_SECURE` | `false` (**must be `true` in production**) |
| `CUSTOMER_JWT_ACCESS_SECRET` | dev-only secret |
| `CUSTOMER_ACCESS_TOKEN_TTL` | `15m` |
| `CUSTOMER_REFRESH_TOKEN_TTL_DAYS` | `7` |
| `CUSTOMER_COOKIE_NAME` | `customer_refresh_token` |

### Media storage

| Variable | Default |
| --- | --- |
| `STORAGE_PROVIDER` | `local` (`local` or `s3`) |
| `UPLOAD_DIR` | `uploads` |
| `MEDIA_PUBLIC_URL` | `http://localhost:4000/media-files` |
| `MEDIA_MAX_FILE_SIZE_BYTES` | `5242880` (5 MB) |
| `MEDIA_MAX_IMAGE_PIXELS` | `60000000` |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_FORCE_PATH_STYLE` | only required when `STORAGE_PROVIDER=s3` |

### Payments — CyberSource (card) and Fonepay (QR) — the only active gateways

> PayBridge NP has been **retired**: its provider fails closed and there is **no
> webhook endpoint** in this API. Any guide referencing `PAYBRIDGE_*` variables
> or a PayBridge webhook URL is obsolete.

| Variable | Notes |
| --- | --- |
| `CYBERSOURCE_ENVIRONMENT` | **`test` or `production` — MUST be set explicitly in production.** With credentials configured, production boot **refuses** to start if this is missing or `test` (it would silently route live card payments to the sandbox host). |
| `CYBERSOURCE_MERCHANT_ID` · `CYBERSOURCE_KEY_ID` · `CYBERSOURCE_SHARED_SECRET` | CyberSource sandbox/production REST credentials (all required together) |
| `CYBERSOURCE_TARGET_ORIGINS` | Origins allowed to embed Unified Checkout (must be `https://` in production — boot-enforced) |
| `CYBERSOURCE_CURRENCY` · `CYBERSOURCE_LOCALE` · `CYBERSOURCE_COUNTRY` · `CYBERSOURCE_ALLOWED_CARD_NETWORKS` · `CYBERSOURCE_ALLOWED_PAYMENT_TYPES` · `CYBERSOURCE_ORGANIZATION_ID` | optional checkout tuning |
| `FONEPAY_BASE_URL` · `FONEPAY_USERNAME` · `FONEPAY_PASSWORD` · `FONEPAY_PRIVATE_KEY` · `FONEPAY_TERMINAL_ID` | **All-or-nothing**: partial Fonepay configuration refuses boot |
| `BACKEND_PUBLIC_URL` | Public API origin (used for outbound references) |
| `PUBLIC_BASE_URL` | Public storefront origin — used for the password-reset email link and SEO URLs |

CyberSource verification is pull-based (signed response token verified against
the CyberSource JWKS); there is **no inbound webhook surface** to configure.

### Transactional email / password reset (SMTP)

Password reset requires email delivery. The endpoint **fails with 503** when
SMTP is not configured — it never pretends a link was sent.

| Variable | Default | Notes |
| --- | --- | --- |
| `SMTP_ENABLED` | `false` | Set `true` to enable password-reset email delivery |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_SECURE` | `""` · `587` · derived | Provider SMTP endpoint (`SMTP_SECURE=true` for 465, false for 587 STARTTLS) |
| `SMTP_USER` · `SMTP_PASSWORD` | `""` | Auth credentials (omit for unauthenticated relays) |
| `SMTP_FROM` | `""` | e.g. `Store <no-reply@example.com>` — required when enabled |
| `SMTP_REPLY_TO` | `""` | optional |
| `SMTP_CONNECTION_TIMEOUT_MS` | `10000` | Connect/greeting/socket timeout |

Production guard: `SMTP_ENABLED=true` without `SMTP_HOST`/`SMTP_FROM` refuses
boot. Reset links are built from `PUBLIC_BASE_URL`; tokens are never logged and
never returned by the API.

### Reverse proxy / cPanel Passenger

| Variable | Default | Notes |
| --- | --- | --- |
| `TRUST_PROXY` | `loopback` | What Express `trust proxy` accepts: `loopback` (cPanel/Passenger default), a hop count (`1`), or a subnet list. **Never `true`/`*`** — production boot refuses those (clients could spoof `X-Forwarded-For` and defeat IP rate limits). |

Rate limiting keys on the real client IP once the proxy is trusted.

### Order-expiry scheduler (Phase 18)

| Variable | Default | Notes |
| --- | --- | --- |
| `ORDER_EXPIRY_SWEEP_ENABLED` | `true` | Set `false` to disable the in-process sweep timer |
| `ORDER_EXPIRY_SWEEP_INTERVAL_MS` | `60000` | Sweep interval; a catch-up sweep also runs ~1s after startup |

The database `expiresAt` timestamps remain authoritative; the scheduler only
discovers overdue Pending orders and applies an atomic conditional transition,
so it is safe to run on multiple instances.

### Observability (optional)

| Variable | Default |
| --- | --- |
| `SENTRY_DSN` | unset (integration is a no-op when absent) |
| `SENTRY_ENVIRONMENT` | unset |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` |

## Storefront (`storefront/`)

| Variable | Example | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000/api/v1` | Browser + SSR API base URL |
| `VITE_PUBLIC_ORIGIN` | `http://localhost:8090` | Canonical origin used for SEO URLs |
| `PORT` | `8090` | Nitro SSR server listen port |

## Running

**Node.js 22 is required** (`"engines": { "node": ">=22" }` in all three
manifests — the Fonepay WebSocket monitor relies on native `globalThis.WebSocket`).

```bash
# Backend
cd backend && npm ci && npm run dev      # requires payments env vars above

# Storefront (SSR)
cd storefront && npm ci && npm run build && node .output/server/index.mjs

# Backend tests (in-memory MongoDB)
cd backend && npm test

# Storefront tests / typecheck / build
cd storefront && npm test && npm run typecheck && npm run build

# E2E (boots its own seeded backend + production SSR server)
cd storefront && npx playwright test
```

### cPanel deployment (Node 22 + Passenger)

**Tested toolchain (validated release):** Node **≥22**, Vite **8.2.x**, Nitro
**3.0.260603-beta** (pinned, not upgraded blindly — upgrade only with a
security driver), `@tanstack/react-start` **1.168.x**, Express **5.1.x**.

Three Node apps on one registrable domain (the production refresh cookies are
`SameSite=strict`, which works across subdomains of the **same** site but breaks
across different domains):

| App | Subdomain | Startup file (cPanel "Application startup file") | Build |
| --- | --- | --- | --- |
| API | `api.example.com` | `dist/server.js` | `cd backend && npm ci && npm run build` |
| Storefront (SSR) | `www.example.com` | `.output/server/index.mjs` | `cd storefront && npm ci && npm run build` (with production `VITE_*` set) |
| Admin (SSR) | `admin.example.com` | `.output/server/index.mjs` | `npm ci && npm run build` (root workspace) |

- Provision **remote MongoDB** (Atlas or managed, TLS) — cPanel provides none.
  Put the full URI in `MONGO_URI`.
- AutoSSL/Let's Encrypt on every hostname; `COOKIE_SECURE=true` and https://
  CyberSource target origins are boot-enforced.
- `TRUST_PROXY=loopback` (default) so rate limiting sees real client IPs behind
  Passenger/Apache.
- Uploads persist under the account home (`STORAGE_PROVIDER=local` +
  `UPLOAD_DIR`); set `MEDIA_PUBLIC_URL` to the API's public media path.
- Set `LOG_LEVEL=info` (or `warn`) — never `debug`/`trace` in production.
- After deploy, run `npm run check:prod-security` (see
  `docs/PRODUCTION_ENVIRONMENT.md`) and verify `GET /health/ready` returns 200.
