import { useCallback } from "react";

import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import { useCart } from "@/lib/cart/CartContext";
import { useAddToCartMutation } from "./cart-hooks";
import type { AddToCartInput } from "@/types";

/**
 * Add a product to the cart, branching by auth state:
 *
 * - Authenticated → server mutation (`POST /cart/items`), then the cart query
 *   is invalidated (TanStack Query).
 * - Guest        → local `localStorage` guest cart (no server call).
 *
 * Only `productId` + `quantity` are ever sent/stored — never financial data.
 */
export function useAddToCart() {
  const authReady = useCustomerAuthReady();
  const { addGuestItem } = useCart();
  const addMutation = useAddToCartMutation();

  const add = useCallback(
    async (input: AddToCartInput) => {
      if (authReady) {
        await addMutation.mutateAsync(input);
      } else {
        addGuestItem(input.productId, input.quantity ?? 1);
      }
    },
    [authReady, addMutation, addGuestItem],
  );

  return {
    add,
    isPending: addMutation.isPending,
    isError: addMutation.isError,
    error: addMutation.error,
  };
}
