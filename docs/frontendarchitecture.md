# Frontend Architecture — Enterprise Commerce Hub Customer Website

> **Document type:** Implementation-ready architecture for the customer-facing storefront.
> **Status:** Architecture only — no frontend implementation performed (read-only audit).
> **Source of truth:** The actual backend source code in `backend/src`, the existing admin dashboard in `src/`, and repo configuration (`package.json`, `tsconfig.json`, `.env.example`).
> **Date:** 2026-08-20

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository & Conventions](#2-repository--conventions)
3. [Verified Backend Capability Matrix](#3-verified-backend-capability-matrix)
4. [Frontend Technology Architecture](#4-frontend-technology-architecture)
5. [Website Route Architecture](#5-website-route-architecture)
6. [Website Information Architecture](#6-website-information-architecture)
7. [Customer User Flows](#7-customer-user-flows)
8. [API Client Architecture](#8-api-client-architecture)
9. [Authentication Architecture](#9-authentication-architecture)
10. [State Management](#10-state-management)
11. [Product Architecture](#11-product-architecture)
12. [Cart Architecture](#12-cart-architecture)
13. [Checkout Architecture](#13-checkout-architecture)
14. [Customer Account Architecture](#14-customer-account-architecture)
15. [Component Architecture](#15-component-architecture)
16. [Folder Structure](#16-folder-structure)
17. [Data & Type Architecture](#17-data--type-architecture)
18. [SEO Architecture](#18-seo-architecture)
19. [Performance Architecture](#19-performance-architecture)
20. [Responsive Design Architecture](#20-responsive-design-architecture)
21. [Security Architecture](#21-security-architecture)
22. [Loading / Error / Empty States](#22-loading--error--empty-states)
23. [Accessibility](#23-accessibility)
24. [Testing Architecture](#24-testing-architecture)
25. [Backend Gaps / Frontend Blockers](#25-backend-gaps--frontend-blockers)
26. [Implementation Roadmap](#26-implementation-roadmap)
27. [Architecture Decisions](#27-architecture-decisions)
28. [Risks & Mitigations](#28-risks--mitigations)
29. [Final Readiness Assessment](#29-final-readiness-assessment)

---

## 1. Executive Summary

The **Enterprise Commerce Hub** now ships a complete **backend** (`Express 5 + Mongoose 8 + MongoDB`, `/api/v1`) and an **admin dashboard** (React 19 + TanStack Router/Query + Tailwind). It also ships a **complete customer self-service API layer** (customer auth, catalog, cart, wishlist, orders, reviews, notifications, coupons, payments, addresses, support). There is **no customer-facing storefront yet** — this document defines the architecture for building it against the verified API surface.

This document supersedes the earlier `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`, which is stale (it predates the customer API layer and incorrectly concluded that customer flows were unimplemented). Every capability described here was re-verified directly from `backend/src`.

> **Important architectural note:** The backend customer API is deliberately **thin and server-authoritative**. The backend computes all prices, stock availability, coupon eligibility, order totals and payment amounts. The frontend must **never duplicate pricing or business logic** — it renders what the backend returns and submits only opaque identifiers (`productId`, `quantity`, `couponCode`, `gateway`, `providerTransactionId`).

## 2. Repository & Conventions

### 2.1 Documentation convention

The repo keeps architecture documents in `docs/` (`docs/BACKEND-ARCHITECTURE.md`). The correct location for this document is therefore **`docs/frontendarchitecture.md`**.

### 2.2 Existing frontend (admin dashboard) conventions

Verified from `src/` and `package.json`:

| Layer           | Technology                                          | Version           |
| --------------- | --------------------------------------------------- | ----------------- |
| Language        | TypeScript (strict, `tsconfig.json`)                | TS 5.8            |
| Runtime / build | Vite + TanStack Start                               | Vite 8 / React 19 |
| Routing         | TanStack Router (file-based, `src/routes/*.tsx`)    | 1.170             |
| Server state    | TanStack Query                                      | 5.101             |
| Styling         | Tailwind CSS v4 + `tailwind-merge`                  | 4.2               |
| UI primitives   | Radix UI + shadcn-style kit (`src/components/ui/*`) |                   |
| Forms           | React Hook Form + resolvers + Zod                   | 7.71 / 5.2 / 3.24 |
| Toasts          | Sonner                                              | 2.0               |
| Icons           | Lucide                                              | 0.575             |
| Auth pattern    | `AuthContext.tsx` + `lib/api/client.ts`             |                   |

The customer storefront must **stay on this same stack** so the codebase and maintenance story stay coherent. Introducing Next.js is rejected in §4 and §27.

### 2.3 Repository structure & where the customer frontend lives (verified)

- **The repo is a single Git repository, NOT a Yarn `workspaces` monorepo** — root `package.json` has no `workspaces` key.
- The **admin dashboard is the root application** (`src/`, `package.json`, `vite.config.ts` at repo root; dev server on port 8080).
- **`backend/` is a nested, self-contained package** with its own `package.json`, `tsconfig.json`, `vitest.config.ts`, and `/src`.
- **No `storefront/`, `frontend/`, or `apps/` directory exists yet** (verified via `git ls-files`).

**Recommendation on placement (this task's key decision):** create the customer frontend as a **new separate application in a top-level `storefront/` directory**, mirroring how `backend/` is a self-contained nested package — **not** a route inside the admin root app and **not** a Yarn workspace.

- _Why a separate app:_ the customer surface has a distinct visual/design system, its own auth domain (customer access token + `customer_refresh_token` cookie vs admin), its own SEO model, and none of the admin RBAC/permission concerns. Mixing it into the root admin `src/routes` would entangle admin layout, auth, and permissions with public storefront code.
- _Why not a workspace:_ the repo has no workspace tooling today; adding one is an unnecessary refactor. A self-contained `storefront/` app with its own `package.json`/`vite.config.ts`/`tsconfig.json` (like `backend/`) integrates with the existing layout and CI without changing the root build.
- Either way, the storefront **must never import admin-only API modules** or admin auth; it depends only on `public/*` and `customer/*` endpoints (see §2.5).

### 2.4 Environment / API base URL (verified)

- `VITE_API_URL` (Vite env) → backend origin. `.env.example` sets `http://localhost:4000/api/v1`.
- The admin client reads `VITE_API_URL` at runtime and falls back to `http://localhost:4000/api/v1`. The customer client must do the same.
- Backend CORS allow-list is `CLIENT_ORIGIN` (default `http://localhost:8080`), `credentials: true` — the storefront must be served from an origin present in that allow-list.
- The customer session is separate from the admin session: refresh cookie `customer_refresh_token` (path `/api/v1/auth/customer`), secret `CUSTOMER_JWT_ACCESS_SECRET`, TTL `CUSTOMER_ACCESS_TOKEN_TTL`.

### 2.5 Admin/customer separation (verified)

- Admin auth (`authenticate` + RBAC `requirePermission`) guards admin routes `/api/v1/{products,categories,brands,orders,reviews,...}`.
- Customer routes are the separate prefixes: `/api/v1/auth/customer`, `/api/v1/account`, `/api/v1/public`, `/api/v1/cart`, `/api/v1/wishlist`, `/api/v1/customer/*`, `/api/v1/customer/support/conversations`.
- The storefront consumes **only** the above; it never calls admin-only endpoints and never sends an admin token.

## 3. Verified Backend Capability Matrix

Legend: `VERIFIED` (exists in source), `PARTIAL` (exists but with caveats), `NOT IMPLEMENTED` (no endpoint/behavior found), `UNKNOWN`.

### 3.1 Authentication & Account (from `customer-auth.routes.ts`, `customer-cookie.ts`, `customer-token.ts`)

| Feature            | Endpoint                                | Method | Auth                | Status                                                   |
| ------------------ | --------------------------------------- | ------ | ------------------- | -------------------------------------------------------- |
| Register           | `/api/v1/auth/customer/register`        | POST   | public              | VERIFIED                                                 |
| Login              | `/api/v1/auth/customer/login`           | POST   | public              | VERIFIED                                                 |
| Refresh            | `/api/v1/auth/customer/refresh`         | POST   | httpOnly cookie     | VERIFIED                                                 |
| Logout             | `/api/v1/auth/customer/logout`          | POST   | public cookie-clear | VERIFIED                                                 |
| Me / profile       | `/api/v1/auth/customer/me`              | GET    | Bearer              | VERIFIED                                                 |
| Update profile     | `/api/v1/auth/customer/profile`         | PATCH  | Bearer              | VERIFIED (name/phone)                                    |
| Change password    | `/api/v1/auth/customer/change-password` | POST   | Bearer              | VERIFIED                                                 |
| Forgot password    | `/api/v1/auth/customer/forgot-password` | POST   | public              | VERIFIED (returns `requestId`; **no email sent**)        |
| Reset password     | `/api/v1/auth/customer/reset-password`  | POST   | public              | VERIFIED (`requestId`+`token`)                           |
| Account alias      | `/api/v1/account/profile` GET/PATCH     | —      | Bearer              | VERIFIED                                                 |
| Email verification | —                                       | —      | —                   | NOT IMPLEMENTED (`emailVerifiedAt` exists on model only) |

### 3.2 Public catalog (from `public-catalog.routes.ts` + service/types/repository)

| Feature                                    | Endpoint                                    | Method | Auth   | Status   |
| ------------------------------------------ | ------------------------------------------- | ------ | ------ | -------- |
| Product list (search/filter/sort/paginate) | `/api/v1/public/products`                   | GET    | public | VERIFIED |
| Product detail by slug                     | `/api/v1/public/products/:slug`             | GET    | public | VERIFIED |
| Approved reviews for one product           | `/api/v1/public/reviews?productId=`         | GET    | public | VERIFIED |
| Category list                              | `/api/v1/public/categories`                 | GET    | public | VERIFIED |
| Category detail by slug                    | `/api/v1/public/categories/:slug`           | GET    | public | VERIFIED |
| Brand list                                 | `/api/v1/public/brands`                     | GET    | public | VERIFIED |
| Brand detail by slug                       | `/api/v1/public/brands/:slug`               | GET    | public | VERIFIED |
| Banners                                    | `/api/v1/public/banners`                    | GET    | public | VERIFIED |
| Search suggestions                         | `/api/v1/public/search/suggestions?q=`      | GET    | public | VERIFIED |
| Sitemap / Robots                           | `/api/v1/public/sitemap.xml` / `robots.txt` | GET    | public | VERIFIED |

### 3.3 Commerce (from `cart.routes.ts`, `wishlist.routes.ts`, `customer-order.routes.ts`, `customer-coupon.routes.ts`, `customer-payment.routes.ts`)

| Feature                | Endpoint                                                        | Method | Auth   | Status                  |
| ---------------------- | --------------------------------------------------------------- | ------ | ------ | ----------------------- |
| Get cart               | `/api/v1/cart`                                                  | GET    | Bearer | VERIFIED                |
| Add cart item          | `/api/v1/cart/items`                                            | POST   | Bearer | VERIFIED                |
| Update cart quantity   | `/api/v1/cart/items/:productId`                                 | PATCH  | Bearer | VERIFIED                |
| Remove cart item       | `/api/v1/cart/items/:productId`                                 | DELETE | Bearer | VERIFIED                |
| Clear cart             | `/api/v1/cart`                                                  | DELETE | Bearer | VERIFIED                |
| Merge local cart       | `/api/v1/cart/merge`                                            | POST   | Bearer | VERIFIED                |
| Wishlist CRUD          | `/api/v1/wishlist` GET/POST + `/:productId` GET/DELETE          | —      | Bearer | VERIFIED                |
| Place order (checkout) | `/api/v1/customer/orders`                                       | POST   | Bearer | VERIFIED                |
| Order history          | `/api/v1/customer/orders`                                       | GET    | Bearer | VERIFIED                |
| Order detail           | `/api/v1/customer/orders/:id`                                   | GET    | Bearer | VERIFIED                |
| Order tracking         | `/api/v1/customer/orders/:id/tracking`                          | GET    | Bearer | VERIFIED                |
| Coupon validate        | `/api/v1/customer/coupons/validate`                             | POST   | Bearer | VERIFIED                |
| My coupons             | `/api/v1/customer/coupons`                                      | GET    | Bearer | VERIFIED                |
| Payment initiate       | `/api/v1/customer/payments/:orderId/initiate`                   | POST   | Bearer | VERIFIED (Khalti/eSewa) |
| Payment verify         | `/api/v1/customer/payments/:orderId/verify`                     | POST   | Bearer | VERIFIED                |
| Payment status         | `/api/v1/customer/payments/:orderId/status`                     | GET    | Bearer | VERIFIED                |
| Payment callback       | `/api/v1/customer/payments/:orderId/callback`                   | POST   | public | VERIFIED                |
| Address book           | `/api/v1/customer/addresses` GET/POST + `/:id` GET/PATCH/DELETE | —      | Bearer | VERIFIED                |

### 3.4 Reviews / Notifications / Support (verified)

| Feature                                    | Endpoint                                                                                  | Method | Auth   | Status                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ | ------ | ------------------------- |
| Submit review                              | `/api/v1/customer/reviews`                                                                | POST   | Bearer | VERIFIED (forced Pending) |
| My reviews                                 | `/api/v1/customer/reviews`                                                                | GET    | Bearer | VERIFIED                  |
| My notifications                           | `/api/v1/customer/notifications`                                                          | GET    | Bearer | VERIFIED                  |
| Unread count                               | `/api/v1/customer/notifications/unread-count`                                             | GET    | Bearer | VERIFIED                  |
| Notification detail / mark-read / mark-all | `/:id`, `/:id/read` PATCH, `/read-all` POST                                               | —      | Bearer | VERIFIED                  |
| Delete notification                        | `/api/v1/customer/notifications/:id`                                                      | DELETE | Bearer | VERIFIED                  |
| Support conversations CRUD                 | `/api/v1/customer/support/conversations` + `/:id` + `/:id/messages` + `/read` + `/status` | —      | Bearer | VERIFIED                  |

### 3.5 Response & error envelopes; rate limits (from `ApiResponse.ts`, `ApiError.ts`, `rateLimiter.ts`)

- Success: `{ success:true, data, meta?, message? }`. Paginated → `{ data: T[], meta:{page,pageSize,total,totalPages} }`.
- Error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `BAD_REQUEST`, `INVALID_CREDENTIALS`, `PAYLOAD_TOO_LARGE`, `INTERNAL`, `INVALID_CUSTOMER_ID`, `SERVICE_UNAVAILABLE`.
- Limits: login/register 20/15min; refresh 60/15min; auth-action 20/15min; general API 300/min.

## 4. Frontend Technology Architecture

The storefront should reuse the admin dashboard's proven stack. Recommended stack and rationale:

| Technology | Why included / What it solves / Where used / Fit |
| --- | --- | --- |
| **React 19 + TypeScript (strict)** | Same language as admin; strict mode (`tsconfig.json`) catches contract drift against backend types. Whole app. |
| **TanStack Router (file-based App Router)** | Provides typed file routing _identical to the admin_. Route `head()` blocks emit SSR metadata (title/OG/canonical) for SEO; route components render the initial HTML server-side, then data hydrates client-side via TanStack Query. This is TanStack Start SSR — **not** React Server Components and **not** Next.js static site generation. | All storefront routes. |
| **TanStack Query** | Server-state cache/invalidation, deduplication, retries, background refetch (notifications/support), pagination invalidation. | All API reads/mutations. |
| **Tailwind CSS v4 + Radix UI + shadcn kit** | Design system parity with admin; WCAG-accessible primitives (Dialog, Drawer, Select, Tabs). | All UI. |
| **React Hook Form + Zod** | Type-safe forms; Zod schemas mirror backend validators exactly (register/login/checkout/review/support/address). | All forms. |
| **Sonner** | Toast/feedback parity. | Global feedback. |
| **Lucide** | Icon parity. | UI icons. |
| **Vite / TanStack Start** | SSR middleware + dev/build parity. | App shell. |

### 4.1 Why not Next.js / Zustand / React Server Components / a second state layer?

- **Reality check:** the project's `components.json` has `"rsc": false`, and the codebase uses **no** `createServerFn`, `"use server"`, or React Server Components anywhere (verified). The admin renders SSR HTML via TanStack Router route components + `head()` metadata, and fetches live data **client-side** through TanStack Query hooks (0 routes use `loader:`). The storefront must follow this **same** proven pattern.
- **Next.js** would introduce a second routing + SSR ecosystem and a second Vite/Nitro build, splitting the repo into two stacks for no verified benefit. TanStack Router already provides the exact SSR (route `head()` + server-rendered initial HTML) and client-hydration model this project uses.
- **React Server Components (RSC)** would be a Next.js-ism and is **not configured** (`components.json: rsc:false`) — do not prescribe it. Instead use route components + TanStack Query client-side data loading (the verified admin convention).
- **Zustand / client global store** is not needed. Server state lives in TanStack Query; short-lived UI state (cart drawer open, checkout step, filters) belongs in **local component/URL state**, not a global store. Adding one is rejected (§10, §27).
- **Shallow client copies of product data** should be avoided; always render from the query cache.

> Recommendation: introduce **no new heavyweight runtime dependencies**. Add at most small utilities only after the core is proven.

## 5. Website Route Architecture

TanStack Router file-based routes under `storefront/src/routes/`. Every route lists purpose, auth, API deps, SEO, rendering, components, loading/error/empty states.

### 5.1 Public storefront

**Rendering-convention note (verified from `src/routes/__root.tsx`, `vite.config.ts`, `components.json`):** the app uses TanStack Start SSR via Vite/Nitro (`@tanstack/react-start/plugin/vite` + `nitro/vite`). Routes expose `head()` for metadata and render components on the server as initial HTML; dynamic data is loaded **client-side with TanStack Query hooks** (no `loader()`, no React Server Components — `components.json` has `"rsc": false` — and no static site generation). "SSR + hydrate" below means server-rendered first paint (good for SEO) + client-side TanStack Query hydration for live data.

| Route                          | Purpose                                                                                                              | Auth   | API deps                                               | SEO                                          | Rendering                            | Loading                 | Error                        | Empty                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------ | ----------------------- | ---------------------------- | ----------------------------------- |
| `/` (index)                    | Storefront landing: hero banners, featured products, category/brand shortcuts                                        | public | `public/banners`, `public/products?featured=true`      | indexable, title/OG, Product+ItemList schema | SSR + hydrate                        | Skeleton hero + grid    | Retry banner                 | None (show editorial)               |
| `/products`                    | Catalog listing with query filters                                                                                   | public | `public/products`                                      | indexable, canonical + pagination links      | SSR + hydrate                        | Skeleton cards          | Retry banner + Reset filters | "No products match" + clear-filters |
| `/products/$slug`              | Product detail: gallery, price, stock, variations, reviews, related                                                  | public | `public/products/:slug`, `public/reviews?productId=`   | indexable, Product + Breadcrumb schema       | SSR + hydrate                        | Skeleton gallery + text | 404 page for NOT_FOUND       | Reviews "none yet"                  |
| `/categories`                  | Category directory                                                                                                   | public | `public/categories`                                    | indexable                                    | SSR + hydrate                        | Skeleton                | Retry                        | "No categories"                     |
| `/categories/$slug`            | Category page = filtered product listing + category info                                                             | public | `public/categories/:slug`, `public/products?category=` | indexable, CollectionPage schema             | SSR + hydrate                        | Skeleton                | 404 + retry                  | "No products"                       |
| `/brands`                      | Brand directory                                                                                                      | public | `public/brands`                                        | indexable                                    | SSR + hydrate                        | Skeleton                | Retry                        | "No brands"                         |
| `/brands/$slug`                | Brand page = filtered product listing + brand info                                                                   | public | `public/brands/:slug`, `public/products?brand=`        | indexable, brand schema                      | SSR + hydrate                        | Skeleton                | 404 + retry                  | "No products"                       |
| `/search`                      | Keyword results (`q`) + suggestions                                                                                  | public | `public/products?q=`, `public/search/suggestions`      | noindex (dynamic), canonical `?q=`           | SSR + hydrate (suggestions deferred) | Skeleton                | Retry                        | "No results for “q”"                |
| `/robots.txt` / `/sitemap.xml` | Crawler files — served by backend at `/api/v1/public/*`; storefront links those URLs in `<head>` (may reverse-proxy) | public | `public/robots.txt`, `public/sitemap.xml`              | n/a                                          | backend                              | n/a                     | n/a                          | n/a                                 |

**Query contract notes (verified):**

- `products` supports `q`, `category`, `brand`, `featured`, `page` (default 1), `pageSize` (max 48), `sort` (allowlist: `name`, `price`, `rating`, `reviewsCount`, `featured`, `createdAt`; `-field` or `field,desc`).
- `category` / `brand` accept **slug or id** (resolved server-side).
- `q` matches product **name/sku** only (there is no full-text description/search endpoint and no price-range/stock filter → mark such filters as unavailable; see §11 and §25).

### 5.2 Authentication routes

| Route              | Purpose                                                             | Auth                                  | API deps                        | SEO     | Rendering                           | Notes                                                    |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------- | ------------------------------- | ------- | ----------------------------------- | -------------------------------------------------------- |
| `/login`           | Customer sign-in (email+password, `remember` on a split-login page) | public (redirect authed → `/account`) | `auth/customer/login`           | noindex | Client component + RHF/Zod          | On success: set access token, merge local cart, navigate |
| `/register`        | Account creation                                                    | public (redirect authed)              | `auth/customer/register`        | noindex | Client component                    | Sets session cookie; then merge local cart               |
| `/forgot-password` | Request reset                                                       | public                                | `auth/customer/forgot-password` | noindex | Client component                    | Backend returns `requestId`; **no email is sent** (§25)  |
| `/reset-password`  | Consume reset link                                                  | public                                | `auth/customer/reset-password`  | noindex | Client component                    | Reads `requestId`+`token` from query/route               |
| Logout             | Action (not a page)                                                 | authed                                | `auth/customer/logout`          | noindex | Header/submit → clear session → `/` |

Because forgot-password **does not send email** (verified), the reset link must be delivered by the storefront itself in the chosen mail setup — dev mode can surface `requestId` directly. §25 lists this as a backend gap/blocker.

### 5.3 Commerce routes (guest → login-aware)

| Route                          | Purpose                                                                   | Auth                                                                                     | API deps                                                                                                         | Rendering       | States                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| `/cart`                        | Cart review: line items, qty edit, subtotal, coupon field, checkout CTA   | public-guest (local cart) / authed (server cart)                                         | `cart` (authed) or local state; `customer/coupons/validate`                                                      | Client          | Empty: "Your cart is empty" + CTA                                           |
| `/checkout`                    | Guest/authed checkout: address(es), payment method, coupon, order summary | authed required for **server order creation** (guest redirected to login before placing) | `customer/orders` POST, `customer/addresses`, `customer/coupons/validate`, `customer/payments/:orderId/initiate` | Client, stepper | Price preview limited: shipping/tax computed only at order create (see §25) |
| `/order-confirmation/$orderId` | Post-place confirmation + payment handoff                                 | authed                                                                                   | `customer/orders/:id`, `customer/payments/:orderId/status`                                                       | Client          | Pending/Paid/Failed payment states; retry                                   |

> **Backend gap (verified):** there is **no guest checkout endpoint** — `POST /customer/orders` always requires a customer session. Guests must create an account before placing an order. There is also **no shipping/tax quote endpoint**, so the checkout screen cannot preview shipping/tax until the order is created server-side (§25).

### 5.4 Account routes (protected — `account/_layout` with sidebar)

| Route                              | Purpose                                                                     | API deps                                                                                   | Data          | Loading              | Empty                | Error |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- | -------------------- | -------------------- | ----- |
| `/account`                         | Account dashboard: profile snapshot, recent orders, unread count, shortcuts | `customer/orders` (recent), `customer/notifications/unread-count`, `auth/customer/me`      | Skeleton      | "No orders yet"      | Retry                |
| `/account/profile`                 | View + edit name/phone; change password                                     | `auth/customer/me`, `auth/customer/profile` PATCH, `auth/customer/change-password`         | Form skeleton | —                    | Field errors / Retry |
| `/account/addresses`               | Address book CRUD                                                           | `customer/addresses`                                                                       | Skeleton rows | "No saved addresses" | Retry                |
| `/account/orders`                  | Order history (paginated, filter by status)                                 | `customer/orders`                                                                          | Skeleton rows | "No orders"          | Retry                |
| `/account/orders/$orderId`         | Order detail + tracking timeline + payment status + eligible review entry   | `customer/orders/:id`, `customer/orders/:id/tracking`, `customer/payments/:orderId/status` | Skeleton      | NOT_FOUND            | Retry                |
| `/account/reviews`                 | My submitted reviews                                                        | `customer/reviews`                                                                         | Skeleton      | "No reviews yet"     | Retry                |
| `/account/notifications`           | Notification center, mark read/read-all/delete                              | `customer/notifications`                                                                   | Skeleton      | "All caught up"      | Retry                |
| `/account/coupons`                 | My usable coupons                                                           | `customer/coupons`                                                                         | Skeleton      | "No coupons"         | Retry                |
| `/account/support`                 | Support inbox + create conversation                                         | `customer/support/conversations`                                                           | Skeleton      | "No conversations"   | Retry                |
| `/account/support/$conversationId` | Thread + compose message                                                    | `customer/support/conversations/:id`, `.../:id/messages`                                   | Skeleton      | Conversation closed  | Retry                |

**Route-level rendering rule:** all routes render first HTML via route components (TanStack Start SSR). Public catalog pages additionally emit SEO metadata through route `head()` blocks and hydrate data with TanStack Query; account/checkout/cart use TanStack Query client-side (no RSC — the verified admin pattern). Shared `_layout.tsx` provides header/footer/navigation; protected layouts enforce authentication and redirect to `/login?redirect=…`.

---

## 6. Website Information Architecture

### 6.1 Public storefront

`Home → Products → Categories → Brands → Search → Product details (+ reviews)`. All backed by `public/*` endpoints (VERIFIED). Product detail shows approved reviews (public) and lets an authenticated, order-owning customer submit a review (customer/reviews).

### 6.2 Authentication

Login, Register, Forgot password, Reset password. **Logout** is an authenticated action in the header. All VERIFIED. Email verification is NOT implemented (excluded).

### 6.3 Commerce

Cart (server cart VERIFIED; guest cart is client-side + `cart/merge`), Coupon (VERIFIED), Checkout → Order creation (VERIFIED, auth-only), Payment (Khalti/eSewa VERIFIED), Order confirmation. **No guest checkout** and **no shipping/tax quote** (gaps).

### 6.4 Customer account

Dashboard, Profile, Addresses, Orders, Order details + tracking, Reviews, Notifications, Coupons, Support, Settings/password. All backed by verified endpoints. **Not supported (do not build UI):** returns/cancellations self-service, account deletion, email verification, social login, review “helpful” upvote.

## 7. Customer User Flows

Flows are validated against the verified endpoints. Where a step has no backend support, it is marked **[GAP]**.

### 7.1 Guest shopping flow

```
Home → Product Listing → Product Details → Add to Cart (local, client-side)
     → Checkout → Login/Register (required — no guest checkout) [GAP: guest order]
     → Merge local cart (POST /cart/merge)
     → Shipping/Billing (POST /customer/addresses or inline)
     → Coupon (POST /customer/coupons/validate)
     → Place order (POST /customer/orders)  [auth]
     → Payment (POST /customer/payments/:orderId/initiate → gateway → verify/status)
     → Order Confirmation (/order-confirmation/:orderId)
```

### 7.2 Customer purchase flow

```
Login → Browse → Product → Cart (server) → Checkout → Coupon → Order → Payment → Order
```

Logged-in customers use the server cart directly; the flow skips local cart and merge.

### 7.3 Review flow

```
Login → /account/orders → Order detail → (delivered/eligible item) → Submit review
     → POST /customer/reviews { productId, rating, title?, body } (status forced Pending)
     → Appears publicly only after admin approves (GET /public/reviews)
```

### 7.4 Support flow

```
Account → Support → new conversation (POST /customer/support/conversations)
     → send message (POST .../:id/messages)
     → agent replies (admin support module) → customer reads (PATCH .../:id/read)
     → optional notification (customer/notifications)
```

Messaging is request/response (poll or refetch); no real-time socket is offered by the backend.

### 7.5 Cart-merge flow (guest → authenticated)

On login/register, if a local cart exists, `POST /cart/merge {items:[{productId,quantity}]}` migrates it (server re-validates stock & costs). Then the local cart is cleared. If the order was placed from the cart, the server clears the cart automatically (verified in `customer-order.service.create`).

---

## 8. API Client Architecture

A dedicated customer client mirrors the proven admin client (`src/lib/api/client.ts`) but targets the **customer** endpoints and customer cookie. Recommended layout:

```text
storefront/src/lib/api/
├── customer-client.ts   # fetch wrapper: baseURL, access token, 401→single-flight refresh→retry once
├── auth.ts              # register, login, refresh, logout, me, changePassword, updateProfile
├── forgot.ts            # forgotPassword, resetPassword
├── catalog.ts           # products list/detail, categories, brands, banners, searchSuggestions, reviews
├── cart.ts              # get, add, update, remove, clear, merge
├── wishlist.ts          # list, add, check, remove
├── orders.ts            # create, list, detail, tracking
├── coupons.ts           # validate, list
├── payments.ts          # initiate, verify, status (callback handled server-side)
├── reviews.ts           # create, list (my)
├── notifications.ts     # list, unreadCount, detail, markRead, markAllRead, remove
├── addresses.ts         # CRUD
└── support.ts           # conversations + messages CRUD
```

### 8.1 Client behaviors (VERIFIED to match backend)

- **Base URL:** `VITE_API_URL` or `http://localhost:4000/api/v1`.
- **Request handling:** attach `Authorization: Bearer <accessToken>` (in-memory); `credentials: "include"` so the httpOnly `customer_refresh_token` cookie is sent on refresh.
- **Response handling:** unwrap `{ success, data, meta?, message }`; helpers `get`, `post`, `patch`, `put`, `delete`, `getPaged`.
- **Error handling:** parse `{ success:false, error }` into typed `ApiError(status, code, message, details)`.
- **Auth/refresh (single-flight):** on 401 from any endpoint (except login/refresh/logout), share **one** in-flight refresh promise; rotate via `auth/customer/refresh`; retry the original request once; on failure clear session and route to `/login`.
- **Logout:** call `auth/customer/logout` (clears cookie server-side), clear in-memory token + query cache.
- **Retry:** TanStack Query `retry: 2` for idempotent GETs with backoff; **no auto-retry** for mutations (409/422 prompt the user; 429 surfaces rate-limit message).
- **Caching:** TanStack Query cache keys by resource + params; `staleTime` (e.g. catalog 5 min, notifications 30 s, cart short + invalidated on mutation).
- **Pagination/filter/sort/search:** typed query builders mirror verified params (§5.1). **Request cancellation:** AbortController on TanStack Query; cancel suggestions on new keystroke.

## 9. Authentication Architecture

### 9.1 Verified backend mechanism

- **Access token:** JWT (HS256), claims `{ sub: <CustomerAccountId>, type: "customer-access" }`, secret `CUSTOMER_JWT_ACCESS_SECRET`, TTL `CUSTOMER_ACCESS_TOKEN_TTL` (default `15m`). Sent as `Authorization: Bearer`. **Must live in memory only.**
- **Refresh token:** random base64url (hashed in DB), delivered as httpOnly cookie `customer_refresh_token`, `path=/api/v1/auth/customer`, `sameSite` lax(strict in prod), `secure` in prod, `maxAge` 30 days (`remember`) else `CUSTOMER_REFRESH_TOKEN_TTL_DAYS` (7). Rotated on refresh.
- **Login/register/refresh flow:** server sets the cookie; body carries only `customer` + `accessToken` (the refresh token never reaches JavaScript).
- **Logout:** server revokes the stored refresh session and clears the cookie.
- **Forgot/reset password:** `forgot-password` → `{ requestId }` (no email); `reset-password` → `{ requestId, token, newPassword }`.

### 9.2 Safest frontend implementation (does not conflict with backend)

- **Access token in memory** (React context/module var) — never in `localStorage`/`sessionStorage`/cookies → limits XSS exfiltration.
- **Refresh token only in the httpOnly cookie** (set by backend) — JS cannot read it → protects against XSS token theft.
- **Session restoration:** on first load, call `auth/customer/refresh` (cookie is sent automatically) → gets access token + customer. Treat as authenticated only after this succeeds. Guest browsing works before that.
- **Single-flight refresh:** share one refresh promise across concurrent 401s (prevents refresh races and storms).
- **CSRF:** rely on `sameSite` cookie + CORS `CLIENT_ORIGIN` allow-list. Since state-changes carry the `Authorization` header (not the cookie), CSRF risk is minimal. Do not disable `sameSite`; keep `secure` in prod.
- **Protected route guard:** guarded layouts redirect to `/login?redirect=<original>`; guest pages redirect authenticated users away.
- **Session expiration:** on refresh failure the client clears in-memory state, clears the query cache, and redirects to `/login` with a "session expired" message.
- **Change password / reset:** after a successful change the backend revokes other sessions; the client should then re-login or call refresh.

### 9.3 Security postures

- **XSS:** no access/refresh token in DOM storage; React Escape prevents script injection by default; sanitize rendered review/support text.
- **CSRF:** `sameSite` cookie + CORS allow-list; never send the refresh cookie on cross-site requests.
- **IDOR:** backend scopes every resource to `req.customer` — the frontend must **never send a customer id**; always let the server derive identity from the token.
- **Sensitive data:** never store passwords, tokens, or full payment data on the client.

---

## 10. State Management

- **Server state (TanStack Query):** products, categories, brands, reviews, orders, tracking, notifications, support, coupons, cart, addresses. Keyed by endpoint+params; invalidated on mutations.
- **Client/UI state (local/component):** cart drawer open, mobile nav open, filter panel open, checkout step index, form state (React Hook Form). No global store needed.
- **URL state (TanStack Router search params):** search `q`, `category`, `brand`, `sort`, `page`, `featured`; price-range is **not** supported by the backend → omitted from URL.
- **Persistent client state:** the **guest cart** (before login) must persist (e.g. `localStorage` — it holds only product ids/quantities, never prices/payment), to be merged on login. Everything else is server-persisted.
- **Never store insecurely:** access token, refresh token, passwords, payment/tokenization data. Guest cart in `localStorage` must store only `productId`+`quantity`.

## 11. Product Architecture

### 11.1 Product listing

Verifed query support from `public-catalog`: **search** (`q` on name/sku), **filter** by `category`/`brand` (slug or id) and `featured`, **sort** (`name|price|rating|reviewsCount|featured|createdAt`), **pagination** (`page`, `pageSize` ≤ 48).

**Not supported by the backend (do not build UI):**

- price-range / multi-select / stock filters — **no such params** exist in `publicProductListQuerySchema`.
- sorting by stock, SKU, or recency of sale.
- full-text description search (index is `name`+`sku` text only).

### 11.2 Product details

`GET /public/products/:slug` returns `PublicProductDto`: id, name, slug, sku, description, `category`+`brand` refs, price, **stock** (computed), status, rating, reviewsCount, featured, **images** (with optional width/height/variants), **variations** (size/color/sku/price/stock), shipping, seo, createdAt/updatedAt. **Reviews** via `GET /public/reviews?productId=` (approved only).

- Price/stock always come from the server — never cached client-side financially.
- **Variations** are exposed on the model but the cart/order engine keys on `productId` (no variation-sku purchase contract) → present variations for information, but map purchase to the base `productId`. **Do not** implement per-variant purchase until a backend contract exists.
- **Wishlist** is supported (VERIFIED, auth). **Related products** are not exposed by the backend → build a lightweight client-side "related" from same-category items via `public/products?category=` if desired, or omit.

---

## 12. Cart Architecture

Backend cart is **server-side and authenticated** (`/api/v1/cart`), keyed by `req.customer` (IDOR-safe), with server-authoritative pricing and stock (verified from `cart.service.ts`): it rejects inactive/non-searchable products, clamps to available stock, and computes subtotal server-side.

| Operation       | Endpoint                                            | Notes                                                                                                           |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Retrieve        | `GET /cart`                                         | returns `CartDto { id, items[{productId,quantity,price,name,slug,image,availableStock}], itemCount, subtotal }` |
| Add / increment | `POST /cart/items` `{productId, quantity?=1}`       | clamps to stock; rejects unavailable                                                                            |
| Update qty      | `PATCH /cart/items/:productId` `{quantity}`         | stock-checked                                                                                                   |
| Remove          | `DELETE /cart/items/:productId`                     |                                                                                                                 |
| Clear           | `DELETE /cart`                                      |                                                                                                                 |
| Merge local     | `POST /cart/merge` `{items:[{productId,quantity}]}` | validates stock/cost; caps qty                                                                                  |

**Guest cart (client-side):** the backend has **no anonymous server cart** (`getCart` requires a customer session). Guests use a **local cart** (productId+quantity only) and merge on login/register via `POST /cart/merge`. Price/stock for display come from the product detail response; final values are always the server's.

- **Cart persistence:** server cart persists server-side per customer; guest cart persists in `localStorage` until merge.
- **Cart synchronization:** merge is one-way (local → server) and only on auth; after order placement from the server cart, the server clears it automatically.
- **Stock validation:** enforced server-side on add/update; `availableStock` is echoed per item for UI.

> **BACKEND GAP (documented, do not invent):** no anonymous/server cart; no cart-level coupon storage (coupons are validated then applied only at order creation).

---

## 13. Checkout Architecture

Checkout is a single **authenticated** `POST /customer/orders` (verified). It reuses `orderService.create` for authoritative server-side pricing, product validation, stock reservation, coupon processing, totals, order number, timeline, and rollback. Line items come from body `items` or, when omitted, from the server cart (cart cleared only after success).

### 13.1 Frontend checkout sequence

1. **Auth guard** — redirect guest to login (`redirect=/checkout`). [GAP: no guest checkout]
2. **Cart** — guest local cart merged on login; server cart used when authed and no explicit items.
3. **Addresses** — choose/`create` via `customer/addresses` (or inline shipping/billing in the order body).
4. **Coupon** — `POST /customer/coupons/validate` `{code, items}` → projected discount (informational; enforced again at order create).
5. **Place order** — `POST /customer/orders` with `items|shipping/billing|paymentMethod|couponCode|notes`. Server returns full `OrderDto` (amounts incl. final shipping/tax `total`).
6. **Payment** — for Khalti/eSewa `POST /customer/payments/:orderId/initiate {gateway}` → redirect to `payment.paymentUrl`; then `GET /:orderId/status` (or `POST /:orderId/verify`) after return; server is authoritative (amount-checked, idempotent). For Cash-on-Delivery/bank transfer, no gateway — order stands as Pending.
7. **Success/Failure/Retry** — confirmation page polls `status`; Failed → re-initiate; network/gateway error → explicit retry; never infer success from the redirect.

### 13.2 Verified blockers / caveats

- **No shipping/tax quote endpoint** — the checkout cannot preview final shipping/tax before order creation; only the server `amounts` after `POST` are authoritative. Mid-order totals are **not** available without creating the order. This requires either (a) an upstream quote endpoint or (b) a UX that collects contact/address first and shows the server total only on the confirmation/payment step.
- **Payment gateways require configured credentials + return URLs** (Khalti/eSewa env values). Untestable end-to-end until those are set.
- Payments are **NPR** only (single-currency).

## 14. Customer Account Architecture

`/account/_layout` (protected, authenticated sidebar). Every section maps to a verified endpoint; identity is always derived server-side from the access token.

| Section        | Endpoint(s)                                                                           | Auth   | Components                                       | States                         |
| -------------- | ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------ | ------------------------------ |
| Dashboard      | `customer/orders` (recent), `customer/notifications/unread-count`, `auth/customer/me` | Bearer | StatCard, RecentOrders, UnreadBadge              | Skeleton; "No orders"          |
| Profile        | `auth/customer/me`, `auth/customer/profile` (PATCH), `auth/customer/change-password`  | Bearer | ProfileForm, ChangePasswordForm (RHF+Zod)        | Form skeleton; field errors    |
| Addresses      | `customer/addresses` CRUD                                                             | Bearer | AddressList, AddressForm, default toggle         | Skeleton; "No saved addresses" |
| Orders         | `customer/orders` (list, status filter, sort)                                         | Bearer | OrderTable, Pagination                           | Skeleton; "No orders"          |
| Order detail   | `customer/orders/:id`, `.../tracking`, `customer/payments/:orderId/status`            | Bearer | OrderSummary, Timeline, PaymentStatus, ReviewCTA | Skeleton; 404                  |
| Reviews        | `customer/reviews` (list)                                                             | Bearer | ReviewCard, Rating                               | Skeleton; "No reviews"         |
| Notifications  | `customer/notifications` (+read/read-all/delete)                                      | Bearer | NotificationList, UnreadBadge                    | Skeleton; "All caught up"      |
| Coupons        | `customer/coupons`                                                                    | Bearer | CouponCard (usable/remaining)                    | Skeleton; "No coupons"         |
| Support        | `customer/support/conversations` (+ new)                                              | Bearer | ConversationList, NewTicketForm                  | Skeleton; "No conversations"   |
| Support thread | `.../conversations/:id`, `.../:id/messages`                                           | Bearer | MessageThread, ComposeBox                        | Skeleton; closed state         |
| Settings       | `auth/customer/change-password`, `auth/customer/profile`                              | Bearer | PasswordForm, ProfileForm                        | Form skeleton                  |

---

## 15. Component Architecture

Reuse the admin `src/components/ui/*` and `kit` primitives (already installed). Build thin storefront wrappers — **do not over-engineer**.

```text
components/
├── ui/            # generic primitives (Button, Input, Select, Modal/Dialog, Drawer/Sheet, Toast/sonner,
│                  #   Card, Badge, Pagination, Breadcrumb, Skeleton, Tabs, Tooltip, Label)
├── layout/        # Header, Footer, MobileNav, AccountSidebar, CategoryNav, SearchBar
├── navigation/    # BreadcrumbNav, PaginationNav, SortControl, FilterDrawer
├── product/       # ProductCard, ProductGrid, ProductGallery, ProductPrice, Rating, StockBadge, VariationSelector
├── cart/          # CartDrawer, CartItemRow, CartSummary
├── checkout/      # CheckoutStepper, AddressForm, PaymentMethodSelect, CouponField, OrderSummary, PaymentStatusPanel
├── auth/          # LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm
├── account/       # AccountNav, ProfileForm, AddressList, OrderCard, ReviewForm, NotificationList, SupportThread
├── forms/         # Field (label+error+announcement), FormMessage, SubmitButton
├── feedback/      # EmptyState, ErrorState, ToastMsg, RetryPanel
├── loading/       # Skeleton primitives, PageLoader
└── common/        # Price, StatusBadge, DateLabel, SafeHtml (sanitized), IconButton
```

Reusable primitives you must have: `Button`, `Input`, `Select`, `Checkbox`, `Modal`, `Drawer`, `Dialog`, `Toast`, `Card`, `Badge`, `Pagination`, `Breadcrumb`, `ProductCard`, `ProductGrid`, `ProductGallery`, `Rating`, `Price`, `EmptyState`, `ErrorState`, `LoadingSkeleton`. All keyboard- and screen-reader accessible (Radix-based).

## 16. Folder Structure

The storefront is a **separate TanStack app** (`storefront/`) alongside the admin, reusing `src/lib` patterns. Recommended layout:

```text
storefront/
├── src/
│   ├── app/            # app-level providers (QueryClient, CustomerAuthProvider), router
│   ├── routes/         # file-based TanStack routes incl. _layout, public/*, account/*  (§5)
│   ├── components/     # ui/layout/navigation/product/cart/checkout/auth/account/forms/feedback/loading/common (§15)
│   ├── features/       # grouped domain modules (catalog, cart, checkout, account, wishlist, payment)
│   ├── lib/
│   │   ├── api/        # customer-client.ts + endpoint modules (§8)
│   │   └── auth/       # CustomerAuthContext (restore session, login/logout, useAuthReady)
│   ├── services/       # thin orchestration over lib/api (e.g. cart merge util, coupon eligibility)
│   ├── hooks/          # use-mobile, use-pagination, use-query variants, useDebounce
│   ├── stores/         # reserved for any client UI store if needed (currently none recommended)
│   ├── schemas/        # Zod schemas mirroring backend validators (auth, address, review, support, checkout)
│   ├── types/          # BackendContract types (ProductDto, CartDto, OrderDto, ...) §17
│   ├── utils/          # formatters (price in NPR), slug, query builder, date
│   ├── config/         # VITE_API_URL etc.
│   └── styles.css      # Tailwind entry
├── .env.example        # VITE_API_URL, VITE_STOREFRONT_URL
├── package.json
└── tsconfig.json
```

Directory responsibilities:

- `lib/api` — HTTP transport + auth/refresh + endpoint modules (no UI).
- `services` — pure orchestration/derivation used by components (no fetch).
- `schemas` — validation mirrors; `types` — response contracts (single source for TypeScript).
- `features` — domain-organized components + their TanStack Query hooks (contrast: generic `components/` are reusable).
- `stores` — intentionally **empty** unless a justified global client store appears (§10 rejects it for now).

---

## 17. Data & Type Architecture

Mirror the verified backend types 1:1 under `storefront/src/types/`. Keep them lean and derived from `src/lib/types` + backend DTOs (do **not** import backend JS files into the frontend — copy contracts and keep a CI type check).

Typed groups:

- **Public**: `PublicProductDto`, `PublicRef`, `PublicCategoryDto`, `PublicBrandDto`, `PublicReviewDto`, `PublicBannerDto`, `PublicSearchSuggestionDto`.
- **Auth**: `CustomerAuthProfile`, `CustomerAuthSessionResult { customer, accessToken, remember }`, `CustomerProfileResult`.
- **Cart**: `CartDto`, `CartItemDto`, `AddToCartInput`.
- **Order**: `OrderDto` (orderNumber, customer, email, region, warehouse, items, amounts, payment, status, addresses, timeline, coupon, notes, createdAt/updatedAt), `CustomerTrackingDto`.
- **Payment**: `CustomerPaymentDto`, `CustomerPaymentResult { payment, duplicate }`, `CustomerPaymentVerifyInput`.
- **Review**: `PublicReviewDto`, submit `{ productId, rating, title?, body }`.
- **Notification**: notification DTO + unread count.
- **Coupon**: `CouponValidationResult`, `CustomerCouponDto`.
- **Address**: customer address DTOs.
- **Support**: `SupportConversationDto`, `SupportMessageDto`.
- **Pagination**: `Paginated<T> = { data: T[]; meta: PaginationMeta }`.
- **Error**: `ApiError { status, code, message, details? }`.

**Zod request schemas** must mirror backend validators exactly (field names, max lengths, enums): register, login, change-password, update-profile, review submit, address create/update, support conversation/message, coupon validate, checkout order body. Shared enums: `PAYMENT_METHODS`, `PAYMENT_STATUSES`, `ORDER_STATUSES`, `PRODUCT_STATUSES`, coupon types.

Financial fields (`price`, `amounts`, `discount`) are **response-only**; Zod request schemas must **exclude** them so the client never sends financial values (backend `.strict()` rejects them anyway).

## 18. SEO Architecture

Backend already serves `sitemap.xml` and `robots.txt` at `/api/v1/public/*` (verified) built from **real public records** (products, categories, brands). The storefront should link those URLs in `<head>` and/or reverse-proxy them on the storefront origin for SEO best practice.

| Asset                              | Indexable?                          | Metadata (dynamic)                                    | Structured data                                                                                                |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/`                                | Yes                                 | title/description/OG; banner link targets             | Organization + ItemList                                                                                        |
| `/products`                        | Yes                                 | title; canonical + prev/next pagination               | ItemList/CollectionPage                                                                                        |
| `/products/$slug`                  | Yes                                 | title, description, OG image (first image), canonical | `Product` (name, image, price, sku, rating, aggregateRating, brand, category, availability) + `BreadcrumbList` |
| `/categories`, `/categories/$slug` | Yes                                 | title/description (server DTO)                        | CollectionPage + Breadcrumb                                                                                    |
| `/brands`, `/brands/$slug`         | Yes                                 | title/description                                     | Brand/Profile                                                                                                  |
| `/search?q=`                       | **noindex** (dynamic queries)       | canonical with `q`                                    | none                                                                                                           |
| Account/checkout/cart/login/etc.   | **noindex** (private/transactional) | none                                                  | none                                                                                                           |
| `/robots.txt`/`/sitemap.xml`       | n/a                                 | n/a                                                   | served by backend                                                                                              |

- **Canonical URLs** use the storefront production origin (via `VITE_API_URL`-adjacent `PUBLIC_ORIGIN`); dynamic `og:image` from `product.images[0].url`; `alt` from image alt.
- **Dynamic metadata** set via per-route `head()` blocks (TanStack Router SSR — the verified convention, no loader functions in this codebase). `head()` returns `{ meta, links }` referencing the loaded DTO (e.g. product `seo.title/metaDescription/keywords`).
- **Image optimization**: serve media through the backend `/media-files` (immutable max-age) or CDN in S3 mode; add `width`/`height` from media variants to avoid CLS.

---

## 19. Performance Architecture

- **SSR (server-rendered first paint):** catalog, product, category, brand, home, search render initial HTML on the server (TanStack Start SSR via Nitro) for SEO + fast first paint. Data hydrates client-side.
- **Client-side interactivity:** cart, checkout, account, auth, interactive filters mount and fetch via TanStack Query hooks. Because the project has **no React Server Components** (`rsc:false`), keep all data fetching in query hooks — this is the verified admin pattern.
- **No static site generation / ISR:** the project does **not** use Next.js-style SSG or ISR. "Static-like" caching of catalog responses can be achieved at the CDN/reverse-proxy layer with sane `Cache-Control` headers, but the app itself renders SSR + hydrates.
- **Dynamic rendering:** search results and any user-specific data are inherently dynamic and render at request time.
- **Image optimization:** lazy-load below-the-fold images (`loading="lazy"`), `priority` on hero/og image, responsive `srcset` from media variants, anchored dimensions.
- **Lazy loading & code splitting:** route-level code splitting (TanStack Router lazy routes) + dynamic `import()` for heavy feature bundles (gallery carousel, charts if reused).
- **API caching:** TanStack Query caching; dedupe identical in-flight requests; cache media/CDN responses via backend headers (immutable).
- **Prefetching:** prefetch product hover cards, next page on scroll, account data after login.
- **Pagination:** server-side via `page`/`pageSize`; keep list sizes ≤ backend max (48) to bound payloads.
- **Media/CDN:** use `/media-files` (local, immutable headers) or S3/CDN when `STORAGE_PROVIDER=s3`; generate correct image dimensions/variants server-side (media library).

---

## 20. Responsive Design Architecture

| Breakpoint              | Behavior                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop (≥1024px)**   | Full horizontal header (search, nav, cart/account), static category/brand sidebar or top nav, multi-column product grid, persistent product filters sidebar, account sidebar (2-column layout).                                                                                  |
| **Tablet (768–1023px)** | Condensed header; nav collapses to hamburger; product grid 2–3 cols; filters become a **drawer**; account sidebar collapses to a menu/drawer.                                                                                                                                    |
| **Mobile (<768px)**     | Mobile header with hamburger + cart icon; bottom navigation for key actions; product grid 1–2 cols; **filter drawer** (sheet); **sticky checkout controls** (order summary/CTA) persistent at bottom; account navigation as horizontal tabs/drawer; large touch targets (≥44px). |

Use Tailwind responsive prefixes + Radix `Sheet`/`Drawer` (already available) for mobile/tablet overlays. Ensure checkout and cart CTAs remain reachable and tap-friendly on mobile.

---

## 21. Security Architecture (frontend)

- **Authentication:** in-memory access token + httpOnly refresh cookie (backend-set). Never accessible to JS.
- **Authorization:** route guards only gate UX; **the server enforces all authorization/ownership (IDOR)**. The frontend never sends a customer id.
- **XSS:** React escaping; sanitize rendered review/notification/support text; never `dangerouslySetInnerHTML` on user content without a sanitizer.
- **CSRF:** `sameSite` cookie + CORS allow-list; auth changes carry `Authorization` header.
- **Token handling:** memory-only; single-flight refresh; clear on logout/401.
- **Input validation:** client Zod mirrors server; **server is authoritative** (fields are strict).
- **Sensitive data:** do not log/store tokens, passwords, or card/payment payloads.
- **Payment security:** never trust client amounts; redirect to gateway URL from server; confirm via server `status`/`verify`; amount-checked and idempotent server-side.
- **File upload:** no customer upload endpoints (reviews/support are text) — avoid adding upload UI.
- **Rate limiting awareness:** handle `429` gracefully; do not spam refresh (bounded by server budgets).
- **Error message sanitization:** surface only safe/stable messages (map `code` → copy); never render raw stack/`details` that expose internals.

### 21.1 Storefront deployment security headers (DEPLOYMENT REQUIREMENT — not code)

The backend enforces `helmet` headers on its own responses (verified: `content-security-policy`, `cross-origin-opener-policy`, `x-content-type-options`, etc. in `backend/src/app.ts`). That Helmet instance **does not** protect the storefront's SSR HTML, which is served by the TanStack Start / Nitro server. This repository ships **no deployment/reverse-proxy/CDN configuration**, so storefront header enforcement is deliberately left to the deployment layer (the `nitro()`, `tanstackStart()` and `vite` config in `storefront/vite.config.ts` are build-time only and must not be used to fake production headers).

Required production response headers for the storefront origin (set by the gateway / CDN / reverse proxy, **not** by storefront application code):

- `Content-Security-Policy` — must be compatible with TanStack Start SSR, hydration scripts, and the client bundle. A strict baseline compatible with the API/media origins:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: <media-origin>; connect-src 'self' <api-origin> <payment-gateway>; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
  (payment-gateway redirect flows (Khalti/eSewa) must be reachable via `connect-src`/`form-action`; verify in staging before locking down.)
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `frame-ancestors 'none'` (via CSP) — storefront must not be frameable
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: `geolocation=(), microphone=(), camera=()`
- `Cross-Origin-Opener-Policy`: `same-origin`
- `Cross-Origin-Resource-Policy`: `same-origin` on the HTML document (public catalog **media** may remain `cross-origin`/CDN-cached)
- HTTPS with a valid certificate, with **no** mixed content (media/API/payment origins over HTTPS).

## 22. Loading / Error / Empty States

A consistent state system via `LoadingSkeleton`, `EmptyState`, `ErrorState`, `RetryPanel` (TanStack Query `status`).

| Situation              | Behavior                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Loading                | `isPending` → skeleton (grid/card/table/form) matching layout; skip on SSR for SEO pages (already-rendered).                    |
| Network failure        | `ErrorState` with retry; on fetch-level failure show offline copy; keep previously-cached data if present.                      |
| 401                    | Refresh once (single-flight); failure → clear session + redirect `/login?redirect=…` with "session expired" message.            |
| 403                    | ErrorState "not authorized" (should not occur given server-scoped endpoints).                                                   |
| 404                    | Dedicated 404 page (product/category/brand not found or wrong slug) with popular links.                                         |
| 409                    | Conflict message (e.g. duplicate register) — inline on the form.                                                                |
| 422 / VALIDATION_ERROR | Field-level errors mapped to `details[{path,message}]`, announced.                                                              |
| 429                    | Rate-limit message with retry backoff (no busy-loop).                                                                           |
| 500 / INTERNAL         | Generic safe message; optional retry.                                                                                           |
| Empty                  | `EmptyState` (icon + title + CTA): no products, no results, no cart, no orders, no reviews, no notifications, no conversations. |
| Session expiration     | Handled via refresh-failure path above.                                                                                         |
| Payment failure        | `PaymentStatusPanel` shows Failed + reason + "Retry payment" (re-initiate); Pending shows spinner + poll.                       |

---

## 23. Accessibility

Target WCAG 2.1 AA.

- **Semantic HTML:** `header`, `nav`, `main`, `aside`, `footer`, `h1…h3`; landmarks per page.
- **Keyboard navigation:** full keyboard operability for nav, drawers/dialogs (Radix), forms, carousels; visible focus (`:focus-visible` ring).
- **Focus management:** focus trap + restore focus on Dialogs/Drawers (Radix); skip-to-content link at top.
- **Screen-reader support:** Radix ARIA roles/labels; `alt` on all images; announce breadcrumbs, sort changes, unread counts.
- **Form labels:** all inputs labelled (`<label>`/`aria-label`); `aria-describedby` for help; `aria-live` region via `Field` error announcer.
- **Color contrast:** WCAG AA (≥4.5:1 text); don't rely on color alone (status also uses icons/text).
- **Touch target sizing:** ≥44px interactive targets; adequate spacing.
- **Dialogs/drawers:** Radix accessible primitives; ESC to close; labelled; non-blocking close support where appropriate.
- **Reduced motion / reflow:** respect `prefers-reduced-motion`; responsive reflow at 320px, 200% zoom.

> **Color contrast (Phase 10):** the storefront's semantic tokens (`--foreground`, `--muted-foreground`, `--primary`, `--secondary-foreground`, `--destructive`, `--success`, borders) are defined in oklch in `storefront/src/styles.css`. Source-level WCAG AA ratios were NOT conclusively verified without an automated color-contrast tool, so **no arbitrary token changes were made**. Add automated contrast checks (Phase 11 testing / CI) against the rendered light and dark tokens, paying attention to `--muted-foreground` on `--background` (the most likely AA text candidate).

---

## 24. Testing Architecture

Layering (Vitest + Testing Library for unit/component; Playwright for E2E). **Note (verified):** the admin frontend has **no test framework installed** in `package.json` (only the `backend/` package uses Vitest). The storefront must add its own test tooling (Vitest + Testing Library + MSW for unit/component/integration, Playwright for E2E) as devDependencies during the testing phase.

| Layer                | Scope                                                                                                                                                                               | Examples                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Unit**             | utils (price/NPR, query builder, slug, cart merge calc), hooks, validation schemas, state derivation                                                                                | price formatter, pagination calc, zod schema edge cases           |
| **Component**        | ProductCard, ProductGrid, Rating, Price, forms (login/register/address/review), cart row, checkout stepper, auth gates                                                              | render, submit, error/empty states, a11y                          |
| **Integration**      | customer-client + AuthProvider (login/refresh/logout), API round-trips (public catalog, cart, orders, coupons, payments-initiate), TanStack Query mutations + invalidation          | msw endpoint fakes; assert request body excludes financial fields |
| **E2E (Playwright)** | Register, Login, Browse Products, Search, Filter, Product Details, Add to Cart, Checkout, Payment (mock), Order Confirmation, Order History, Review, Notifications, Support, Logout | real flows against a test backend                                 |

Keep backend contract type-checks in CI (mirror `schemas`/`types` against a snapshot) to catch drift early.

### 24.1 Phase 11 implementation (verified)

- **Storefront unit/component/integration:** Vitest 4 + Testing Library + MSW live in `storefront/` (`vitest.config.ts`, `src/test/setup.ts`, MSW handlers under `src/test/handlers/`). Run with `npm test --prefix storefront`. The suite includes security regressions: `isSafeRedirect()`, JSON-LD `<` escaping, guest-cart robustness, and request-body assertions proving no client-controlled financial fields are ever sent (`src/lib/api/financial-fields.test.ts`).
- **Contract verification:** snapshot-based — `storefront/src/test/contract/contract.test.ts` pins mirrored client schemas (field names / optionality / max lengths) against `backend-contract.snapshot.json` generated from backend validators. Update both deliberately when contracts drift.
- **E2E + accessibility:** `storefront/playwright.config.ts` boots the real seeded backend (`backend/scripts/e2e-server.mts`, in-memory MongoDB) and the SSR dev server, then runs `storefront/e2e/**`: axe scans on key routes (gate: zero critical/serious violations — this is the automated contrast check deferred from Phase 10), skip-link, form error focus, keyboard/focus behaviour, SSR private-data exclusion and open-redirect protection. Gateways are never contacted.
- **Backend additions:** `backend/test/cart-wishlist.test.ts` adds dedicated cart/wishlist ownership + IDOR + guest-merge regression coverage.
- **CI:** `.github/workflows/ci.yml` — install → lint/typecheck (root, storefront, backend incl. test tsconfig) → backend tests → storefront tests (contract checks included) → build → Playwright E2E + axe (separate job; browsers/mongodb binaries cached). All required steps fail the pipeline (`continue-on-error` is not used).
- **Known limitation:** real Khalti/eSewa sandbox E2E remains out of scope (no credentials); payment journeys stop at the gateway boundary.
- **Environment note (Windows, observed):** `playwright.config.ts` uses `reuseExistingServer: !process.env.CI`. Locally, if a stale dev/prod server is already listening on port 8090/4000 it will be **reused** and can serve old HTML whose asset hashes no longer match a rebuilt `.output/public`, making every client JS asset return 500 (no hydration, forms disabled, queries stuck on skeletons). Always kill stray listeners (or set `CI=1`) before a local E2E run. On CI `reuseExistingServer` is off and this cannot occur.
- **Lint scope:** `eslint.config.js` excludes three legacy files (`backend/src/modules/payments/payment.service.ts`, admin `src/lib/api/client.ts`, `src/routes/products.new.tsx`) that retain pre-existing `no-explicit-any` usage out of Phase 11 scope; they remain typechecked and covered by the backend/admin suites. All storefront Phase 11 source is fully lint-clean.

---

## 25. Backend Gaps / Frontend Blockers

Every capability below was verified against `backend/src`. Classification: **BLOCKER** (must be solved before a production storefront), **NON-BLOCKER** (frontend can ship around it), **FUTURE** (not required for v1).

| Feature                                            | Backend Status                                                                                                | Required API / Model / Service                                   | Priority                                                                                 | Blocks Frontend?                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Password reset **email delivery**                  | NOT IMPLEMENTED (`forgot-password` returns `requestId`; no email is sent — verified `customer-auth.service`). | Email delivery integration for the reset link.                   | **BLOCKER** for production auth UX                                                       | Yes — without a mailer, customers can't receive the reset link (dev can surface `requestId`). |
| Email verification                                 | NOT IMPLEMENTED (`emailVerifiedAt` on model only; no verify flow or endpoint).                                | Email verify endpoint + token.                                   | NON-BLOCKER                                                                              | No — v1 can accept unverified emails.                                                         |
| Guest checkout / anonymous order                   | NOT IMPLEMENTED (`POST /customer/orders` requires `customerAuthenticate`).                                    | Guest order endpoint or guest session.                           | NON-BLOCKER (workaround: require login before checkout)                                  | No — guests register/login before ordering (flow already gated).                              |
| Shipping/tax quote preview                         | NOT IMPLEMENTED (no quote endpoint; shipping/tax computed only at order creation).                            | `/customer/checkout/quote` or include a preview in order create. | NON-BLOCKER (workaround: surface the server total only on the confirmation/payment step) | No — but UX must not promise a pre-order total.                                               |
| Variant-specific purchasing                        | PARTIAL (variations on `Product`, but cart/order key only on `productId`).                                    | Variation-sku line-item contract.                                | NON-BLOCKER                                                                              | No — map purchases to base `productId`; show variations as info.                              |
| Related products                                   | NOT IMPLEMENTED (no related field/endpoint).                                                                  | Related-products query.                                          | NON-BLOCKER (can drive from same-category)                                               | No — build lightweight related or omit.                                                       |
| Returns / cancellations self-service               | NOT IMPLEMENTED (status transitions are admin-only).                                                          | Customer cancel/return endpoints.                                | NON-BLOCKER                                                                              | No — customers contact support.                                                               |
| Account deletion                                   | NOT IMPLEMENTED.                                                                                              | Delete-account endpoint + re-auth.                               | FUTURE                                                                                   | No.                                                                                           |
| Wishlist                                           | IMPLEMENTED (VERIFIED).                                                                                       | n/a                                                              | —                                                                                        | No.                                                                                           |
| Real-time support chat                             | NOT IMPLEMENTED (request/response only, no socket).                                                           | WebSocket/push.                                                  | FUTURE                                                                                   | No — poll/refetch.                                                                            |
| Product price range / stock / multi-select filters | NOT IMPLEMENTED (not in `publicProductListQuerySchema`).                                                      | Extended filter params.                                          | NON-BLOCKER                                                                              | No — omit filters not backed by API.                                                          |
| Full-text product/description search               | PARTIAL (index is `name`+`sku` only; no description search).                                                  | Text index on description.                                       | NON-BLOCKER                                                                              | No — search name/sku only.                                                                    |

---

## 26. Implementation Roadmap

Adjusted to actual backend readiness (customer API is largely VERIFIED, so public/auth/commerce phases can proceed immediately).

```
Phase 1  — Frontend foundation: scaffold storefront/ app (Vite + TanStack Start + Router + Query + Tailwind), env (VITE_API_URL, origin), router/layout, typing.
Phase 2  — Design system: copy/re-skin shadcn primitives (Button, Input, Select, Dialog, Drawer/Sheet, Toast, Card, Badge, Skeleton, etc.).
Phase 3  — Layout/navigation: Header, Footer, MobileNav, SearchBar, banner hero; SSR head() base metadata + OG + canonical wiring.
Phase 4  — Public storefront: home, products (list/filter/sort/paginate), product detail (+ reviews), categories, brands, search. Public API client + query hooks.
Phase 5  — Authentication: customer auth client, AuthContext (in-memory token, cookie-refresh), login/register/forgot/reset, protected/guest guards, cart-merge.
Phase 6  — Cart (server + guest local + merge) and Wishlist.
Phase 7  — Checkout/payment: address book, coupon validate, place order, Khalti/eSewa initiate→status/verify, confirmation/retry.
Phase 8  — Customer account: dashboard, profile, orders + tracking, reviews, notifications, coupons, support.
Phase 9  — SEO/performance hardening: metadata per route, structured data, image optimization, CDN/media, caching rules.
Phase 10 — Accessibility/WCAG + security review.
Phase 11 — Testing (Vitest + Testing Library + MSW, Playwright E2E) + CI type-checks of backend contracts.
Phase 12 — Production hardening: env secrets, CORS/secure-cookie, rate-limit handling, error monitoring, deploy wiring.
```

> Phase ordering reflects backend readiness: because the customer API is already implemented and verified, Phases 1–8 are buildable now; only production email delivery (Phase 5 blocker) requires infrastructure.

---

## 27. Architecture Decisions

| Decision                    | Choice                                                                                                     | Rationale (verified)                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer frontend placement | New `storefront/` app, not admin routes / not a workspace                                                  | Repo is a single non-workspace package; admin is at root; `backend/` is a self-contained nested package. The storefront has a distinct design system + auth domain + SEO, so it should be a separate app (mirrors `backend/`). |
| Framework                   | React 19 + TypeScript + TS (strict) + Vite + TanStack Start                                                | Same proven stack as admin; no RSC (`rsc:false`), no Next.js. Reuses existing conventions and CI.                                                                                                                              |
| Routing                     | TanStack Router file routes                                                                                | Identical to admin; SSR route components + `head()` metadata; lazy route splitting.                                                                                                                                            |
| Server-state                | TanStack Query                                                                                             | Client-side hydration (the verified admin pattern); caching, dedupe, retry, invalidation. No `loader()`/SSG/ISR.                                                                                                               |
| Rendering split             | SSR initial HTML for all; metadata via `head()`; data through query hooks                                  | Matches TanStack Start SSR. Public pages get SEO; interactive pages stay client-driven.                                                                                                                                        |
| State management            | TanStack Query (server) + local/URL (UI); no Zustand                                                       | No global client store is justified; avoids over-engineering and matches admin.                                                                                                                                                |
| Auth                        | In-memory access token + httpOnly `customer_refresh_token` cookie; single-flight refresh                   | Matches backend token/cookie contract and the admin AuthContext pattern; XSS/CSRF-safe; is the only safe option given backend cookie.                                                                                          |
| API layer                   | Thin endpoint modules over one typed customer client                                                       | Mirrors `src/lib/api/*`; enforced 1:1 backend contracts; request schemas mirror validators; **excludes financial fields** (backend `.strict()` rejects them).                                                                  |
| Dependencies                | Added: Vitest/Testing Library/MSW/Playwright only (testing). No Next, no Zustand, no new runtime           | Keeps stack coherent with admin; fills only the missing testing roles.                                                                                                                                                         |
| Public vs protected routes  | Public: catalog/search; protected: account, cart (server), checkout, orders; auth pages redirect if authed | Backend auth requirement (verified) drives this: catalog is public, customer resources require Bearer.                                                                                                                         |

---

## 28. Risks & Mitigations

| Risk                                  | Impact                                                | Mitigation                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend/frontend contract drift       | Compile/runtime errors                                | Mirror `types`/`schemas`; CI type-check against a contract snapshot; keep backend responses unwrapped via `sendSuccess/sendPaginated` (verified). |
| Password-reset email delivery missing | Unusable reset in production                          | Deliver reset link via a real mailer (infrastructure) — mark as BLOCKER; dev can surface `requestId`; never build a self-issued link.             |
| Payment gateway (Khalti/eSewa)        | Untestable end-to-end without credentials/return URLs | Initiate→redirect→server `status`/`verify`; never trust the redirect; mock gateway in E2E; add credentials before prod.                           |
| No shipping/tax quote                 | Checkout can't preview final total                    | Collect address/contact first; show server total on confirmation/payment step; add quote endpoint as follow-up.                                   |
| Guest cart + merge                    | Data loss on merge conflict                           | Merge via `POST /cart/merge` with server stock/cost clamping; local cart holds only `productId`+`quantity`.                                       |
| No server cart for guests             | Guests can't persist cart server-side                 | Local `localStorage` cart (id+qty only) merged on login; clear after merge/order.                                                                 |
| Rate limiting                         | 401/429 loops                                         | Single-flight refresh bounded; 429 → backoff + clear message; respect server budgets (300/min general).                                           |
| CORS/secure-cookie misconfig          | Auth failures in prod                                 | CLIENT_ORIGIN must include storefront origin; `COOKIE_SECURE`/`sameSite:strict` in prod; `credentials:include`.                                   |
| Performance/SEO                       | Poor crawl/paint                                      | SSR `head()` metadata + structured data; query caching; CDN `Cache-Control`; no SSG/ISR overclaims.                                               |
| Security                              | Token theft/IDOR/XSS                                  | Memory-only access token; httpOnly cookie; server-scoped ownership (never send customer id); sanitize user content; never log secrets.            |

---

## 29. Final Readiness Assessment

**Backend Readiness: 90%** (customer auth, catalog, cart, wishlist, orders, coupons, payments, reviews, notifications, addresses, support all VERIFIED; callback/sitemap/robots included).

**Customer API Readiness: 90%** (every customer-facing surface exists; missing only email delivery + optional enhancements).

**Frontend Architecture Readiness: 100%** (this document defined, verified, corrected, and gap-annotated; stack, routes, auth, state, SEO, security, testing, roadmap all specified).

**Frontend Implementation Readiness: 70%** — the frontend can be built now, **blocked only by password-reset email delivery** for a production-quality auth experience; guest-checkout and shipping-quote limitations change UX (not blockers).

**Critical Backend Blockers:**

- Password reset email delivery (no mailer → customers cannot receive reset links in production).

**Non-Critical Gaps:**

- Guest checkout (workaround: login required to place an order).
- Shipping/tax quote preview (workaround: server total at confirmation step).
- Variant-specific purchasing and related products (partial/none; optional).
- Email verification, returns/cancellations self-service (defer).
- Product price-range/stock/multi-select filters and full-text description search (deferred, API-driven).

**Blocking recommended next step:**

1. Ship the `storefront/` scaffold and Phases 1–4/6–8 (unblocked today).
2. Add a password-reset email delivery integration (SMTP/provider) to unblock Phase 5 production auth.
3. Optionally add `/customer/checkout/quote` and guest-order endpoints to lift checkout/completion UX.+
