# PRODUCTION RELEASE RUNBOOK

Provider-neutral runbook for releasing the Enterprise Commerce Hub. Concrete
execution that requires a chosen host/LB/CDN/gateway is marked **[deployment
work]** and must be performed by the operator of that environment — it is never
simulated here. No real credentials are used anywhere in this repository.

Related docs: `docs/PRODUCTION_ENVIRONMENT.md` (env contract),
`docs/PRODUCTION_OPERATIONS.md` (operations), `SECURITY_AUDIT.md`.

---

## 0. Release gate (what must pass first)

All must be green before any release is approved:

1. install
2. lint (root/admin)
3. backend typecheck + test typecheck
4. storefront typecheck
5. backend tests
6. storefront unit/component/integration/contract tests
7. accessibility (axe/Playwright)
8. Playwright E2E
9. production-security validation (`npm run check:prod-security --prefix backend`)
10. production build (backend + storefront)
11. bundle analysis (`npm run release:bundle`)
12. release-readiness check (`npm run release:check`)

These are gated by the CI pipeline (`.github/workflows/ci.yml`) for every push/PR.

---

## 1. PRE-DEPLOYMENT

### 1.1 Backup
Take a verified backup of the current production database before every release:
```
cd backend
npm run backup -- --command backup --uri "$MONGO_URI" --out ./backups
npm run backup -- --command verify --uri "$MONGO_URI" --from ./backups
```
Keep the dump **off-box** (object storage / provider-managed snapshot); see the
retention note in docs/PRODUCTION_OPERATIONS.md §8. **[deployment work]** for
scheduling, but the backup/restore tooling is repository-side.

### 1.2 Test & build
- Run the full test + build gate (section 0).
- Record the exact commit/tag being released.

### 1.3 Environment validation
- Verify `docs/PRODUCTION_ENVIRONMENT.md` contract is met (server-only secrets,
  `COOKIE_SECURE=true`, non-wildcard `CLIENT_ORIGIN`, HTTPS origins).
- `NODE_ENV=production` must fail safe on missing secrets (the server refuses to
  start with insecure config).
- Confirm storefront `VITE_API_URL` / `VITE_PUBLIC_ORIGIN` point at the
  production origins.

---

## 2. DEPLOYMENT

### 2.1 Release artifact
Promote the versioned, immutable build artifact (backend `dist`, storefront
`.output`) produced by the verified commit. **[deployment]**: build/push to the
chosen host (image registry / static host / PaaS).

### 2.2 Migration
Schema is **additive** (new collections/fields only). Run any seed/migration
**before** enabling the new API version:
```
npm run seed --prefix backend
```
No destructive schema change is ever part of a release.

### 2.3 Deploy + health check
1. Deploy the backend first; wait for:
   - `GET /health/live` → `200`
   - `GET /health/ready` → `200` (503 until the DB is reachable)
2. Deploy storefront + admin behind the proxy/CDN.
3. Verify `/api/v1/public/sitemap.xml` and `/api/v1/public/robots.txt` reachable
   (and proxied onto the storefront origin if desired).

### 2.4 Post-deploy smoke
Run the smoke suite (section 4). Check logs (structured, `X-Request-Id`) and
monitoring for new errors immediately after cutover.
---

## 3. ROLLBACK

### 3.1 Stop rollout
On failed health checks / smoke failures: **do not** keep pushing — stop.

1. Roll **one component at a time**, in reverse order (storefront/admin → backend),
   back to the previous immutable artifact.

### 3.2 Database compatibility
- Migrations are **additive** (new collections/fields only), so old code can read
  the new schema safely; a code rollback does **not** require a data rollback.
- If the new code wrote to a *new* collection/field, the old code simply ignores
  it.
- **Never** downgrade the database on rollback. Restore only from a **verified**
  backup, and never without a documented, reversible restore plan.

### 3.3 Cache invalidation
- Flush the CDN/proxy cache for HTML + public catalog after rollback.
- Media objects are immutable — never purge by overwrite; new keys only.

### 3.4 Health & smoke after rollback
- `GET /health/live` → 200, `GET /health/ready` → 200.
- Public journeys (home/product/catalog) render.
- Customer login issues a token; refresh cookie `HttpOnly` + `Secure`.
- Cart/wishlist/checkout work; a sandbox payment init/verify succeeds.

### 3.5 Payment safety
- Verification is server-authoritative and independent of app version; both
  versions read the same gateway transactions. Do **not** cancel in-flight
  payments during the drain window.

---

## 4. POST-DEPLOYMENT

### 4.1 Smoke tests (automated + spot-check)
Cover: homepage, products, categories, brands, search, product detail; register,
login, logout, session restoration; cart, wishlist, checkout, COD; payment
init/verify, failed-payment handling, order confirmation; profile, addresses,
orders, notifications, support, reviews; security (unauthorized private route,
unsafe redirect, IDOR, private HTML free of customer data, CORS).

Run Phase 11 E2E + axe where possible (`npm run test:e2e --prefix storefront`,
`npm run test:a11y --prefix storefront`). Never run destructive tests against
production.

### 4.2 Logs / monitoring
- Confirm structured NDJSON logs with `X-Request-Id`.
- Confirm `/health/live` + `/health/ready`.
- Confirm error monitoring (Sentry) enabled via `SENTRY_DSN` receives 5xx without
  headers/cookies/PII.
- **Payment verification**: sample payment init/verify after cutover; confirm no
  failed payment creates a paid order and duplicate verification stays idempotent.

### 4.3 Customer-journey verification
- Registration → login → session restoration.
- Add to cart → wishlist → checkout → COD or payment → order confirmation.
- IDOR check: a customer cannot read or mutate another customer's data.

---

## 5. RELEASE LOG

Record for every release: commit/tag, artifacts, migration/seed applied,
health-check timestamps, smoke results, rollback status (if any), payment
verification sample, and any environmental blockers (provider/credentials).

**[Deployment work]:** provisioning host + TLS + LB/CDN + DNS + the storefront
CSP/HSTS/`frame-ancestors 'none'` headers at the gateway, secret injection,
off-box scheduled backups, and blue-green/canary routing. Until that is performed
in a real environment the release is prepared but not deployed.

**Correct repository status for this phase:**
`PHASE 13 CODE/RELEASE PREPARATION COMPLETE — PROVIDER-SPECIFIC DEPLOYMENT REMAINS`
