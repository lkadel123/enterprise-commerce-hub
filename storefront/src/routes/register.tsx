import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { RegisterForm } from "@/features/auth/RegisterForm";
import { pageHead } from "@/lib/seo";
import { isSafeRedirect } from "@/lib/auth/CustomerAuthContext";

/** Search params accepted by the register route. */
interface RegisterSearch {
  redirect?: string | undefined;
}

/** Parse + validate the `redirect` search param (rejects open-redirects). */
function validateRegisterSearch(search: Record<string, unknown>): RegisterSearch {
  const redirect = search["redirect"];
  if (typeof redirect !== "string") return {};
  return isSafeRedirect(redirect) ? { redirect } : {};
}

/**
 * Customer registration page.
 *
 * - `noindex` (auth pages must not be indexed).
 * - Reads the validated `redirect` search param and passes it to
 *   `RegisterForm` so the user lands on their original destination after
 *   account creation.
 * - Authenticated users are redirected away by `RegisterForm` itself.
 */
export const Route = createFileRoute("/register")({
  validateSearch: validateRegisterSearch,
  head: () => {
    const base = pageHead({
      title: "Create account — NASB",
      description: "Create a new account to start shopping.",
      path: "/register",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect } = useSearch({ from: Route.id });

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 py-20 sm:py-28 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-display">Create your account</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>

        <div className="mt-8">
          <RegisterForm {...(redirect ? { redirect } : {})} />
        </div>
      </div>
    </section>
  );
}
