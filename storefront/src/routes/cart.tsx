import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Package, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { IconButton } from "@/components/common/IconButton";
import { Price } from "@/components/common/Price";
import { PageLoader } from "@/components/loading/PageLoader";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { apiErrorMessage } from "@/lib/api/client";
import { useCustomerAuth, useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import { useCart } from "@/lib/cart/CartContext";
import { mediaUrl } from "@/lib/media";
import { pageHead } from "@/lib/seo";
import {
  useCartQuery,
  useClearCartMutation,
  useRemoveCartItemMutation,
  useUpdateCartItemMutation,
} from "@/features/cart/cart-hooks";
import { QuantityStepper } from "@/features/cart/QuantityStepper";

export const Route = createFileRoute("/cart")({
  head: () => {
    const base = pageHead({
      title: "Cart — NASB",
      description: "Review your shopping cart.",
      path: "/cart",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: CartPage,
});

function CartPage() {
  const { isLoading } = useCustomerAuth();
  const authReady = useCustomerAuthReady();

  if (isLoading) {
    return <PageLoader label="Restoring session…" />;
  }

  return authReady ? <ServerCart /> : <GuestCart />;
}

/* ------------------------------- Guest cart ------------------------------ */

function GuestCart() {
  const { guestItems, removeGuestItem, clearGuestItems } = useCart();

  if (guestItems.length === 0) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShoppingCart className="h-10 w-10" />}
          title="Your cart is empty"
          description="Browse the catalog and add a few items to get started."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-display">Your Cart</h1>
      <p className="mt-1 text-muted-foreground">
        You're browsing as a guest. Sign in to merge your cart with your account and see saved
        prices, stock and totals.
      </p>

      <div className="mt-6 overflow-hidden rounded-md border">
        <ul className="divide-y">
          {guestItems.map((item) => (
            <li
              key={item.productId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">
                  Product <span className="text-muted-foreground">#{item.productId}</span>
                </p>
                <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <IconButton
                icon={<Trash2 className="h-4 w-4" />}
                aria-label={`Remove product ${item.productId} from cart`}
                onClick={() => removeGuestItem(item.productId)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={() => clearGuestItems()}>
          Clear cart
        </Button>
        <Button asChild>
          <Link to="/login">
            Sign in to save &amp; merge cart <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* --------------------------- Authenticated cart -------------------------- */

function ServerCart() {
  const cart = useCartQuery();
  const update = useUpdateCartItemMutation();
  const remove = useRemoveCartItemMutation();
  const clear = useClearCartMutation();

  const anyPending = update.isPending || remove.isPending || clear.isPending;

  if (cart.isPending) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <LoadingSkeleton count={3} className="rounded-md border p-4" />
      </section>
    );
  }

  if (cart.isError || !cart.data) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <ErrorState
          error={cart.error}
          title="Unable to load your cart"
          onRetry={() => void cart.refetch()}
        />
      </section>
    );
  }

  const items = cart.data.items;

  if (items.length === 0) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShoppingCart className="h-10 w-10" />}
          title="Your cart is empty"
          description="Browse the catalog and add a few items to get started."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      </section>
    );
  }

  const changeQuantity = (productId: string, quantity: number) => {
    update.mutate(
      { productId, quantity },
      {
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          void cart.refetch();
        },
      },
    );
  };

  const removeItem = (productId: string) => {
    remove.mutate(productId, {
      onSuccess: () => toast.success("Item removed from cart"),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  const clearCart = () => {
    clear.mutate(undefined, {
      onSuccess: () => toast.success("Cart cleared"),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display">Your Cart</h1>
        <Button variant="outline" onClick={clearCart} disabled={anyPending}>
          Clear cart
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border">
        <ul className="divide-y">
          {items.map((item) => {
            const image = mediaUrl(item.image);
            const maxQty = Math.max(1, item.availableStock);
            return (
              <li
                key={item.productId}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <Link to="/products/$slug" params={{ slug: item.slug }} className="block shrink-0">
                  {image ? (
                    <img
                      src={image}
                      alt={item.name}
                      className="h-20 w-20 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    to="/products/$slug"
                    params={{ slug: item.slug }}
                    className="line-clamp-2 font-medium text-foreground hover:text-primary"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <Price value={item.price} />
                    {item.availableStock <= 5 ? (
                      <span className="text-muted-foreground">
                        (Only {item.availableStock} left)
                      </span>
                    ) : null}
                  </div>
                </div>

                <QuantityStepper
                  value={item.quantity}
                  onChange={(next) => changeQuantity(item.productId, next)}
                  max={maxQty}
                  disabled={anyPending}
                  ariaLabel={`Quantity of ${item.name}`}
                />

                <IconButton
                  icon={<Trash2 className="h-4 w-4" />}
                  aria-label={`Remove ${item.name} from cart`}
                  onClick={() => removeItem(item.productId)}
                  disabled={anyPending}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-md text-sm text-muted-foreground">
          Prices, stock and the subtotal below are provided by the store and reflect the latest
          inventory at checkout.
        </p>
        <div className="w-full rounded-md border p-4 sm:w-72">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <Price value={cart.data.subtotal} className="text-lg" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Server-computed. Shipping and taxes are calculated at checkout.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to="/checkout">Proceed to Checkout</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
