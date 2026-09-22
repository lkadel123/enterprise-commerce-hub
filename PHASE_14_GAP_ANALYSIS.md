# PHASE 14 — PRODUCTION DEPLOYMENT & OPERATIONS
## READ-ONLY GAP ANALYSIS

> Read-only analysis. No files modified, no dependencies installed, no infrastructure fabricated,
> no credentials or provider selected.

---

## 1. Executive Summary

Phases 3–13 are complete. Phases 12 (production hardening) and 13 (release preparation) verified:
253/253 backend tests, 148/148 storefront tests, 6/6 Playwright security E2E, 22/22 production
security checks, `release:check` PASS, both production builds present, git secret scan clean.

**Phase 14 finding:** the repository contains **zero deployment infrastructure** — no Dockerfile,
no orchestration, no reverse-proxy configuration, no DNS/TLS, no provider configuration, no CD
workflow, no staging, no scheduled backups. Everything between "run `npm start` on a machine" and
"publicly reachable HTTPS application" is provider/operator work.

The gap is **infrastructure and operations, not code**.

**Verdict: READY AFTER PROVIDER CONFIGURATION (provider not selected).**

**Phase-numbering conflict:** an earlier prompt used "Phase 14" for *Production Deployment &
Release* — a role fulfilled by Phase 13. This analysis follows the current roadmap: **Phase 14 =
Production Deployment & Operations**, the deployment work Phase 13 explicitly deferred
("PROVIDER-SPECIFIC DEPLOYMENT REMAINS").

## 2. Repository Deployment Architecture

### Storefront
| Aspect | Finding | Evidence |
|---|---|---|
| Framework/runtime | TanStack Start 1.168 + React 19 + Vite 8 | `storefront/package.json` |
| SSR mechanism | TanStack Start via **Nitro 3 (beta `3.0.260603-beta`)** | `storefront/vite.config.ts` |
| Build command | `npm run build` → verified SSR output at `storefront/.output` | release-check PASS |
| **Start command** | ⚠️ no `start` script defined; Nitro convention `node .output/server/index.mjs` — must be confirmed against the pinned beta | `storefront/package.json` |
| Required env (build-time, public only) | `VITE_API_URL`, `VITE_PUBLIC_ORIGIN` | `.env.example` files |
| Static/CDN-only deployment | ❌ not supported as configured (SSR-driven; private-route auth + JSON-LD depend on it) | `vite.config.ts` |
| Media URL behavior | resolved via API/storage adapter | Phase 12 |

### Backend
| Aspect | Finding | Evidence |
|---|---|---|
| Runtime | Node ≥ 20, Express 5 | `engines`, deps |
| Build / start | `npm run build` (tsc → `dist/`); **`npm start` = `node dist/server.js`** | `backend/package.json` |
| Health / readiness | `/api/v1/health/live`; `/health/ready` → 503 when DB down | `backend/src/app.ts` |
| Graceful shutdown | SIGTERM/SIGINT → close + `disconnectDB` + force-exit timer | `backend/src/server.ts:15-37` |
| Port | `PORT` (default 4000), bind `HOST` | `env.ts` |
| Storage behavior | `local` (dev default) or `s3` via `STORAGE_PROVIDER` | `storage/mediaStorage.ts` |
| Proxy awareness | ⚠️ **no `trust proxy` configured** — needed behind a reverse proxy for correct client IPs and rate-limit keying | `app.ts` |

### Database
- MongoDB via Mongoose 8; pool `maxPoolSize: 20`; `serverSelectionTimeoutMS: 10s`
  (`backend/src/database/connection.ts`). Fail-fast startup (throws on connect failure);
  auto-reconnect events logged; readiness endpoint reflects connection state.
- **No migrations** (schema-less; collections/indexes created on demand) — safe against a fresh
  production database; seed optional for content.
- Seed (`npm run seed`): ⚠️ **no production guard found in `seed.ts`** — operator must never run it against production.
- Backup/restore tooling verified: `npm run backup` / `backup:dry-run`
  (`backend/scripts/backup-restore.ts`) — mongodump/mongorestore wrappers with dry-run,
  credential redaction in all output, and a production-restore guard evaluated before any
  filesystem access.

### Payments
- Khalti + eSewa: server-authoritative amounts from order data, server-side verification,
  idempotent duplicate-verification handling, failed payment never marks an order paid,
  credentials server-only via Zod-validated env.
- Callbacks: `KHALTI_RETURN_URL`, `ESEWA_SUCCESS_URL`, `ESEWA_FAILURE_URL` — must be production HTTPS URLs.
- COD: no external dependency — launch-ready.
- **PRODUCTION CREDENTIALS REQUIRED (BLOCKED).** No real payment transaction tested; sandbox behaviour verified only.

## 3. Provider Detection

**PROVIDER NOT SELECTED.**

Verified absent: Dockerfile, docker-compose, Kubernetes/Helm, Terraform/Pulumi, AWS/Azure/GCP
configuration, vercel.json, render.yaml, railway.json, fly.toml, nginx/Caddy configuration,
systemd/PM2 units, GitHub deployment environments or deploy jobs, any deployment manifest.
Deployment-adjacent artifacts are documentation only (`docs/PRODUCTION_OPERATIONS.md`,
`docs/PRODUCTION_RELEASE_RUNBOOK.md`, `docs/PRODUCTION_ENVIRONMENT.md`) plus validation tooling
(`scripts/release-check.mjs`, `backend/scripts/check-prod-security.ts`, `backend/scripts/backup-restore.ts`).

Information required before implementation: provider choice, compute/runtime service, MongoDB
service, object storage, CDN, DNS/TLS, secret-injection mechanism, log drain, monitoring platform.

## 4. Production Environment Audit

Source: all three `.env.example` files + Zod schema in `backend/src/config/env.ts`.

| Variable | Class | Prod required | Validated | Browser-safe |
|---|---|---|---|---|
| `NODE_ENV` | deployment-only | ✅ `production` | ✅ fail-fast | ❌ |
| `PORT`, `HOST` | deployment-only | optional (default 4000) | ✅ | ❌ |
| `MONGO_URI` | **database secret** | ✅ | ✅ | ❌ |
| Admin/customer `JWT_*` secrets | **auth secret** | ✅ | ✅ | ❌ |
| `COOKIE_NAME`, `CUSTOMER_COOKIE_NAME`, `COOKIE_DOMAIN` | cookie config | optional | ✅ | ❌ |
| `COOKIE_SECURE` | cookie security | ✅ must be `true` (fail-fast) | ✅ | ❌ |
| `CLIENT_ORIGIN` | CORS | ✅ storefront HTTPS origin | ✅ | ❌ |
| `KHALTI_SECRET_KEY`, `ESEWA_SECRET_KEY` | **payment secret** | ✅ | ✅ | ❌ |
| `KHALTI_PUBLIC_KEY`, `ESEWA_MERCHANT_CODE` | payment config | ✅ | ✅ | ❌ |
| `KHALTI_BASE_URL/RETURN_URL`, `ESEWA_BASE_URL/SUCCESS_URL/FAILURE_URL` | payment config | ✅ HTTPS | ✅ | ❌ |
| `STORAGE_PROVIDER` | storage config | ✅ `s3` | ✅ | ❌ |
| `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE` | **storage secret** | ✅ when s3 | ✅ | ❌ |
| `SENTRY_DSN/ENVIRONMENT/TRACES_SAMPLE_RATE` | monitoring (optional) | optional | ✅ env-gated | DSN kept server-side |
| `MONGO_DEBUG` | development/test-only | ❌ must be false | ✅ | ❌ |
| `VITE_API_URL` | public frontend | ✅ | build-time | ✅ |
| `VITE_PUBLIC_ORIGIN` | public frontend | ✅ | build-time | ✅ |

Verified: **no secret exposed via any `VITE_*` variable**; payment/DB/JWT/storage values
server-only; production fail-fast rejects missing/weak secrets and `COOKIE_SECURE=false`.
No secret values are printed in this report.


## 5. Network Architecture (provider-neutral)

```
Internet
  ↓ DNS                                   [REQUIRES PRODUCTION DOMAIN]
  ↓ TLS termination + reverse proxy/CDN    [PROVIDER]
  │    (HSTS, HTTP→HTTPS redirect, security headers)
  ├─→ Storefront SSR        node .output/server/index.mjs   (origin private)
  │     └─→ Backend API     node dist/server.js  :PORT      (origin private)
  │           └─→ MongoDB   replica set, TLS + auth         (private)
  ├─→ Object storage / CDN  S3-compatible, immutable media  [PROVIDER]
  └─→ Backend API ⇄ Khalti / eSewa   (server-side outbound; callbacks inbound via API domain)
```

- **Public endpoints:** storefront domain; API domain (`/api/v1/*` incl. `/health/*`, payment callbacks).
- **Private services:** storefront SSR origin, backend origin, MongoDB, storage keys.
- **Ports:** backend `PORT` (default 4000); nitro server port (operator-assigned).
- **CORS:** allow-list = storefront origin only; unauthorized origins get neither
  `Access-Control-Allow-Origin` nor credentials (E2E-verified).
- **Callback endpoints:** Khalti return + eSewa success/failure — API domain, HTTPS.
- **Health endpoints:** `/api/v1/health/live`, `/health/ready` — must bypass proxy rate limits/caching.
- **WebSocket:** not required. **Body limits:** proxy must exceed backend multer limits.
- **Trusted headers:** `X-Forwarded-For/Proto/Host` — paired with the `trust proxy` gap (§6).

## 6. Security Deployment Audit

- **TLS:** edge HTTPS/cert/redirect/HSTS — PROVIDER-DEPENDENT. `COOKIE_SECURE=true` fail-fast — IMPLEMENTED.
- **Headers:** API helmet set (CSP, HSTS, XCTO, frame, Referrer-Policy, Permissions-Policy) —
  IMPLEMENTED (22/22). COOP/CORP: MISSING (P2). Storefront headers — PROVIDER-DEPENDENT.
- **CORS:** exact-origin allow-list, credentials only for allowed origins — IMPLEMENTED + tested.
  Production origin value: REQUIRES PRODUCTION DOMAIN.
- **Cookies:** httpOnly, secure, SameSite=strict, path `/api/v1/auth` — IMPLEMENTED + tested.
- **Caching:** private routes (`/account/*`, `/cart`, `/checkout`, `/order-confirmation/*`,
  `/wishlist`) excluded from public caching — IMPLEMENTED (tested). Edge rules — PROVIDER-DEPENDENT.
- **Secrets:** repo scan clean; no secrets in frontend bundle; log redaction tested — IMPLEMENTED.
  Secret injection — PROVIDER-DEPENDENT.

**Gaps:** edge TLS/HSTS/COOP-CORP (provider); `trust proxy` (code, P1); storefront `start` script (code, P1).


## 7. Database Readiness

| Item | Status |
|---|---|
| Connection pooling (`maxPoolSize: 20`) | IMPLEMENTED |
| Startup failure (throw, no start) | IMPLEMENTED |
| Retry/reconnect | IMPLEMENTED (driver + event logging) |
| Graceful shutdown | IMPLEMENTED |
| Indexes via Mongoose schemas | IMPLEMENTED |
| Migrations | NOT APPLICABLE (schema-less) |
| Seed production safety | ⚠️ PARTIAL — no NODE_ENV guard in `seed.ts` |
| Backup/restore/dry-run/prod guard/redaction | IMPLEMENTED |
| Backup scheduling, retention, off-box, encryption | DOCUMENTED ONLY |
| PITR | MISSING — decision required |
| Restore verification | DOCUMENTED (runbook) |
| Fresh-DB deploy safety | ✅ safe |

## 8. Backup & Disaster Recovery

- Backup: `npm run backup` (mongodump wrapper; `--dry-run`; credential redaction; production restore guard) — IMPLEMENTED.
- Restore: same script with confirmation + production guard; verification procedure in runbook — IMPLEMENTED/DOCUMENTED.
- Scheduling, off-site storage, retention, dump encryption: MISSING — provider/ops.
- Restore testing: procedure documented; rehearsal not yet performed — OPERATOR.
- **RPO: NOT DEFINED — BUSINESS/OPERATIONS DECISION REQUIRED.**
- **RTO: NOT DEFINED — BUSINESS/OPERATIONS DECISION REQUIRED.**
- Rollback DB compatibility: no migrations ⇒ low risk; runbook documents the compatibility check.

## 9. Monitoring & Observability

| Item | Status |
|---|---|
| Structured pino JSON logs | IMPLEMENTED |
| `X-Request-Id` correlation | IMPLEMENTED |
| Log redaction (tested) | IMPLEMENTED |
| `/health/live`, `/health/ready` | IMPLEMENTED |
| DB connectivity visibility | IMPLEMENTED (readiness + connection events) |
| Sentry integration | IMPLEMENTED (env-gated, no PII/headers; dev needs no DSN) |
| Sentry activation (DSN, release tagging) | REQUIRES PROVIDER (env injection) |
| Log aggregation | DOCUMENTED (stdout JSON, provider-agnostic drain) |
| Uptime monitoring, alerting, dashboards | MISSING — REQUIRES PROVIDER |
| Error-rate / DB / payment monitoring | DOCUMENTED requirements; dashboards MISSING |

Minimum alerts — CRITICAL: backend down, readiness failing (DB), elevated 5xx, payment
verification failures, auth-failure spike, storage/disk failure. WARNING: latency, memory/CPU,
failed jobs, backup failures.

## 10. CDN / Media

- `local` adapter (dev) and S3-compatible adapter (`STORAGE_PROVIDER=s3`, `@aws-sdk/client-s3`,
  custom endpoint + path-style supported) — IMPLEMENTED.
- Immutable media caching preserved; private media never publicly cached — IMPLEMENTED.
- Image optimization (`sharp`) — present per Phase 9/12 baseline.
- **CDN is architecturally supported but NOT ACTIVE** — no provider evidence, no CDN configured.
  Activation requires: bucket + keys, `S3_*` injection, `STORAGE_PROVIDER=s3`, CDN distribution
  with immutable cache rules, cache-invalidation procedure, bucket backup/retention.
- Local disk media is dev-only and NOT production-appropriate (ephemeral filesystems).

## 11. Payment Production Readiness

**CODE READY:** amount from server-side order data; server-authoritative verification; idempotent
duplicate verification; failed payment does not create a paid order; frontend never trusts
redirect success; unauthorized access protection on payment routes; structured logging;
sandbox/production separation via env (`*_BASE_URL` + keys).

**PRODUCTION CREDENTIALS REQUIRED (BLOCKED):** Khalti production secret/public keys + `BASE_URL`
switch + HTTPS `RETURN_URL`; eSewa production merchant code + secret + `BASE_URL` + HTTPS
`SUCCESS_URL`/`FAILURE_URL`; live end-to-end rehearsal with production credentials. No real
transaction has been executed in this repository.

## 12. CI/CD

Pipeline (`.github/workflows/ci.yml`) — **CI (IMPLEMENTED):** install, lint, typecheck
(backend + storefront), backend tests, storefront tests, contract tests, accessibility tests,
Playwright E2E, production builds, security checks (22/22), release-check, bundle summary.
**CD (MISSING — correctly absent):** no staging deploy, no production deploy, no migrations
step, no health-gate deployment hook, no automated production smoke tests, no rollback trigger.
These are provider-specific. CI and CD are correctly distinguished — CI does not deploy.

## 13. Domain / DNS / TLS

| Record | Purpose | Status |
|---|---|---|
| Storefront domain | public website | **REQUIRES PRODUCTION DOMAIN** |
| API domain | backend + payment callbacks | **REQUIRES PRODUCTION DOMAIN** |
| Media domain (optional) | CDN/object storage | **REQUIRES PRODUCTION DOMAIN** |
| TLS certificates | HTTPS on all public domains | PROVIDER-DEPENDENT |

No domain name is invented anywhere in this analysis.

## 14. Release Strategy

- **Manual deployment:** only strategy with implementation evidence (build artifacts + documented start commands).
- **Rolling / blue-green / canary:** DOCUMENTED ONLY (runbook, Phase 13) — no implementation evidence.
- **Immutable release:** achievable (self-contained build outputs) but no registry/tagging — PARTIAL.

## 15. Production Smoke Tests

Provider-neutral checklist:

| # | Test | Expected | Auto? | Priority |
|---|---|---|---|---|
| 1 | Homepage | 200, SSR HTML, JSON-LD | ✅ | P0 |
| 2 | Catalog / categories / brands | 200, products render | ✅ | P0 |
| 3 | Product detail | 200, structured data, canonical | ✅ | P0 |
| 4 | Search | results render | ✅ | P0 |
| 5 | Register | account created | ✅ | P0 |
| 6 | Login / Logout | secure cookies set/cleared | ✅ | P0 |
| 7 | Session refresh | new access token from refresh cookie | ✅ | P0 |
| 8 | Cart / Wishlist / Address | persists, ownership-scoped | ✅ | P0–P1 |
| 9 | Checkout → COD | order confirmed | ✅ (test data) | P0 |
| 10 | Payment initiation/verification | sandbox only locally | ⚠️ prod keys BLOCKED | P0 |
| 11 | Failed payment | order NOT paid | ✅ (sandbox) | P0 |
| 12 | Order confirmation / history | auth-scoped | ✅ | P0–P1 |
| 13 | Notifications / Support / Reviews / Coupons | function correctly | ✅ | P1–P2 |
| 14 | sitemap.xml / robots.txt | 200 from storefront origin | ✅ | P1 |
| 15 | Security headers / CORS | present / deny foreign origin | ✅ | P0 |
| 16 | Private cache behavior | no public caching of private HTML | ✅ | P0 |
| 17 | health / readiness | 200 / 200 (503 w/o DB) | ✅ | P0 |
| 18 | Error monitoring | Sentry receives test event | ⚠️ needs DSN | P1 |

Payment verification **with production credentials** requires provider access — BLOCKED until keys exist.

## 16. Rollback

Documented (`docs/PRODUCTION_RELEASE_RUNBOOK.md`): stop rollout → redeploy previous artifact →
DB compatibility check (no migrations ⇒ low risk) → cache invalidation (CDN + media) → health
gate → smoke test → payment safety verification. Sessions survive rollback if JWT secrets are
unchanged — **do not rotate secrets during rollback**. No destructive database rollback is
recommended. Execution (artifact registry, traffic switch, CDN purge) is PROVIDER-DEPENDENT.

## 17. Go-Live Gates

## 18. Gap Matrix

| Area | Status | Evidence | Gap | Priority | Owner/Dependency |
|---|---|---|---|---|---|
| Application code | COMPLETE | 401+ tests green, builds pass | none | — | — |
| Security (code) | COMPLETE | 22/22 + E2E 6/6 | edge TLS/HSTS/WAF | P0 | Provider |
| Testing | COMPLETE | CI green | production smoke run | P0 | Operator |
| CI | COMPLETE | ci.yml full gate | CD deploy job | P1 | Provider |
| Deployment automation | MISSING | no files | provider pipeline | P1 | Provider |
| Infrastructure | MISSING | §3 | hosting/proxy/LB | P0 | Provider |
| Environment/secrets | COMPLETE (contract) | §4 audit | injection at provider | P0 | Provider |
| Database | PARTIAL | §7 | provisioning, backup schedule, seed guard | P0 | Operator + code |
| Payments | PARTIAL | §11 | production credentials | P0 | Operator |
| CDN/media | PARTIAL | §10 | bucket + CDN activation | P1 | Provider |
| Monitoring | PARTIAL | §9 | DSN, drain, alerts | P1 | Provider |
| Backups/DR | PARTIAL | §8 | scheduling, retention, PITR decision | P0 | Operator |
| DNS/TLS | MISSING | §13 | records, certs | P0 | Operator |
| Rollback | DOCUMENTED | runbook | provider execution | P1 | Provider |
| Staging | MISSING | — | full staging environment | P1 | Operator |
| Proxy trust | PARTIAL | `app.ts` | `trust proxy` config | P1 | Code + operator |
| Storefront start script | MISSING | package.json | add/confirm start cmd | P1 | Code |

## 19. Readiness Scores

| Area | Score | Basis |
|---|---|---|
| Application code | 100% | all features + 401+ tests green |
| Security | 95% | code-verified; edge TLS pending = infra |
| Testing | 100% | unit/integration/contract/a11y/E2E green |
| CI/CD | 85% | full CI gate; CD absent by design (no provider) |
| Backend deployment | 80% | build/start/health/shutdown verified; trust proxy P1 |
| Storefront deployment | 75% | build verified; start script P1 (nitro beta) |
| Database | 70% | code + backup tooling; provisioning/schedule/PITR pending |
| Payments | 60% | code ready; credentials BLOCKED |
| CDN/media | 50% | adapter ready; activation pending |
| Monitoring | 55% | logs/health/Sentry-code; DSN/drain/alerts pending |

## 20. Critical Blockers

- **Code:** none preventing launch. P1 deployment-correctness: `trust proxy`; storefront `start` script; (P2) seed NODE_ENV guard.
- **Infrastructure:** hosting, MongoDB service, object storage/CDN, reverse proxy/TLS, DNS, backup scheduler, staging, monitoring/alerting — none exist.
- **Credentials:** Khalti/eSewa production keys, S3 keys, Sentry DSN.

## 21. Recommended Phase 14 Implementation Plan

- **14A** Provider selection + architecture decision record *(business decision)*
- **14B** Production infrastructure provisioning (compute, MongoDB, storage)
- **14C** Secret/environment configuration (full §4 matrix injection)
- **14D** Database production setup (TLS, backup schedule, restore rehearsal, RPO/RTO)
- **14E** Backend deployment (+ `trust proxy`, health gate)
- **14F** Storefront deployment (+ start command, SSR verification)
- **14G** DNS/TLS/CDN configuration + security headers
- **14H** Payment production configuration + live rehearsal
- **14I** Monitoring: Sentry activation, log drain, alert rules
- **14J** Backups/DR: scheduling, retention, off-box, PITR decision
- **14K** Staging deployment (sandbox payments, separate DB/credentials)
- **14L** Production deployment via CI-gated pipeline
- **14M** Smoke tests (§15 matrix) against production
- **14N** Go-live (gates §17)
- **14O** Post-release monitoring + review

## 22. Final Verdict

**READY AFTER PROVIDER CONFIGURATION.** The repository is release-ready (Phases 12–13 verified);
no amount of further repository work can deploy it. Phase 14 is ready for implementation as
provisioning/configuration once the operator supplies provider, domain, and credentials.

---

**PHASE 14 STATUS:** READ-ONLY GAP ANALYSIS COMPLETE
**READINESS:** ≈ 60% overall (code/testing/security ~100%; infrastructure/deployment ~0–15%)
**PROVIDER:** NOT SELECTED
**PRODUCTION DEPLOYMENT:** NOT PERFORMED (read-only analysis)
**BLOCKERS:** infrastructure (hosting, DB service, storage/CDN, TLS/DNS, backup scheduler, staging, monitoring) + credentials (payment production keys, S3 keys, Sentry DSN); code P1: `trust proxy`, storefront start script
**FILES MODIFIED:** 0 (this report only)
**DEPENDENCIES INSTALLED:** 0
