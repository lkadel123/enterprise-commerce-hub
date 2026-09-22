import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cartApi } from "@/lib/api/cart";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import type { AddToCartInput, MergeCartInput } from "@/types";

/**
 * TanStack Query hooks for the authenticated server cart.
 *
 * The server cart is fetched/persisted via `apiFetch`. All protected queries
 * are gated by `useCustomerAuthReady()` so they never fire before session
 * restoration completes (and never for unauthenticated guests). The guest
 * local cart is handled separately by `CartContext`/`guestCart.ts` — this
 * module never touches localStorage.
 */
export const cartKeys = {
  all: ["cart"] as const,
};

/** Authenticated server cart (auth-gated). Returns the unwrapped CartDto. */
export function useCartQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: cartKeys.all,
    queryFn: async () => (await cartApi.get()).data,
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Add an item to the server cart and invalidate the cart query. */
export function useAddToCartMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddToCartInput) => cartApi.add(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

/** Update a server cart item's quantity and invalidate the cart query. */
export function useUpdateCartItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      cartApi.updateQuantity(productId, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

/** Remove a server cart item and invalidate the cart query. */
export function useRemoveCartItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => cartApi.removeItem(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

/** Clear the server cart and invalidate the cart query. */
export function useClearCartMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cartApi.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

/**
 * Merge a local (guest) cart into the server cart and invalidate the query.
 *
 * Consumed by `CartContext` to run the guest → authenticated merge after a
 * successful login/register.
 */
export function useMergeCartMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: MergeCartInput["items"]) => cartApi.merge({ items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });
}
