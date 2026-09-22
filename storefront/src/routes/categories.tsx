import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for `/categories/*`.
 *
 * `categories.tsx` is the TanStack Router parent for `categories.index.tsx`
 * (the `/categories` directory) and `categories.$slug.tsx` (a single
 * category's product listing). It renders only an `<Outlet />` so the
 * matched child route mounts — exactly like the account shell
 * (`account.tsx`). Without an outlet here, navigating to
 * `/categories/$slug` would change the URL while the directory page kept
 * rendering.
 */
export const Route = createFileRoute("/categories")({
  component: () => <Outlet />,
});
