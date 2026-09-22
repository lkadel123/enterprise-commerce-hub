import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for `/products/*`.
 *
 * `products.tsx` is the TanStack Router parent for `products.index.tsx`
 * (the `/products` catalog listing) and `products.$slug.tsx` (the product
 * detail page). It renders only an `<Outlet />` so the matched child route
 * mounts — exactly like the account shell (`account.tsx`).
 *
 * The listing's `validateSearch` intentionally lives on the index child, so
 * catalog search-param validation applies to `/products` only and never to
 * `/products/$slug` detail URLs.
 */
export const Route = createFileRoute("/products")({
  component: () => <Outlet />,
});
