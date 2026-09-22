# PRODUCTION SECURITY AUDIT CHECKLIST

Owner: repo operators / reviewers
Status legend:
- **✅ Verified in repo** — implemented and covered by tests / inspection in this
  repository.
- **⚠️ Requires deployment verification** — the control exists but activation
  must be confirmed in the live environment (proxy/CDN, gateway, secrets).

This checklist records what was actually checked. Nothing is marked verified
without evidence.

---

## Authentication & sessions
- ✅ Access token held in memory only; refresh token is an httpOnly cookie set by
  the backend (never read by JS).
- ✅ Refresh-token rotation + reuse detection + logout invalidation (backend tests).
- ✅ Per-role auth: admin auth and customer auth are separate concerns with
  separate secrets.
- ✅ Customer refresh cookie scoped to `/api/v1/auth/customer`.
- ⚠️ Session expiry / `SameSite=Strict` in production enforced at deployment
  (cookie flags are env-driven; `COOKIE_SECURE=true` is fail-fast in prod).

## Authorization & RBAC
- ✅ Role/permission enforcement server-side for admin routes (401/403 tests).
- ✅ Server enforces ownership/IDOR on all customer-scoped endpoints (never
  trusts a client-sent customer id).
- ✅ Per-module scoping + ownership checks on cart, wishlist, orders, reviews,
  notifications, coupons, addresses, support.

## IDOR
- ✅ Ownership is scoped by the authenticated session server-side; no
  client-supplied id cross-checks bypass.
- ✅ Regression tests assert a customer cannot read/modify another customer's
  resources.

## XSS
- ✅ React escapes output; structured-data generation escapes/serializes safely
  (unit tests).
- ✅ CSP restricts script/style sources; `object-src 'none'`.
- ✅ Reflected/query-based content is not rendered into HTML unescaped (existing
  storefront handling).

## CSRF
- ✅ State-changing requests carry the `Authorization` header (not cookies), so
  CSRF risk is minimal; cookies are httpOnly + `SameSite`.
- ✅ CORS allow-list prevents cross-origin credentialed writes from untrusted
  origins.
- ⚠️ Confirm `SameSite` (Lax/Strict) choice at the production cookie config.

## CORS
- ✅ Env-driven allow-list; exact HTTPS origins; `credentials: true`; no wildcard
  fallback; preflight handling covered by `scripts/check-prod-security.ts`.
- ⚠️ Confirm `CLIENT_ORIGIN` includes the real storefront + admin origins in prod.

## Cookies
- ✅ `HttpOnly`, `Secure` (prod-enforced), `SameSite`, bounded `Path`.
- ✅ Cookie expiry and logout clearing implemented + tested.
- ⚠️ Verify `Secure` + preferred `SameSite` on the deployed HTTPS origin.

## CSP / headers
- ✅ helmet sets CSP, HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`,
  `Referrer-Policy`, COOP/CORP.
- ✅ `x-powered-by` disabled.
- ⚠️ Gateway/CDN must emit the storefront-specific CSP + HSTS `preload` and
  `frame-ancestors 'none'` (storefront rendered origin), per architecture §21.

## Rate limiting
- ✅ Layered per-route limits: general API, auth, refresh, authAction, adminAction.
- ✅ `RateLimit-*` headers emitted; 429 handled by clients.
- ⚠️ For multi-instance deployments, use a shared/Redis-backed store (documented
  as deployment work).

## Secrets
- ✅ Never hardcoded; `.env`/`.env.example` are placeholders only; backend secrets
  backend-only; no `VITE_*` secrets.
- ✅ Production fail-fast rejects weak/duplicate JWT secrets and `COOKIE_SECURE=false`.
- ⚠️ Rotate secrets and inject via provider secret store or encrypted `.env.vault`
  at deployment; ensure keys are not in logs/builds.

## Logging
- ✅ Pino NDJSON; `Authorization` + cookies redacted; stack traces stripped from
  responses in production.
- ✅ Request correlation id (`X-Request-Id`) for traceability.
- ⚠️ Aggregate logs via the chosen provider and confirm secret redaction in the
  shipping pipeline.

## Payment security
- ✅ Server-side init + `status`/`verify`; client redirect never trusted.
- ✅ Amount checked and idempotent server-side; verified in tests.
- ✅ Gateway secrets server-only.
- ⚠️ Confirm live gateway credentials + return/callback URLs in production.

## Database security
- ✅ `maxPoolSize` set; connection errors are logged (structured, non-secret).
- ✅ Schema is additive (safe rollback).
- ⚠️ Network isolation, TLS, and least-privilege DB user configured by provider;
  backup/restore (§8 of PRODUCTION_OPERATIONS.md) exercised and verified.

## Media / upload security
- ✅ Uploads disallow dotfiles; immutable UUID keys; size + decompression-bomb
  guards; served with `nosniff` and immutable cache.
- ✅ Local mode serves from an app-owned directory; S3/CDN mode keeps private
  resources out of the public path.
- ⚠️ Confirm CDN/bucket ACLs do not expose private objects (deployment).

## Caching
- ✅ Private/authenticated routes are not cached (no `Cache-Control` cache on
  them; server-scoped data); public catalog/media are cache-safe.
- ✅ Media cached immutable; storefront catalog cacheable.
- ⚠️ Gateway CDN rules must cache only public routes and never customer/private
  responses.

## Deployment configuration
- ✅ Health/readiness endpoints present; graceful shutdown on SIGTERM/SIGINT.
- ✅ Provider-neutral build/rollback/backup documented (PRODUCTION_OPERATIONS.md).
- ⚠️ Actual proxy/CDN rules, TLS certs, blue-green/canary activation and secret
  injection remain deployment-specific work (documented, not fabricated).

---

## Sign-off
- [ ] Checklist reviewed against the inspected commit.
- [ ] Deployment-verification items completed in the target environment.
- [ ] Backend production-security script pass recorded: `npm run check:prod-security --prefix backend`.
