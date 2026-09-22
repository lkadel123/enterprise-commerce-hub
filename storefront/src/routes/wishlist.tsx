import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { IconButton } from "@/components/common/IconButton";
import { Price } from "@/components/common/Price";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { apiErrorMessage } from "@/lib/api/client";
import { AddToCartButton } from "@/features/cart/AddToCartButton";
import { mediaUrl } from "@/lib/media";
import { pageHead } from "@/lib/seo";
import {
  useRemoveFromWishlistMutation,
  useWishlistQuery,
} from "@/features/wishlist/wishlist-hooks";

/**
 * Customer wishlist (server-only, authenticated).
 *
 * Protected by `AuthGuard`. Shows a responsive grid of saved products with
 * server pricing, stock state, quick add-to-cart, and remove. Empty, loading
 * and error/retry states are provided.
 */
export const Route = createFileRoute("/wishlist")({
  head: () => {
    const base = pageHead({
      title: "Wishlist — NASB",
      description: "Your saved products.",
      path: "/wishlist",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: WishlistPage,
});

function WishlistContent() {
  const wishlist = useWishlistQuery();
  const remove = useRemoveFromWishlistMutation();

  if (wishlist.isPending) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <LoadingSkeleton count={4} card />
      </section>
    );
  }

  if (wishlist.isError || !wishlist.data) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <ErrorState
          error={wishlist.error}
          title="Unable to load your wishlist"
          onRetry={() => void wishlist.refetch()}
        />
      </section>
    );
  }

  const items = wishlist.data.items;

  if (items.length === 0) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="Your wishlist is empty"
          description="Save products you'd like to keep an eye on by tapping the heart on any product."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      </section>
    );
  }

  const removeItem = (productId: string) => {
    remove.mutate(productId, {
      onSuccess: () => toast.success("Removed from wishlist"),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display">Wishlist</h1>
        <span className="text-sm text-muted-foreground">{items.length} saved</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const image = mediaUrl(item.image);
          return (
            <article
              key={item.productId}
              className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
            >
              <Link to="/products/$slug" params={{ slug: item.slug }} className="block">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {image ? (
                    <img
                      src={image}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                  {!item.inStock ? (
                    <Badge className="absolute left-3 top-3" variant="destructive">
                      Out of stock
                    </Badge>
                  ) : null}
                </div>
              </Link>

              <div className="flex flex-col gap-2 p-4">
                <Link
                  to="/products/$slug"
                  params={{ slug: item.slug }}
                  className="line-clamp-2 font-medium text-foreground hover:text-primary"
                >
                  {item.name}
                </Link>
                <Price value={item.price} />
                <div className="mt-1 flex items-center gap-2 border-t pt-3">
                  <AddToCartButton
                    productId={item.productId}
                    availableStock={item.inStock ? 999 : 0}
                    disabled={!item.inStock}
                    className="flex-1"
                  />
                  <IconButton
                    icon={<Trash2 className="h-4 w-4" />}
                    aria-label={`Remove ${item.name} from wishlist`}
                    onClick={() => removeItem(item.productId)}
                    disabled={remove.isPending}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WishlistPage() {
  return (
    <AuthGuard>
      <WishlistContent />
    </AuthGuard>
  );
}
