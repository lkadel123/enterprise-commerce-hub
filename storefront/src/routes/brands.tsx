import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for `/brands/*`.
 *
 * `brands.tsx` is the TanStack Router parent for `brands.index.tsx` (the
 * `/brands` directory) and `brands.$slug.tsx` (a single brand's product
 * listing). It renders only an `<Outlet />` so the matched child route
 * mounts — exactly like the account shell (`account.tsx`).
 */
export const Route = createFileRoute("/brands")({
  component: () => <Outlet />,
});
