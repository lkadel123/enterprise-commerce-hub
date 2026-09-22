export interface GuestCartItem {
  productId: string;
  quantity: number;
}

/** Single storage key, kept centralized here. */
export const GUEST_CART_STORAGE_KEY = "commerce-hub:guest-cart";

/** Quantity bounds mirrored from the backend cart validator / MAX_QUANTITY. */
export const GUEST_CART_MIN_QUANTITY = 1;
export const GUEST_CART_MAX_QUANTITY = 999;

interface StoredGuestCart {
  items?: unknown;
}

/** True only on the client (browser). Guards every browser API access. */
function isClient(): boolean {
  return typeof window !== "undefined";
}

/** Normalize a single raw entry; returns null if it cannot be trusted. */
function normalizeEntry(entry: unknown): GuestCartItem | null {
  if (entry === null || typeof entry !== "object") return null;
  const { productId, quantity } = entry as Record<string, unknown>;
  if (typeof productId !== "string" || productId.trim() === "") return null;
  const numericQty = Number(quantity);
  if (!Number.isFinite(numericQty)) return null;
  const clamped = Math.min(
    GUEST_CART_MAX_QUANTITY,
    Math.max(GUEST_CART_MIN_QUANTITY, Math.trunc(numericQty)),
  );
  return { productId, quantity: clamped };
}

/**
 * Read and validate the guest cart from localStorage.
 *
 * Returns a deduplicated, clamped list. Malformed/corrupted data is safely
 * ignored (never throws) — the caller is free to recover gracefully.
 */
export function readGuestCart(): GuestCartItem[] {
  if (!isClient()) return [];

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: StoredGuestCart;
  try {
    parsed = JSON.parse(raw) as StoredGuestCart;
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    return [];
  }

  const seen = new Set<string>();
  const items: GuestCartItem[] = [];
  for (const entry of parsed.items) {
    const normalized = normalizeEntry(entry);
    if (!normalized || seen.has(normalized.productId)) continue;
    seen.add(normalized.productId);
    items.push(normalized);
  }
  return items;
}

/**
 * Persist a guest cart to localStorage (client-only).
 *
 * Merges duplicate product ids by summing quantities (capped at the backend
 * max) and clamps every quantity into the valid range before writing.
 */
export function writeGuestCart(items: GuestCartItem[]): void {
  if (!isClient()) return;

  const merged = new Map<string, number>();
  for (const item of items) {
    const qty =
      Number.isFinite(item.quantity) && item.quantity >= GUEST_CART_MIN_QUANTITY
        ? Math.trunc(item.quantity)
        : GUEST_CART_MIN_QUANTITY;
    const capped = Math.min(GUEST_CART_MAX_QUANTITY, qty);
    merged.set(
      item.productId,
      Math.min(GUEST_CART_MAX_QUANTITY, (merged.get(item.productId) ?? 0) + capped),
    );
  }

  const stored: GuestCartItem[] = Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
  try {
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({ items: stored }));
  } catch {
    // Storage may be unavailable (private mode / quota) — fail silently.
  }
}

/** Remove the guest cart from localStorage (client-only). */
export function clearGuestCart(): void {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/** Add (or bump) a product in the local cart, returning the new list. */
export function addGuestCartItem(productId: string, quantity = 1): GuestCartItem[] {
  const items = readGuestCart();
  const qty = Math.min(
    GUEST_CART_MAX_QUANTITY,
    Math.max(GUEST_CART_MIN_QUANTITY, Math.trunc(quantity) || GUEST_CART_MIN_QUANTITY),
  );
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity = Math.min(GUEST_CART_MAX_QUANTITY, existing.quantity + qty);
  } else {
    items.push({ productId, quantity: qty });
  }
  writeGuestCart(items);
  return items;
}

/** Set an exact quantity for a product in the local cart, returning the new list. */
export function updateGuestCartQuantity(productId: string, quantity: number): GuestCartItem[] {
  const items = readGuestCart();
  const clamped = Math.min(
    GUEST_CART_MAX_QUANTITY,
    Math.max(GUEST_CART_MIN_QUANTITY, Math.trunc(quantity) || GUEST_CART_MIN_QUANTITY),
  );
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity = clamped;
    writeGuestCart(items);
  }
  return items;
}

/** Remove a product from the local cart, returning the new list. */
export function removeGuestCartItem(productId: string): GuestCartItem[] {
  const items = readGuestCart().filter((i) => i.productId !== productId);
  writeGuestCart(items);
  return items;
}
