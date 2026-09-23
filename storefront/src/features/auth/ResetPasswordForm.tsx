import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api/client";
import { customerAuthApi } from "@/lib/api/customer-client";

/**
 * Zod schemas mirroring the backend `customerForgotPasswordSchema` and
 * `customerResetPasswordSchema`
 * (see `backend/src/modules/customer-auth/customer-auth.validator.ts`).
 */
const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254, "Email is too long"),
});

const confirmSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

interface ResetPasswordFormProps {
  /**
   * One-time reset coordinates from the emailed link (`requestId` + `token`).
   * When both are present the form sets a new password; when absent the form
   * requests a reset email instead.
   */
  requestId?: string;
  token?: string;
}

/**
 * Customer password-reset form.
 *
 * Two modes driven by the emailed link (`/reset-password?requestId=…&token=…`):
 *
 * 1. **Request mode** (no params) — asks for the account email and calls
 *    `POST /auth/customer/forgot-password`. The response is deliberately
 *    account-existence-neutral, and the success message must stay neutral too
 *    (never reveal whether an address is registered).
 * 2. **Confirm mode** (both params) — sets a new password via
 *    `POST /auth/customer/reset-password`, which server-side validates the
 *    requestId+token pair (hashed, single-use) and revokes existing sessions.
 *    A 401 here means the link is invalid, expired, or already used.
 *
 * A 503 from the backend means SMTP delivery is not configured — surfaced as
 * "temporarily unavailable", never as a pretended success.
 */
export function ResetPasswordForm({ requestId, token }: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const hasLinkParams = Boolean(requestId && token);

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: "" },
  });

  const confirmForm = useForm<z.infer<typeof confirmSchema>>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const friendlyError = (err: unknown): string => {
    if (err instanceof ApiClientError) {
      if (err.status === 503) {
        return "Password reset is temporarily unavailable. Please try again later.";
      }
      if (err.status === 401) {
        return "This reset link is invalid, expired, or has already been used. Request a new one below.";
      }
      if (err.status === 429) {
        return "Too many attempts. Please wait a moment and try again.";
      }
      if (err.status === 422 && err.details) {
        const fieldErrors = err.details
          .filter((d): d is typeof d & { path: string } => Boolean(d.path))
          .map((d) => `${d.path}: ${d.message}`)
          .join("; ");
        return fieldErrors || err.message;
      }
      return err.message;
    }
    return "Unable to reach the server. Please try again.";
  };

  const onRequestSubmit = async (data: z.infer<typeof requestSchema>) => {
    setServerError(null);
    try {
      await customerAuthApi.forgotPassword({ email: data.email });
      // Neutral by design: identical wording whether or not the account exists.
      setEmailSent(true);
    } catch (err) {
      setServerError(friendlyError(err));
    }
  };

  const onConfirmSubmit = async (data: z.infer<typeof confirmSchema>) => {
    setServerError(null);
    try {
      await customerAuthApi.resetPassword({
        requestId: requestId ?? "",
        token: token ?? "",
        newPassword: data.newPassword,
      });
      setResetDone(true);
      toast.success("Password updated. Please sign in with your new password.");
    } catch (err) {
      setServerError(friendlyError(err));
    }
  };

  // ------------------------------------------------------------------ success
  if (resetDone) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Password updated</h2>
        <p className="text-sm text-muted-foreground">
          Your password has been changed and previous sessions were signed out.
        </p>
        <Button className="h-11 w-full" onClick={() => navigate({ to: "/login" })}>
          Sign in
        </Button>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          If that email is registered, a password reset link has been sent. The link expires after
          one use and a limited time.
        </p>
        <Button
          variant="outline"
          className="h-11 w-full"
          onClick={() => navigate({ to: "/login" })}
        >
          Back to sign in
        </Button>
      </div>
    );
  }
  // -------------------------------------------------------------- confirm mode
  if (hasLinkParams) {
    return (
      <Form {...confirmForm}>
        <form onSubmit={confirmForm.handleSubmit(onConfirmSubmit)} className="space-y-4" noValidate>
          <FormField
            control={confirmForm.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    disabled={confirmForm.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={confirmForm.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    disabled={confirmForm.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {serverError ? (
            <p
              id="reset-password-error"
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={confirmForm.formState.isSubmitting}
          >
            {confirmForm.formState.isSubmitting ? "Updating password…" : "Update password"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/reset-password" className="text-primary underline underline-offset-2">
              Request a new reset link
            </Link>
          </p>
        </form>
      </Form>
    );
  }

  // -------------------------------------------------------------- request mode
  return (
    <Form {...requestForm}>
      <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">
          Enter the email address on your account and we&apos;ll send a one-time password reset
          link.
        </p>

        <FormField
          control={requestForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  disabled={requestForm.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError ? (
          <p
            id="reset-password-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="h-11 w-full" disabled={requestForm.formState.isSubmitting}>
          {requestForm.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
