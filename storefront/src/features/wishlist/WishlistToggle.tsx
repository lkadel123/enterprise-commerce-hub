import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { IconButton } from "@/components/common/IconButton";
import { apiErrorMessage } from "@/lib/api/client";
import { isSafeRedirect, useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import {
  useAddToWishlistMutation,
  useRemoveFromWishlistMutation,
  useWishlistQuery,
} from "./wishlist-hooks";

export interface WishlistToggleProps {
  productId: string;
  className?: string;
}

/**
 * Accessible wishlist toggle (heart) for product detail/cards.
 *
 * - Server-only, auth-gated: no guest wishlist.
 * - Unauthenticated → routes to `/login?redirect=<current path>` (safe).
 * - Pending state disables the button; success/error announce via toast.
 */
export function WishlistToggle({ productId, className }: WishlistToggleProps) {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: wishlist, isLoading: wishlistLoading } = useWishlistQuery();
  const add = useAddToWishlistMutation();
  const remove = useRemoveFromWishlistMutation();

  const isSaved = wishlist?.items.some((item) => item.productId === productId) ?? false;
  const pending = add.isPending || remove.isPending;

  const handleToggle = () => {
    if (!isAuthenticated) {
      const redirect = isSafeRedirect(location.pathname) ? location.pathname : "/";
      void navigate({ to: "/login", search: { redirect } });
      return;
    }

    if (isSaved) {
      remove.mutate(productId, {
        onSuccess: () => toast.success("Removed from wishlist"),
        onError: (err) => toast.error(apiErrorMessage(err)),
      });
    } else {
      add.mutate(productId, {
        onSuccess: () => toast.success("Added to wishlist"),
        onError: (err) => toast.error(apiErrorMessage(err)),
      });
    }
  };

  return (
    <IconButton
      icon={
        <Heart
          className={`h-5 w-5 ${isSaved ? "fill-current text-primary" : ""}`}
          aria-hidden="true"
        />
      }
      aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={isSaved}
      onClick={handleToggle}
      disabled={isLoading || wishlistLoading || pending}
      variant={isSaved ? "secondary" : "ghost"}
      className={className}
    />
  );
}
