import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api/client";
import { useCustomerAuth, useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import { useCartQuery, useMergeCartMutation } from "@/features/cart/cart-hooks";
import {
  type GuestCartItem,
  addGuestCartItem,
  clearGuestCart,
  readGuestCart,
  removeGuestCartItem,
  updateGuestCartQuantity,
} from "./guestCart";

/**
 * Lightweight guest-cart context.
 *
 * Owns ONLY the guest (anonymous) local cart: a list of `{ productId,
 * quantity }` persisted in `localStorage`. It never holds server pricing,
 * subtotals, inventory or a server `CartDto` — the authenticated server cart
 * is managed by TanStack Query (`cart-hooks`). This keeps the guest layer
 * intentionally small and avoids becoming a second global server-state store.
 *
 * The provider also orchestrates the guest → authenticated merge: after a
 * real login/register (not ordinary session restoration) it reads the local
 * cart, calls `POST /cart/merge`, clears local storage only on success, and
 * invalidates the server cart query. A failed merge keeps the local cart so
 * nothing is silently lost.
 */
interface CartContextValue {
  guestItems: GuestCartItem[];
  /** Sum of guest quantities (used for the header badge). */
  guestCount: number;
  /** True once the guest cart has been read from localStorage (client-side). */
  hydrated: boolean;
  addGuestItem: (productId: string, quantity?: number) => void;
  updateGuestQuantity: (productId: string, quantity: number) => void;
  removeGuestItem: (productId: string) => void;
  clearGuestItems: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [guestItems, setGuestItems] = useState<GuestCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef<GuestCartItem[]>([]);

  const { isAuthenticated, isLoading } = useCustomerAuth();
  const mergeMutation = useMergeCartMutation();

  // Keep a stable reference to the current `mutate` so the auth-watch effect
  // doesn't re-run when the mutation object identity changes.
  const mergeMutateRef = useRef(mergeMutation.mutate);
  mergeMutateRef.current = mergeMutation.mutate;

  // Hydrate the guest cart from localStorage once, client-side only.
  useEffect(() => {
    const items = readGuestCart();
    itemsRef.current = items;
    setGuestItems(items);
    setHydrated(true);
  }, []);

  const mergeMutate = mergeMutateRef.current;

  /**
   * Guest → authenticated merge after a real login/register.
   *
   * We wait for the initial auth restore to resolve (`initializedRef`), then
   * only merge on a *subsequent* transition to authenticated (i.e. an explicit
   * login/register), never during restoration and never repeatedly.
   */
  const initializedRef = useRef(false);
  const mergeRanRef = useRef(false);
  const mergingRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      mergeRanRef.current = false;
      return;
    }

    if (!isAuthenticated) {
      // Signed out — allow a future merge on the next login.
      mergeRanRef.current = false;
      return;
    }

    if (mergeRanRef.current || mergingRef.current) return;

    const items = itemsRef.current;
    if (items.length === 0) return;

    mergeRanRef.current = true;
    mergingRef.current = true;
    mergeMutate(
      items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      {
        onSuccess: () => {
          // Merge succeeded — now safe to clear the local cart.
          clearGuestCart();
          itemsRef.current = [];
          setGuestItems([]);
        },
        onError: (err) => {
          // Keep the local cart intact; auth remains successful.
          toast.error(apiErrorMessage(err));
        },
        onSettled: () => {
          mergingRef.current = false;
        },
      },
    );
  }, [isAuthenticated, isLoading, mergeMutate]);

  const addGuestItem = useCallback((productId: string, quantity = 1) => {
    const next = addGuestCartItem(productId, quantity);
    itemsRef.current = next;
    setGuestItems(next);
  }, []);

  const updateGuestQuantity = useCallback((productId: string, quantity: number) => {
    const next = updateGuestCartQuantity(productId, quantity);
    itemsRef.current = next;
    setGuestItems(next);
  }, []);

  const removeGuestItem = useCallback((productId: string) => {
    const next = removeGuestCartItem(productId);
    itemsRef.current = next;
    setGuestItems(next);
  }, []);

  const clearGuestItems = useCallback(() => {
    clearGuestCart();
    itemsRef.current = [];
    setGuestItems([]);
  }, []);

  const guestCount = useMemo(
    () => guestItems.reduce((sum, item) => sum + item.quantity, 0),
    [guestItems],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      guestItems,
      guestCount,
      hydrated,
      addGuestItem,
      updateGuestQuantity,
      removeGuestItem,
      clearGuestItems,
    }),
    [
      guestItems,
      guestCount,
      hydrated,
      addGuestItem,
      updateGuestQuantity,
      removeGuestItem,
      clearGuestItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within <CartProvider>");
  }
  return ctx;
}

/**
 * Cart count for header/mobile badges.
 *
 * - Authenticated → server cart `itemCount` (TanStack Query, auth-gated).
 * - Guest        → local guest quantity, only once hydrated (SSR-safe).
 * - While auth is loading → 0 (avoids a flash / hydration mismatch).
 */
export function useCartCount(): number {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const cart = useCartQuery();
  const { guestCount, hydrated } = useCart();

  if (isLoading) return 0;
  if (isAuthenticated) return cart.data?.itemCount ?? 0;
  return hydrated ? guestCount : 0;
}

// Convenience re-export so consumers have a single cart import surface.
export { useCustomerAuthReady };
