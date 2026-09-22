# PRODUCTION ENVIRONMENT CONTRACT

Classification of every environment variable the Enterprise Commerce Hub needs
in production. This is the authoritative reference for operators preparing the
storefront, admin console, and backend.

**Rules that always apply:**
- Backend secrets are **server-only** and must never appear in a `VITE_*`
  (frontend) variable.
- `VITE_*` variables hold **public** values only (API/public origin).
- Never commit real credentials; commit only the `.env.example` placeholders.
- Missing/invalid required production values cause the backend to **fail fast**
  at startup (Zod validation + the production safety net) — it refuses to boot
  with insecure configuration rather than degrade silently.

Legend: **[R]** required · **[O]** optional · **[P]** production-only override.

---

## 1. PUBLIC STOREFRONT VALUES (bundled to the client + SSR output)

| Variable | Class | Description |
|----------|-------|-------------|
| `VITE_API_URL` | R | Backend API base URL, e.g. `https://api.example.com/api/v1`. Must equal an origin in the backend `CLIENT_ORIGIN` allow-list. |
| `VITE_PUBLIC_ORIGIN` | R | Public storefront origin for canonical/OG URLs, e.g. `https://www.example.com`. HTTPS only (no mixed content). |

These are the **only** `VITE_*` variables in use. They carry no secrets.

## 2. SERVER-ONLY BACKEND VALUES

### Application
| Variable | Class | Notes |
|----------|-------|-------|
| `NODE_ENV` | P | Must be `production`. Enables prod behavior + fail-fast. |
| `HOST` | O | Bind address (default `0.0.0.0`). |
| `PORT` | O | API listen port (default 4000). |

### Database
| Variable | Class | Notes |
|----------|-------|-------|
| `MONGO_URI` | **R** | MongoDB connection string (Atlas/self-managed). TLS + auth expected in prod. Credentials live in the URI — keep server-only. |
| `MONGO_DEBUG` | O | Keep `false` in production. |

### JWT / sessions
| Variable | Class | Notes |
|----------|-------|-------|
| `JWT_ACCESS_SECRET` | **R**, P | Admin access token secret. ≥32 chars; unique; never the dev default. |
| `JWT_REFRESH_SECRET` | **R**, P | Admin refresh token secret. ≥32 chars; unique. |
| `ACCESS_TOKEN_TTL` | O | e.g. `15m`. |
| `REFRESH_TOKEN_TTL_DAYS` | O | e.g. `7`. |

### Customer (storefront) auth
| Variable | Class | Notes |
|----------|-------|-------|
| `CUSTOMER_JWT_ACCESS_SECRET` | **R**, P | Customer access token secret. ≥32 chars; unique. |
| `CUSTOMER_ACCESS_TOKEN_TTL` | O | e.g. `15m`. |
| `CUSTOMER_REFRESH_TOKEN_TTL_DAYS` | O | e.g. `7`. |

### Customer social sign-in (Google / Facebook) — optional, server-only
| Variable | Class | Notes |
|----------|-------|-------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | O, P | Google OAuth web-client credentials. Leave both empty to disable Google sign-in. Secrets are **server-only** — never expose via `VITE_*`. |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | O, P | Meta/Facebook app credentials. Leave both empty to disable Facebook sign-in. Secrets are **server-only**. |
| `GOOGLE_REDIRECT_URI` / `FACEBOOK_REDIRECT_URI` | O | Overrides. Default to `${BACKEND_PUBLIC_URL}/api/v1/auth/customer/{provider}/callback` and MUST match the provider console entries exactly. |
| `OAUTH_STATE_TTL_MINUTES` | O | OAuth CSRF-state lifetime (default `10`, max `15`). |
| `OAUTH_REQUEST_TIMEOUT_MS` | O | Outbound provider-request timeout (default `10000`). |
| `OAUTH_RATE_LIMIT_MAX` / `OAUTH_RATE_LIMIT_WINDOW_MS` | O | Per-IP budget for the social start/callback endpoints (default `30` per 15 min). |

Social sign-in **only ever creates/populates CUSTOMER accounts** — it can never
grant ADMIN/SUPER_ADMIN/staff roles (customer accounts carry no role field).

### Cookies
| Variable | Class | Notes |
|----------|-------|-------|
| `COOKIE_NAME` / `CUSTOMER_COOKIE_NAME` | O | Refresh cookie names. |
| `COOKIE_DOMAIN` | O | Set only when the cookie must scope across a shared parent domain. |
| `COOKIE_SECURE` | **R** | **Must be `true` in production.** The server refuses to start with `false`. |

### CORS
| Variable | Class | Notes |
|----------|-------|-------|
| `CLIENT_ORIGIN` | **R** | Comma-separated exact HTTPS origins (storefront + admin). **Never `*`** — credentials are only granted to listed origins. e.g. `https://www.example.com,https://admin.example.com`. |

### Monitoring (optional)
| Variable | Class | Notes |
|----------|-------|-------|
| `SENTRY_DSN` | O,P | Enables error monitoring. Server-only. No-op without it. |
| `SENTRY_ENVIRONMENT` | O | e.g. `production`. |
| `SENTRY_TRACES_SAMPLE_RATE` | O | 0–1, e.g. `0.1`. |

### Media storage
| Variable | Class | Notes |
|----------|-------|-------|
| `STORAGE_PROVIDER` | P | `local` (dev) or `s3` (production object storage/CDN). |
| `UPLOAD_DIR` | O | Local upload root when `local`. |
| `MEDIA_PUBLIC_URL` | O | Public media/CDN origin. In S3/CDN mode this is the CDN URL; existing `Media.url` values keep resolving because only the host changes. |
| `MEDIA_MAX_FILE_SIZE_BYTES` / `MEDIA_MAX_IMAGE_PIXELS` | O | Upload / decompression-bomb guards. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | O/P | Only when `STORAGE_PROVIDER=s3`. Credentials server-only. |

### Payments (production — CyberSource card checkout + Fonepay QR)
> PayBridge NP is **retired**: no `PAYBRIDGE_*` variable is read and **no
> webhook endpoint exists** (`POST /api/v1/payments/paybridge/webhook` is gone).
| Variable | Class | Notes |
|----------|-------|-------|
| `CYBERSOURCE_ENVIRONMENT` | **R**, P | `test` or `production`. **Must be explicitly `production` in production** — with CyberSource credentials present, boot refuses otherwise (a missing/`test` value would silently route live card payments to the sandbox host). |
| `CYBERSOURCE_MERCHANT_ID` / `CYBERSOURCE_KEY_ID` / `CYBERSOURCE_SHARED_SECRET` | **R**, P | CyberSource REST credentials (server-only). |
| `CYBERSOURCE_TARGET_ORIGINS` | O, P | Origins allowed to embed Unified Checkout. Must be `https://` in production (boot-enforced), e.g. `https://www.example.com`. |
| `CYBERSOURCE_CURRENCY` / `CYBERSOURCE_LOCALE` / `CYBERSOURCE_COUNTRY` / `CYBERSOURCE_ALLOWED_CARD_NETWORKS` / `CYBERSOURCE_ALLOWED_PAYMENT_TYPES` / `CYBERSOURCE_ORGANIZATION_ID` | O | Checkout tuning. |
| `FONEPAY_BASE_URL` / `FONEPAY_USERNAME` / `FONEPAY_PASSWORD` / `FONEPAY_PRIVATE_KEY` / `FONEPAY_TERMINAL_ID` | O/P | Fonepay Dynamic QR — **all-or-nothing**: partial configuration refuses boot. |
| `BACKEND_PUBLIC_URL` | O, P | Public HTTPS base URL of the API (outbound references). |
| `PUBLIC_BASE_URL` | **R**, P | Public HTTPS storefront base URL (SEO absolute URLs + password-reset email links). |

CyberSource settlement is **pull-based**: the signed Unified Checkout response
token is verified server-side against the CyberSource JWKS. There is no inbound
webhook to register or firewall.

### Transactional email / password reset (SMTP)
| Variable | Class | Notes |
|----------|-------|-------|
| `SMTP_ENABLED` | P | `true` to enable password-reset email delivery. When disabled, the reset endpoint returns **503** — it never pretends an email was sent. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | P | Provider SMTP endpoint (`SMTP_SECURE=true` for 465, `false` for 587 STARTTLS). |
| `SMTP_USER` / `SMTP_PASSWORD` | P | SMTP auth (server-only; never logged). |
| `SMTP_FROM` | **R** when enabled | e.g. `Store <no-reply@example.com>`. |
| `SMTP_REPLY_TO` / `SMTP_CONNECTION_TIMEOUT_MS` | O | Optional reply address / timeouts. |

Production guard: `SMTP_ENABLED=true` without `SMTP_HOST`/`SMTP_FROM` refuses
boot. Reset links are anchored to `PUBLIC_BASE_URL`; tokens are never logged
and never returned by the API.

### Reverse proxy / cPanel Passenger
| Variable | Class | Notes |
|----------|-------|-------|
| `TRUST_PROXY` | O, P | Express `trust proxy` value. Default `loopback` (correct for cPanel Passenger). Accepts a hop count (`1`) or subnet list. **`true`/`*` refuse production boot** — they would let clients spoof `X-Forwarded-For` and defeat IP rate limits. |

### Logging
| Variable | Class | Notes |
|----------|-------|-------|
| `LOG_LEVEL` | O | `info` for production; structured NDJSON via pino. |

### Backup / restore (CLI, server-only)
| Variable | Class | Notes |
|----------|-------|-------|
| `MONGO_URI` | R | Reused by `scripts/backup-restore.ts` (wraps `mongodump`/`mongorestore`). |
| `BACKUP_DIR` | O | Backup output/source directory. |
| `NODE_ENV` | P | Production restore additionally requires `ALLOW_PRODUCTION_RESTORE=1`. |

---

## 3. Fail-safe behavior

- **Fail fast:** the backend Zod-validates env at startup and `process.exit(1)`
  on missing/malformed required values.
- **Production safety net:** when `NODE_ENV=production`, the server **refuses to
  start** if `COOKIE_SECURE=false` or any JWT secret is the dev default / <32
  chars.
- **No secrets in bundles:** all backend secrets are server-only; `VITE_*` holds
  public values only.
- **No secrets in logs:** Authorization headers and cookies are redacted; the
  release scanner reports only file:line, never values.

See `docs/PRODUCTION_RELEASE_RUNBOOK.md` for the deploy/rollback runbook.
