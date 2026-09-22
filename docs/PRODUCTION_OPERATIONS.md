# PRODUCTION OPERATIONS — Enterprise Commerce Hub

Operational runbook for the Enterprise Commerce Hub (backend API + storefront +
admin). Provider-neutral: it describes the **steps and safety requirements**
needed to operate the application. Concrete execution (cloud providers, LB/CDN
provisioning, secret injection) is called out explicitly as **deployment work**
and must be completed by whoever operates the target environment.

---

## 1. Overview of deployed components

| Component          | Runtime                                    | Data / state                              |
| ------------------ | ------------------------------------------ | ----------------------------------------- |
| Backend API        | Node ≥22, Express (this repo, `backend/`)  | MongoDB (via `MONGO_URI`)                 |
| Storefront (SSR)   | Node ≥22, Nitro (this repo, `storefront/`) | Stateless                                 |
| Admin console      | Node ≥22, Vite/Nitro (repo root)           | Stateless                                 |
| Media              | Local disk (`uploads/`) or S3-compatible   | Immutable objects + MongoDB media records |
| Payments           | CyberSource (card, Unified Checkout) + Fonepay (Dynamic QR) | Pull-based server-side verification — **no inbound webhook** |

Secrets are supplied via environment variables / an injected secrets store
(see §12). **Never** hardcode credentials or commit `.env` files.

---

## 2. Build

Commands (from the repository root):

```bash
# Backend (compile-time only; nearest compile of dist)
npm ci --prefix backend
npm run typecheck --prefix backend
npm run build --prefix backend

# Storefront (Vite + Nitro SSR)
npm ci --prefix storefront
npm run typecheck --prefix storefront
npm run build --prefix storefront

# Admin console (repo root)
npm ci
npm run lint
npm run build

# Tests (run before any deploy)
npm test --prefix backend
npm test --prefix storefront
```

All builds produce versioned, immutable artifacts. Uploads disallow dotfiles
and are gitignored.

---

## 3. Migration

- The schema is **additive** (Mongoose; new collections/fields only post-launch).
- Run data seeds before enabling new API versions so no request lands on an
  unseeded schema: `npm run seed --prefix backend`.
- Because changes are additive, rollback never requires destructive DB reversals
  (see §4).

---

## 4. Deployment & rollback

### 4.1 Deployment steps
1. Build artifacts (§2) from the exact commit/tag being deployed.
2. Health gate: deploy the backend first, then wait for
   `GET /health/ready` → `200` (returns `503` while the DB is unreachable).
3. Run the migration/seed step if any (§3).
4. Deploy storefront + admin behind the CDN/proxy.
5. Run smoke tests (§5).

### 4.2 Application rollback
- Roll **one component at a time** (backend → storefront/admin) in reverse
  order, using the previous immutable artifact.
- Because DB changes are additive, a code rollback does **not** require a data
  rollback. If the new code wrote into a *new* collection/field, old code simply
  ignores it.
- **Do not** downgrade a database on a failed deploy without a restore (§9).

### 4.3 Environment / secrets rollback
- Re-apply the previous environment snapshot (secrets included) if a secret
  rotation broke startup.
- The backend refuses to boot with insecure config (`COOKIE_SECURE=false`,
  weak/duplicate JWT secrets) — a rollback must satisfy these production checks.

### 4.4 Asset / media compatibility
- Media URLs are immutable (`/media-files/…`, UUID keys, `immutable` cache).
- Keep the previous media path/CDN origin valid during rollback so previously
  issued URLs keep resolving.
- If switching `STORAGE_PROVIDER` local→S3 or changing CDN host, keep the old
  `MEDIA_PUBLIC_URL` reachable until all cached URLs expire, or migrate keys.

### 4.5 Cache invalidation
- Public catalog/HTML is served with `Cache-Control` from the gateway/CDN; after
  a rollback flush CDN + proxy caches for HTML/catalog/media.
- Media objects are immutable — never purge by "overwriting"; issue new keys.

### 4.6 Health verification after rollback
1. `GET /health/live` → `200`
2. `GET /health/ready` → `200` (DB connected)
3. Public + paid journeys smoke test (§5) pass.
4. Outbound gateway callbacks still arrive.

### 4.7 Payment-system safety
- Payment verification is **server-side only** (initiate with a server URL,
  confirm via server `status`/`verify`, never trust the client redirect).
  Rollback **must not** bypass or re-order this.
- On rollback, open payments continue against the existing gateway session; old
  + new versions read the same transactions. Do not cancel in-flight payments
  during the drain window.
- Monitor payment init/verify success/failure after rollback.
---

## 5. Smoke tests (post-deploy)

1. Storefront home renders (SSR) with a known product visible.
2. Public catalog: `GET /api/v1/public/products?...` returns 200.
3. Customer login → access token issued; refresh cookie `HttpOnly` + `Secure`.
4. Cart + wishlist add/merge work.
5. Checkout (card): initiating a CyberSource payment renders Unified Checkout
   with a server-issued capture context; the confirmation page polls server
   payment status, and the **server-side verify** (signed response token checked
   against the CyberSource JWKS, then `CAPTURE`) settles the order — there is no
   inbound webhook endpoint. A successful sale must end with payment status
   `Paid` and a CyberSource transaction reference persisted server-side.
6. Admin login + a read-only dashboard endpoint works.
7. Health: `/health`, `/health/live`, `/health/ready` all return `200`.

---

## 6. Blue-green / canary

**Provider-neutral architecture / prerequisites.** Actual traffic switching is
**deployment work** — only possible once a platform with routing + health gates
is chosen (an LB, k8s, a PaaS, or a CDN with origin weights).

### Prerequisites
- Versioned, immutable artifacts (required; already true).
- Health gate: the orchestrator must hit `/health/ready` and route traffic only
  when it returns `200`.
- Additive-DB only (already true) so old + new can coexist safely.
- Secret parity: both environments expose the same secrets to either version.

### Blue-green
- Deploy `green` fully; wait for `/health/ready` + a smoke test, then switch the
  router/test traffic from `blue` to `green`.
- On failure, switch back to `blue` (no DB reversal needed).

### Canary
- Route a small % of traffic to the new version behind a weighted router; watch
  error rates, payment failures, and `/health/ready`.

### Activation
- Mark actual execution as **deployment-specific work**; pick a platform and
  wire its routing + health gates before enabling blue-green/canary.

---

## 7. Running locally

```bash
# Backend
cd backend
cp .env.example .env          # set MONGO_URI to your local mongod
npm run dev                   # http://localhost:4000

# Storefront
cd storefront
cp .env.example .env
npm run dev                   # http://localhost:8090
```
---

## 8. Backup & restore

Repository-supported tooling in `backend/scripts/backup-restore.ts` wraps the
official `mongodump` / `mongorestore` binaries (no extra database driver). The
API connection string (`MONGO_URI`) is reused, so credentials stay out of code.

### Backup
```bash
# Print the exact command without running it:
cd backend && npm run backup:dry-run -- --command backup --uri "$MONGO_URI" --out ./backups

# Take a backup (also verifies mongodump is installed):
cd backend && npm run backup -- --command backup --uri "$MONGO_URI" --out ./backups
```

### Verify (read-only restore dry run)
```bash
cd backend && npm run backup -- --command verify --uri "$MONGO_URI" --from ./backups
```
`verify` runs `mongorestore --dryRun` — reads the dump, writes nothing.

### Restore
```bash
# Non-production requires --confirm-restore:
cd backend && npm run backup -- --command restore --uri "$MONGO_URI" --from ./backups --confirm-restore

# Production additionally requires ALLOW_PRODUCTION_RESTORE=1:
ALLOW_PRODUCTION_RESTORE=1 npm run backup -- \
  --command restore --uri "$MONGO_URI" --from ./backups --confirm-restore
```
- `--drop` drops the target DB's existing collections before importing (use only
  when overwriting is intended). Otherwise restore is additive.
- `--dry-run` prints the exact command for all commands (`backup:dry-run`).

### Environment requirements
- `MONGO_URI` (or `--uri`) — target/cluster connection string.
- `BACKUP_DIR` (optional) — default output/source directory.
- `NODE_ENV` — used only by the production-restore safety check.
- `mongodump`/`mongorestore` on the `PATH` at the same (or later) major version
  as the server.

### Safety warnings
- Restore **always** requires `--confirm-restore`; production additionally
  requires `ALLOW_PRODUCTION_RESTORE=1`.
- Never restore into a live production cluster without a verified, recent backup
  from that same cluster, and a documented, reversible restore plan.
- Additive schema means restoring an older dump into a newer app may miss new
  collections — restore into the **same** app version family first, or re-seed.

### Verification procedure
1. Take a backup.
2. Run `verify` (dry-run) — expect exit 0.
3. Optionally restore into a scratch database (`--confirm-restore`) and run the
   smoke tests (§5) against it.
---

## 9. Observability

- **Structured logs** — `pino` (NDJSON), HTTP via `pino-http`. Sensitive fields
  (`Authorization`, cookies) are redacted before output.
- **Correlation IDs** — every request gets an `X-Request-Id` (echoed on the
  response and propagated into pino logs as `req.id`). Log aggregation should
  index by this id to trace a request across services.
- **Health/readiness** — `/health/live` (liveness), `/health/ready` (503 when
  the DB is unreachable), `/health` (details incl. DB connectivity).
- **Error monitoring** — optional Sentry via `SENTRY_DSN` (server-only env).
  Without a DSN the integration is a no-op. Only the error + a path/method are
  forwarded — never Authorization headers, cookies, or customer PII.
- **Rate-limit / payment / auth visibility** — rate-limit headers present on
  responses; payment init/verify and auth events are structured-logged. Wire
  dashboards/alert rules (see §10).

### Enabling Sentry (operator)
1. Install the SDK: `npm i @sentry/node --prefix backend`.
2. Set `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`.
3. Re-run `npm run check:prod-security --prefix backend` and the smoke tests.
4. Upload source maps and tag the release for stack-trace fidelity
   (deployment-specific).

---

## 10. Log aggregation & alerting (requirements — deployment work)

- **Aggregation:** ship pino NDJSON to a provider (Elastic/Loki/Splunk or a
  managed log service). Index by `req.id`, `level`, `service`, and status codes.
- **Dashboards:** latency/error rates by endpoint, DB disconnects,
  rate-limit exhaustion (429), auth failures (brute-force monitoring), payment
  init/verify success/failure.
- **Alert rules:** payment verification anomalies, order-engine failures, DB
  disconnects, rate-limit exhaustion. Wire notifications through the chosen
  provider — environment-specific, must not ship provider code with credentials.

---

## 11. CDN / media / image optimization

- Media is served through the storage adapter (`local` or `s3`) with
  `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options:
  nosniff`, and dotfiles denied. Immutable UUID keys — never overwrite.
- In `s3` mode point `MEDIA_PUBLIC_URL` at the CDN origin so existing
  `Media.url` values keep resolving (§4.4).
- **Image optimization is implemented server-side** (WebP derivatives at
  configured widths + original/format-fallback variants, decompression-bomb and
  size guards). Storefront images use responsive `srcset`/lazy-loading.
- CDN cache purging on deploy/rollback: flush HTML + catalog; do **not** purge
  immutable media (new keys only).

---

## 12. Environment & secrets

- Backend secrets (JWT, S3, gateway keys, `SENTRY_DSN`) are **server-only** and
  must never appear in `VITE_*` (frontend) variables or commit logs.
- Frontend `VITE_*` variables contain **public** values only (API origin, public
  origin).
- In production `COOKIE_SECURE=true`; `CLIENT_ORIGIN` lists exact HTTPS console
  + storefront origins (never a wildcard with credentials).
- Manage secrets in your provider's secret store (env injection) or an
  encrypted `.env.vault` if adopted; the repository ships placeholders only.
- `.env.example` files classify required/optional and never contain real values.

---

## 13. Performance budgets (reference)

- Route-level code splitting + lazy `import()` for heavy features; query
  caching and prefetching; media via CDN with immutable headers; lazy images
  with `srcset`.
- Deployment gate: run the storefront build and review the bundle-summary
  (`scripts/bundle-summary.mjs`) before release. Set concrete byte budgets in
  CI once the current bundle is an accepted baseline (avoiding arbitrary
  limits today).
## Order Expiry Sweep (Phase 18)

Unpaid `Pending` orders carry a persisted `expiresAt` deadline (default 120 minutes,
configurable via `ORDER_EXPIRY_MINUTES`). Expired orders transition atomically to
`Expired` (order + payment) and their inventory reservations are released exactly once.

The backend runs an **in-process sweep timer** by default
(`ORDER_EXPIRY_SWEEP_ENABLED=true`, interval `ORDER_EXPIRY_SWEEP_INTERVAL_MS=60000`,
plus a catch-up sweep ~1s after startup). The database `expiresAt` timestamps remain
authoritative; the job only discovers overdue Pending orders and applies an atomic,
idempotent, guarded transition — so it is safe on multiple instances and no external
cron is **required**. On cPanel/Passenger (single app instance) the default is
sufficient; disable it with `ORDER_EXPIRY_SWEEP_ENABLED=false` only if you operate an
external scheduler.

Manual / external backstops (optional, e.g. after a long downtime or with the
in-process timer disabled):

- HTTP (requires an admin JWT with `orders:edit` permission):
  `POST /api/v1/orders/expire-pending`
- Programmatic: `orderService.expirePendingOrders()`

Schedule via cron / Kubernetes CronJob / cloud scheduler every 5-15 minutes. The sweep is
idempotent and safe to run concurrently with payment verification (guarded atomic updates).
