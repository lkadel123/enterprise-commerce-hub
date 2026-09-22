import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import { pageHead } from "@/lib/seo";

/**
 * Search params carried by the emailed reset link:
 * `/reset-password?requestId=<64-hex>&token=<one-time>`.
 *
 * The backend builds the link in `customer-auth.service.ts` as
 * `${env.PUBLIC_BASE_URL}/reset-password?requestId=…&token=…`, so both params
 * are expected together. A partial/malformed pair falls back to request mode
 * rather than failing hard (the user can simply request a fresh link).
 */
const resetSearchSchema = z.object({
  requestId: z.string().regex(/^[0-9a-f]{64}$/i).optional().catch(undefined),
  token: z.string().min(1).max(256).optional().catch(undefined),
});

/**
 * Customer password-reset page.
 *
 * - `noindex` (auth pages must not be indexed).
 * - With a valid `requestId`+`token` pair from the emailed link: sets a new
 *   password (the raw token exists ONLY in the emailed link — never logged,
 *   never returned by the API).
 * - Without params: request-mode form (send a reset email).
 */
export const Route = createFileRoute("/reset-password")({
  validateSearch: resetSearchSchema,
  head: () => {
    const base = pageHead({
      title: "Reset your password — NASB",
      description: "Set a new password for your account.",
      path: "/reset-password",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { requestId, token } = useSearch({ from: Route.id });

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 py-20 sm:py-28 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-display">
          {requestId && token ? "Choose a new password" : "Reset your password"}
        </h1>

        <div className="mt-8">
          <ResetPasswordForm
            {...(requestId && token ? { requestId, token } : {})}
          />
        </div>
      </div>
    </section>
  );
}
