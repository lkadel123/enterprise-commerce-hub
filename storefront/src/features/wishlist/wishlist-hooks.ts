import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { wishlistApi } from "@/lib/api/wishlist";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";

/**
 * TanStack Query hooks for the authenticated (server-only) wishlist.
 *
 * All protected queries are gated by `useCustomerAuthReady()` so they never
 * fire before session restoration completes and never for guests (there is no
 * guest wishlist). Mutations invalidate the shared list so a single list query
 * keeps the UI consistent instead of one request per product.
 */
export const wishlistKeys = {
  all: ["wishlist"] as const,
};

/** Authenticated wishlist (auth-gated). Returns the unwrapped WishlistDto. */
export function useWishlistQuery() {
  const enabled = useCustomerAuthReady();
  return useQuery({
    queryKey: wishlistKeys.all,
    queryFn: async () => (await wishlistApi.list()).data,
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Add a product to the wishlist and invalidate the list. */
export function useAddToWishlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => wishlistApi.add(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wishlistKeys.all }),
  });
}

/** Remove a product from the wishlist and invalidate the list. */
export function useRemoveFromWishlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => wishlistApi.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wishlistKeys.all }),
  });
}
