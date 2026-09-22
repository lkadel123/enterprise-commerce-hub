import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { LoginForm } from "@/features/auth/LoginForm";
import { pageHead } from "@/lib/seo";
import { isSafeRedirect } from "@/lib/auth/CustomerAuthContext";

/** Search params accepted by the login route. */
interface LoginSearch {
  redirect?: string | undefined;
}

/** Parse + validate the `redirect` search param (rejects open-redirects). */
function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  const redirect = search["redirect"];
  if (typeof redirect !== "string") return {};
  return isSafeRedirect(redirect) ? { redirect } : {};
}

/**
 * Customer sign-in page.
 *
 * - `noindex` (auth pages must not be indexed).
 * - Reads the validated `redirect` search param and passes it to `LoginForm`
 *   so the user lands on their original destination after authenticating.
 * - Authenticated users are redirected away by `LoginForm` itself.
 */
export const Route = createFileRoute("/login")({
  validateSearch: validateLoginSearch,
  head: () => {
    const base = pageHead({
      title: "Sign in — NASB",
      description: "Sign in to your account.",
      path: "/login",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = useSearch({ from: Route.id });

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 py-20 sm:py-28 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-display">Sign in to your account</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary underline underline-offset-2">
            Create one
          </Link>
        </p>

        <div className="mt-8">
          <LoginForm {...(redirect ? { redirect } : {})} />
        </div>
      </div>
    </section>
  );
}
