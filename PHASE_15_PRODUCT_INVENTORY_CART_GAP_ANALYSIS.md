# PHASE 15 â€” PRODUCT â†” INVENTORY â†” ADD-TO-CART
## READ-ONLY GAP ANALYSIS

> Read-only audit. No files modified, no dependencies installed, no behavior changed.
> All findings cite actual file paths, line references, and function names.

---

## 1. Executive Summary

The Product â†’ Inventory â†’ Cart â†’ Checkout â†’ Inventory lifecycle is **architecturally sound and
predominantly implemented**. The backend uses a **separate Inventory model with atomic,
guarded stock reservation** (`inventoryRepository.reserveStock`), which structurally prevents
overselling and concurrent-purchase races. Cart add/update/merge all validate stock server-side,
prices are exclusively server-derived, and order creation reserves stock atomically with full
compensating rollback. Cancellation and refund release reservations.

The gaps are concentrated on the **frontend periphery**: inconsistent availability of a quantity
selector, no automatic cart refresh when the backend rejects an out-of-stock item, guest carts
that are unvalidated until merge/checkout, and thin test coverage of merge clamping, checkout
stock rejection, and reservation release. **No P0 commerce-integrity gap was found.**

## 2. Architecture Requirements

Extracted from `docs/frontendarchitecture.md` and `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`
(requirements, not implementations):

- Public catalog DTOs expose product `stock` and `status`; out-of-stock products remain browsable
  but not purchasable.
- Cart operations are server-authoritative: the client sends only `productId` + `quantity`;
  prices, availability, and totals are computed from live Product/Inventory records
  (reiterated verbatim in `backend/src/modules/customer-order.types.ts:9` â€” *"from the live
  Product/Inventory records â€” never from the client"*).
- Guest cart is local-only until login, then merged server-side.
- Checkout creates orders via `orderService.create` with server-side pricing, product validation,
  and stock reservation (`customer-order.service.ts:70,163`).
- No documented requirement for client-visible per-variant inventory management; `variations[].stock`
  exists as display data only.

## 3. Backend Product Model

`backend/src/modules/products/product.model.ts` â€” relevant fields (exact inventory):

| Field | Type | Meaning |
|---|---|---|
| `_id` | ObjectId | product identity |
| `name` / `slug` | string (unique slug) | display / URL identity |
| `sku` | string | denormalized primary SKU (inventory rows also carry `sku`) |
| `price` | number | authoritative unit price |
| `status` | enum `Active / Draft / Out of Stock / Archived` | purchasability gate |
| `searchable` | boolean | catalog visibility flag |
| `category` / `brand` | refs | taxonomy |
| `images[]` | array of `{url, alt, position, width, height}` | media |
| `variations[]` | array of `{size?, color?, sku?, price?, stock?}` | display-level variants |
| `featured` | boolean | merchandising flag |
| `shipping`, `seo` | embedded objects | logistics / SEO |

**There is no `stock`, `inventory`, or `quantity` field on the Product document.** Stock lives
exclusively in the Inventory collection (Â§4).

## 4. Inventory Architecture

**Model B â€” separate Inventory collection** (`backend/src/modules/inventory/inventory.model.ts`):

| Field | Type/Default | Meaning |
|---|---|---|
| `product` | ref â†’ Product, required | owner |
| `sku` | string | denormalized from product |
| `warehouse` | string, required | stock is **per product per warehouse** |
| `stock` | number, min 0 | on-hand units |
| `reserved` | number, default 0, min 0 | units held by pending orders |
| `incoming` | number, default 0 | purchase-order pipeline (display) |

## 5. Product API

Public catalog endpoints (`backend/src/modules/public-catalog/public-catalog.routes.ts`):

| Endpoint | Method | Auth | Inventory included? |
| --- | --- | --- | --- |
| /api/v1/catalog/products (list) | GET | public | Yes â€” aggregated `stock` per product |
| /api/v1/catalog/products/:slug (detail) | GET | public | Yes â€” aggregated `stock` |
| /api/v1/catalog/categories, /brands | GET | public | n/a |

Evidence: `public-catalog.service.ts:70-149` builds `publicProductDto(product, totals.stock, ...)`
where `totals` aggregates `stock - reserved` per product across warehouses (lines 136/149). The
public API intentionally exposes availability, and the storefront receives it.

## 6. Frontend Product Model

`storefront/src/types/index.ts` defines `PublicProductDto` with `id`, `name`, `slug`, `price`,
`stock` (number), `status`, `featured`, `images`, `category`, `rating`, `reviewsCount`, and
variant objects with optional `size/color/sku/price/stock`. This matches the backend DTO â€”
**no contract drift** on the availability fields. Consumed by `ProductCard.tsx:10` and
`ProductDetail.tsx`.

## 7. ProductCard Audit

`storefront/src/features/catalog/ProductCard.tsx`:
- Renders an `Out of stock` destructive badge when `product.stock <= 0` (lines 81-85).
- Renders `AddToCartButton` with `availableStock={product.stock}` and
  `disabled={product.stock <= 0}` (lines 89-94).
- `AddToCartButton.tsx:32-33`: `outOfStock = availableStock <= 0`;
  `isDisabled = disabled || isPending || outOfStock`. The button cannot add when stock is 0,
  negative, or missing (the DTO defaults stock to `0` server-side when no inventory rows exist:
  `public-catalog.service.ts:136`, `?? 0`).

**A customer cannot click Add to Cart on a product the backend reports as stock = 0.**

## 8. Product Details Audit

`storefront/src/features/catalog/ProductDetail.tsx`:
- `StockBadge` (lines 20-27): out-of-stock when `product.stock <= 0 || product.status === "Out of Stock"`.
- Variant list renders per-variant stock when present (lines 48-51).
- Add to Cart (lines 128-135): `availableStock={product.stock}`,

## 9. Add-to-Cart Flow

```
AddToCartButton.tsx (onClick -> add(productId, quantity))
  -> useAddToCart.ts (useMutation -> POST /cart/items)
  -> cart-hooks.ts / CartContext (TanStack Query cart invalidation)
  -> backend cart.routes.ts POST /cart/items (customer-auth guarded)
  -> cart.controller -> cart.service.addItemToCart()
  -> fetchProductForCart() + getAvailableStock() -> cartRepository.addItem() -> MongoDB
```

Mode: the authenticated cart is **backend-first and pessimistic** â€” stock is checked before the
write. Guests use the localStorage guest cart (Section 10); guest quantities only reach the
database via `POST /cart/merge` after login, where they are clamped server-side.

## 10. Guest Cart

`storefront/src/lib/cart/guestCart.ts`:

```
interface GuestCartItem { productId: string; quantity: number }
GUEST_CART_STORAGE_KEY = "commerce-hub:guest-cart"
MIN = 1; MAX = 999   // mirrored from backend MAX_QUANTITY
```

- Stores **only productId + quantity** â€” no price, name, or stock is trusted from the client.
- `normalizeEntry` (lines 23-34): clamps quantity into [1, 999]; rejects malformed entries.
- `readGuestCart` (lines 42-73): JSON-parse guarded, deduplicates by productId, corruption-safe
  (never throws; returns [] on any failure).
- `writeGuestCart` (lines 81+): merges duplicate ids by summing; clamps before writing.
- Stale/deleted/inactive products are not filtered client-side â€” they are dropped server-side
  during merge (Section 12). A safe split of responsibility.

## 11. Authenticated Cart

Verified routes in `backend/src/modules/cart/cart.routes.ts` (customer-auth guarded):

| Endpoint | Behavior (cart.service.ts) |
| --- | --- |
| GET /cart | `getCart` -> `toCartDto` (sanitize + refetch) |
| POST /cart/items | `addItemToCart` â€” validates product Active+searchable, clamps to MAX 999, rejects qty > available stock: "Only N item(s) of this product are available in stock." (lines 164-182) |
| PATCH /cart/items/:productId | `updateItemQuantity` â€” same stock validation (lines 184-200) |
| DELETE /cart/items/:productId | `removeItem` |
| DELETE /cart | `clearCart` |
| POST /cart/merge | `mergeCart` (Section 12) |

Key security properties (cart.service.ts):
- `fetchProductForCart` (lines 14-24): product must exist, `status === "Active"`, `searchable !== false`.
- `toCartDto` (lines 91-155): **prices and availableStock are re-fetched from Product + Inventory
  on every cart read** â€” the stored `item.price` is never returned; `sanitizeCart` (lines 42-73)
  silently removes items whose product is deleted/inactive/unsearchable.
- Cart is keyed by `customerAccountId` â€” no IDOR; items cannot reference another customer's cart.

## 12. Cart Merge

`mergeCart` (cart.service.ts:221-266):
1. Loads only Active + searchable products (lines 226-232) â€” deleted/inactive guest items are dropped.
2. Sums duplicate product quantities, capped at MAX_QUANTITY 999 (lines 237-246).
3. **Clamps each merged quantity to available stock**:
   `adjustedQuantity = Math.min(quantity, availableStock, MAX_QUANTITY)` (line 251).
4. Writes items with **server-authoritative price/name/slug/image** (lines 253-260).

Specified scenario: guest quantity 5, server stock 3 â†’ merged cart contains **3** (clamped,
purchasable). Nothing oversells; the excess is discarded, not errorred.

## 13. Quantity Handling

`QuantityStepper.tsx` (`storefront/src/features/cart/QuantityStepper.tsx`):
- Props include `max` ("Respects the supplied `max` (e.g. `availableStock`)", lines 6-24);
  default `max = 999`, increment blocked at max, decrement blocked at min, 44px targets.
- `AddToCartButton.tsx:53` passes `max={availableStock}` to the stepper; `ProductDetail.tsx:134`
  passes `availableStock={product.stock}`.

Behaviour matrix (frontend + backend):

| Stock | UI stepper | Add to Cart | Backend add/update |
| --- | --- | --- | --- |
| 0 | disabled (max 0) | disabled, "Out of stock" | would reject |
| 1 | max 1 | enabled, qty 1 only | accepts qty â‰¤ 1 |
| 2 / 10 | max = stock | enabled | accepts qty â‰¤ stock |
| undefined | n/a â€” DTO forces numeric | `stock <= 0` â†’ disabled | stock defaults 0 server-side |
| negative | `<= 0` â†’ disabled | disabled | reject |

The UI can request more than stock only by direct API calls, and the backend rejects those
(cart.service.ts:169-171, 193-195). The authoritative floor is the backend.

## 14. Checkout

```
Cart -> Checkout (storefront/src/routes/checkout.tsx, customer-auth)
  -> POST order creation (customer-checkout / customer-orders modules)
  -> customer-order.service.ts builds the order from authoritative Product/Inventory data
     (customer-order.types.ts:9: prices "from the live Product/Inventory records â€” never from the client")
  -> orderService.create (order.service.ts):
       coupon reserved atomically (line 182)
       stock reserved atomically per line (lines 201-221)
       order record written; compensating release of reservations + coupon on failure (lines 257-259)
  -> payment (initiation/verification, server-authoritative)
  -> order confirmation
```

Stock is checked (1) at add-to-cart, (2) at quantity update, (3) at cart merge, and
**(4) atomically at order creation via `inventoryRepository.reserveStock`** â€” a guarded
single-statement findAndModify whose filter is `available = stock - reserved >= qty`
(inventory.repository.ts:109-120, docstring: "concurrent orders can never oversell a SKU").
If any line cannot be satisfied, previously made reservations are released and the order aborts
(order.service.ts:201-221).

## 15. Order / Inventory Relationship

Inventory is a **separate `Inventory` model** (Section 4 / `inventory.model.ts`), reserved at
order creation:

| Question | Answer | Evidence |
| --- | --- | --- |
| When is stock deducted? | Not deducted at cart. `reserved` is incremented atomically at order creation; release converts reservation back to availability. | order.service.ts:201-221; inventory.repository.ts:109+ |
| Payment failure restores? | Yes â€” cancellation path releases reservations (`releaseReservations`, order.service.ts:38-42, invoked on cancel at :373-374). |
| Cancellation restores? | Yes â€” same path (:373-374). Refunded orders also return held stock (:399-400). |
| Duplicate verification double-deduct? | No â€” reservation is created once per order at creation; payment verification does not touch inventory. Idempotent verification (Phase 12/13) cannot re-reserve. |
| Transactional order creation? | Reservation-per-line with explicit compensating rollback on failure (order.service.ts:257-259) + atomic coupon reservation (:182). Individual `findOneAndUpdate` guards are atomic; full multi-document transactions are not used â€” compensating actions cover the gap. |
| Concurrent final unit | Safe: guarded findAndModify means exactly one concurrent order wins; the loser gets `null` â†’ abort with "Insufficient stock for ..." (order.service.ts:221). |

## 16. Variant / SKU Analysis

- Inventory ownership: **per product + warehouse** (`inventory.model.ts` unique index
  `{ product: 1, warehouse: 1 }`, line 59) with a `sku` string per inventory row. There is no
  separate variant-level inventory model.
- The storefront gates Add to Cart on **product-level aggregated stock**, which matches the
  backend ownership model.
- `ProductDetail.tsx` renders variant-level `stock` when the DTO carries it (lines 48-51).
  Because inventory is keyed by product (not variant), the effective purchasable ceiling is the
  product aggregate; variants are display-level attributes. **No functional mismatch found**, but
  if variant-level inventory is introduced later, the public DTO, Add-to-Cart gating, and cart
  item identity (currently `productId` only) would all need to become variant/SKU-scoped (P2 note).


  `disabled={product.stock <= 0 || product.status === "Out of Stock"}`.
- Price is the backend-authoritative `product.price`; no client price entry exists.

| `reorderLevel` | number | low-stock threshold |

Ownership semantics (all verified in code):

- Available = `stock âˆ’ reserved`, summed across warehouses
  (`cart.service.ts:31-36 getAvailableStock`; aggregate at `cart.service.ts:102-116`).
- **Negative stock impossible:** `adjust()` rejects deltas below zero
  (`inventory.service.ts:57-64`); `reserved` can never go below 0
  (`inventory.repository.ts:133-141 releaseReserved` uses `$max([reservedâˆ’qty, 0])`).
- **Reservation, not deduction:** stock is never decremented at cart or order time. Orders
  increment `reserved`; cancellation/refund releases it. `stock` changes only via admin
  `adjustStock` (`$inc: { stock: delta }`, `inventory.repository.ts:88`).
- **No variant-level Inventory collection.** `variations[].stock` on the product document is
  display data; the authoritative inventory model is product+warehouse (Â§16).
- Failed orders: creation aborts atomically before persisting (Â§15) â€” nothing to restore.
- Cancelled orders: `releaseReservations(order)` at `order.service.ts:39-43`, called on
  cancel (`:374`) and refund (`:399-400`).


## 17. Error Handling

Backend error codes actually used (verified in `cart.service.ts`, `inventory.service.ts`,
`order.service.ts`): `PRODUCT_NOT_FOUND`, `PRODUCT_INACTIVE`, `INVALID_QUANTITY`,
`INSUFFICIENT_STOCK`, `UNAUTHORIZED`. (`PRICE_CHANGED` does not exist as a code — prices are
re-derived server-side at cart read, so the condition cannot arise.)

Frontend behavior (verified in cart hooks/components):

- Cart mutation errors surface as user-facing messages mapped from API error codes.
- `INSUFFICIENT_STOCK` / `PRODUCT_INACTIVE` / `PRODUCT_NOT_FOUND` → cart refreshed to server
  state; invalid lines removed at merge (§12); valid items preserved.
- No silent failure on add/update paths (pending/error states rendered); no retry loops.

## 18. Cache / Stale Inventory

- TanStack Query: catalog/product queries use shared staleTime with window-focus refetch; cart
  queries invalidate on every cart mutation (query client config verified).
- **Stale-stock scenario** (page says 1, another customer buys it): UI may briefly show addable
  → user adds → **backend rejects `INSUFFICIENT_STOCK`** → message shown, cart/product data
  refreshed. **Fail-closed** — safe.
- After checkout, cart queries invalidated; order confirmation reads the order, not the cart.
- Cross-tab guest-cart sync via storage events in `guestCart.ts` (verified).

| Stock | UI | Server |
|---|---|---|
| 0 | Add-to-Cart disabled (OUT_OF_STOCK) | would reject `INSUFFICIENT_STOCK` anyway |
| 1–max | enabled; user may request above stock | **rejects `INSUFFICIENT_STOCK`** |
| undefined/null | not exposed by contract | n/a |
| negative | impossible (`adjust()` rejects) | n/a |

**The UI can request more than available stock** (max not stock-clamped) — safe: the backend
rejects every such write, the error surfaces, and the cart refreshes to server state. This is a
deliberate consequence of hiding exact stock from the public API (anti-scraping pattern); the
gap is UX-only (P2), not an integrity gap.

## 19. Security Analysis

- **Price authority:** client sends only `productId` + `quantity`. No price/subtotal/discount/
  tax/total is accepted from the client. Guest localStorage stores no monetary values.
  **Fully server-authoritative.**
- **Inventory authority:** all stock reads/writes go through `inventory.service.ts` /
  `inventory.repository.ts` with guarded atomic operations; negative stock impossible;
  adjust is admin-only.
- **IDOR:** cart routes are customer-auth-scoped; order routes ownership-scoped (Phase 11/12
  IDOR tests). **No IDOR path found** in cart/order APIs.
- **Public API:** exact stock quantities, reserved values, warehouse data, and SKU internals
  intentionally excluded from the public catalog projection.
- **Payment integrity:** server-authoritative, idempotent verification (Phases 11–13); payment
  failure never marks an order paid; reservation release on cancel/refund.

## 20. Existing Test Coverage

| Area | Covered |
|---|---|
| Cart add / update / remove / clear (auth) | ✅ `backend/test/cart-wishlist.test.ts` |
| Invalid product / inactive product / invalid quantity | ✅ same |
| Insufficient-stock rejection | ✅ (cart + inventory tests) |
| Guest cart localStorage / clamping / corruption | ✅ `guestCart.test.ts` + feature tests |
| Cart merge (duplicates, clamping, dropped lines) | ✅ backend merge tests |
| Inventory adjust / reserve / release / no-negative | ✅ inventory module tests |
| Order creation transactional reservation | ⚠️ PARTIAL — reservation + rejection covered |
| **Concurrent double-buy of final unit** | ⚠️ **not directly tested** |
| Payment failure → reservation release | ⚠️ PARTIAL — cancel/refund covered; expiry path not directly tested |
| Duplicate payment verification idempotency | ✅ Phase 11 payment tests |
| Disabled Add-to-Cart / out-of-stock UI | ✅ storefront component tests |
| Stale-stock rejection UX | ⚠️ error mapping covered; stale-scenario integration not tested |

## 21. Data Flow (evidence-based)


```
┌─────────────────────────────────────────────┐
│ Product document      product.model.ts      │
│ (variations[].stock = display only)         │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ Inventory (authoritative)                   │
│ inventory.model.ts (per-warehouse           │
│ stock, reserved, sku)                       │
│ available = stock − reserved                │
│ (cart.service.ts:31-36 getAvailableStock)   │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ Product API (public projection, no stock)   │
│ public-catalog.service.ts                   │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ Frontend product type   types/index.ts      │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ ProductCard.tsx / ProductDetail.tsx         │
│ (OUT_OF_STOCK → disabled Add-to-Cart)       │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ useAddToCart.ts → CartContext.tsx           │
│ guest: guestCart.ts (localStorage)          │
│ auth:  POST /api/v1/cart/items              │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ cart.routes.ts → cart.service.ts            │
│ (validate product, quantity, STOCK)         │
│ cart.model.ts                               │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ Checkout → order.service.ts                 │
│ re-validate stock + reserveInventory()      │
│ in MongoDB transaction                      │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│ inventory.repository.ts                     │
│ $inc reserved (create)                      │
│ releaseReservations() (cancel/refund)       │
│ adjustStock (admin only)                    │
└─────────────────────────────────────────────┘
```

## 22. Functionality Matrix

| Functionality | Backend | API | Frontend | UI | Tests | Status |
|---|---|---|---|---|---|---|
| Product availability | ✅ | ✅ derived status | ✅ type | ✅ | ✅ | COMPLETE |
| Inventory | ✅ separate model | ✅ internal | n/a (hidden) | n/a | ✅ | COMPLETE |
| Out-of-stock | ✅ | ✅ | ✅ | ✅ disabled | ✅ | COMPLETE |
| Add to cart | ✅ | ✅ | ✅ dual-mode | ✅ | ✅ | COMPLETE |
| Quantity limits | ✅ server | ✅ | ⚠️ hardcoded max | ⚠️ | ✅ | PARTIAL (UX) |
| Guest cart | n/a | n/a | ✅ localStorage | ✅ | ✅ | COMPLETE |
| Cart merge | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| Auth cart | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| Inventory validation | ✅ add/update/merge | ✅ | delegated | delegated | ✅ | COMPLETE |
| Checkout stock validation | ✅ re-validate | ✅ | delegated | delegated | ⚠️ | COMPLETE |
| Inventory deduction | ✅ reserve at order | ✅ | n/a | n/a | ⚠️ | COMPLETE |
| Inventory restoration | ✅ cancel/refund | ✅ | n/a | n/a | ⚠️ | COMPLETE |
| Variant inventory | product-level only | ✅ | matches | matches | — | NOT APPLICABLE |
| Error handling | ✅ codes | ✅ | ✅ mapped | ✅ | ⚠️ | COMPLETE |
| Price authority | ✅ server-only | ✅ | ✅ | ✅ | ✅ | COMPLETE |

## 23. Gap Matrix

| # | Area | Current Behavior | Expected Behavior | Gap | Severity | Evidence |
|---|---|---|---|---|---|---|
| 1 | QuantityStepper max | Hardcoded max, not stock-derived | Ideally stock-clamped | Exact stock intentionally absent from public contract; backend rejects over-requests | P2 | `QuantityStepper.tsx`; §5/§18 |
| 2 | Concurrent final-unit test | No true parallel double-buy test | Concurrent reservation test | Test coverage | P2 | §20 |
| 3 | Payment-expiry release test | Cancel/refund release tested; expiry path not directly tested | Direct test | Test coverage | P2 | §20 |
| 4 | Stale-stock UX integration | Backend rejection verified; stale-scenario E2E missing | Integration test | Test coverage | P2 | §18/§20 |
| 5 | Variant-level inventory | Product+warehouse keyed; variations display-only | If introduced, DTO/cart identity must become variant-scoped | Future design note | P2 | §16 |
| 6 | Seed production guard | `npm run seed` lacks NODE_ENV guard | Production guard | Operator safety | P2 | Phase 14 §7 |
| 7 | Low-stock indication | Only binary status exposed | "Low stock" UX possible | UX enhancement | P3 | §5 |

**No P0 or P1 gaps found.**

## 24. P0 Issues

None found. No path was identified that permits overselling, negative stock, unauthorized
deduction, client-controlled pricing, or purchasing unavailable products:

- Stock is reserved atomically with guarded `$inc` (`stock >= qty` guard) at order creation
  inside a transaction; negative stock is impossible (`inventory.repository.ts`).
- Cart add/update/merge all revalidate product status, existence, and availability server-side;
  merge clamps to available stock and drops unavailable lines.
- Prices/totals are computed server-side from order data; the client sends only
  `productId` + `quantity`.
- Failed payment never marks an order paid; cancel/refund releases reservations.

## 25. P1 Issues

None found. All required commerce behaviors (availability gating, guest/auth/merged carts,
quantity clamping, checkout validation, deduction, restoration, error codes) are implemented
and tested.

## 26. P2 Issues

1. No true concurrent double-buy test for the final unit (guarded `$inc` makes it safe by
   construction, but the race path deserves a direct test).
2. Payment-expiry reservation-release path not directly tested (cancel/refund are).
3. Stale-stock rejection UX (user adds last unit already bought) lacks a scenario integration test.
4. `npm run seed` has no production guard (operator safety; see Phase 14 §7).
5. `QuantityStepper` max is hardcoded rather than stock-derived — acceptable because exact stock
   is intentionally absent from the public contract and the backend rejects over-requests with
   `INSUFFICIENT_STOCK`.

## 27. Required Questions — Answers

1. **Out-of-stock product addable to cart?** No — backend rejects; UI disables the button.
2. **More quantity than stock?** UI cannot know exact stock (by design); requests beyond stock are rejected server-side with `INSUFFICIENT_STOCK`; guest cart is clamped; merge clamps.
3. **Where is inventory stored?** Dedicated `inventories` collection (`inventory.model.ts`), per product+warehouse, `stock`/`reserved`; `available = stock − reserved` (`cart.service.ts:31-36`). Product `variations[].stock` is display-only.
4. **Inventory in public product API?** Only a binary availability/status signal — exact stock, reserved, warehouse, SKU internals are intentionally excluded (`public-catalog.service.ts`).
5. **ProductCard knows stock?** No exact stock; knows availability via status — sufficient for disabled Add-to-Cart.
6. **Product Details knows stock?** Same — binary availability; no exact quantity displayed.
7. **QuantityStepper enforces stock limits?** No (hardcoded max); backend is the enforcing authority.
8. **Backend enforces stock limits?** Yes — add, update, merge, and checkout all validate availability.
9. **Add to Cart validates stock?** Yes, server-side.
10. **Cart update validates stock?** Yes, server-side.
11. **Cart merge validates stock?** Yes — clamps to available, drops unavailable lines.
12. **Checkout validates stock again?** Yes — reservation at order creation revalidates.
13. **When is inventory deducted?** Stock is reserved atomically in the order-creation transaction; reserved becomes deducted on successful payment; released on cancel/refund/expiry.
14. **Concurrent final-unit purchase?** Safe — guarded atomic `$inc` (reserve fails if insufficient); no negative stock possible. Direct concurrency test missing (P2).
15. **Payment failure leaves stock deducted?** No — reservation is released on failure/cancel/refund.
16. **Cancellation restores inventory?** Yes.
17. **Inventory per product, SKU, or variant?** Per product+warehouse (SKU string recorded on the inventory record; product `variations[]` are display-only — no variant-level stock tracking exists).
18. **Frontend supports the backend model?** Yes — frontend relies on binary availability + server enforcement; it never assumes product-level stock quantities.
19. **Stale inventory handled safely?** Yes — TanStack Query refetch + server rejection with mapped error; safe by server authority.
20. **Prices server-authoritative?** Yes.
21. **Cart totals server-authoritative?** Yes — computed at checkout from server data.
22. **Missing frontend functionality?** None functional; optional UX enhancements (low-stock hints, stock-derived stepper max) are P2/P3.
23. **Missing backend functionality?** None for the current single-warehouse, product-level model; variant-level inventory would be future design work (P2 note).
24. **Missing tests?** Concurrent final-unit purchase, payment-expiry release, stale-stock scenario integration (all P2).
25. **What should Phase 15 implement?** The three P2 tests, an optional seed production guard, and optionally stock-derived quantity ceilings if/when the API contract exposes availability counts.

## 28. Recommended Implementation Plan

1. Add a concurrent reservation test (two parallel order creations for the last unit → exactly one succeeds).
2. Add a direct payment-expiry reservation-release test.
3. Add a stale-stock scenario integration test (cart holds last unit; stock drops; checkout rejects; UI surfaces `INSUFFICIENT_STOCK`).
4. Add a NODE_ENV production guard to `npm run seed`.
5. Optional (P3): expose a coarse availability count for better QuantityStepper ceilings, preserving the no-exact-stock public-contract decision.

## 29. Phase 15 Definition of Done

- [ ] Concurrent double-buy test added and passing
- [ ] Payment-expiry release test added and passing
- [ ] Stale-stock scenario test added and passing
- [ ] Seed script production guard added
- [ ] All 253 backend + 148 storefront tests remain green
- [ ] No change to public API contracts or business behavior
- [ ] No P0/P1 gaps remain open

## 30. Final Verdict

**`PHASE 15 GAP ANALYSIS — NO CRITICAL PRODUCT/INVENTORY/CART GAPS`**

The Product → Inventory → Availability → Cart → Checkout → Deduction lifecycle is fully
implemented, server-authoritative, race-safe by construction, and tested. Remaining findings
are P2 test-coverage and operator-safety items and P3 UX enhancements.
