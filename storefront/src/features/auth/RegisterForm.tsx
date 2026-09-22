import { useState } from "react";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ApiClientError } from "@/lib/api/client";
import { useCustomerAuth, isSafeRedirect } from "@/lib/auth/CustomerAuthContext";
import { focusFirstFieldInForm } from "@/lib/focus-field-error";
import { SocialDivider, SocialLoginButtons } from "./SocialLoginButtons";

/**
 * Zod schema mirroring the backend `customerRegisterSchema`
 * (see `backend/src/modules/customer-auth/customer-auth.validator.ts`).
 */
const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(254, "Email is too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  // Mirrors the backend `z.literal(true)` in `customerRegisterSchema` — only an
  // explicit acceptance passes; missing/false/other values are rejected.
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message:
        "Please agree to the Terms & Conditions and Privacy Policy to create your account.",
    }),
  }),
});

interface RegisterFormProps {
  /** Redirect target after successful registration (validated externally). */
  redirect?: string;
}

export function RegisterForm({ redirect }: RegisterFormProps) {
  const { register, isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      // Unchecked by default — acceptance must be an explicit user action.
      acceptedTerms: false as unknown as true,
    },
  });

  if (isAuthenticated) {
    const target = isSafeRedirect(redirect ?? "/account") ? (redirect ?? "/account") : "/account";
    return <Navigate to={target} replace />;
  }

  const friendlyError = (err: unknown): string => {
    if (err instanceof ApiClientError) {
      if (err.status === 409) return "An account with this email already exists. Sign in instead.";
      if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
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

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    setServerError(null);
    try {
      const customer = await register({
        name: data.name,
        email: data.email,
        password: data.password,
        acceptedTerms: true,
      });
      toast.success(`Welcome, ${customer.name}! Your account has been created.`);

      const target = isSafeRedirect(redirect ?? "/account") ? (redirect ?? "/account") : "/account";
      navigate({ to: target });
    } catch (err) {
      const message = friendlyError(err);
      setServerError(message);
      toast.error(message);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (errors) => {
          // Phase 10, WCAG 2.4.3: move focus to the first invalid field after a
          // failed submit (purely additive; never runs during typing).
          focusFirstFieldInForm(
            ["name", "email", "password", "acceptedTerms"],
            errors as Readonly<Record<string, unknown>>,
          );
          // The Radix checkbox renders as a button (not a form element), so
          // focus it explicitly when it is the first invalid control.
          if (errors.acceptedTerms && !(errors.name || errors.email || errors.password)) {
            form.setFocus("acceptedTerms");
          }
        })}
        className="space-y-6"
        aria-describedby={serverError ? "register-error" : undefined}
      >
        <SocialLoginButtons redirect={redirect} />
        <SocialDivider />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  disabled={form.formState.isSubmitting || isLoading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="name@example.com"
                  disabled={form.formState.isSubmitting || isLoading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  disabled={form.formState.isSubmitting || isLoading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="acceptedTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0">
              <FormControl>
                <Checkbox
                  ref={field.ref}
                  name={field.name}
                  checked={Boolean(field.value)}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  onBlur={field.onBlur}
                  disabled={form.formState.isSubmitting || isLoading}
                  aria-labelledby="register-terms-label"
                  className="mt-0.5"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                {/* The Radix checkbox renders as a button (not a labelable form
                    element), so a native <label> cannot associate with it. The
                    text below names the checkbox via aria-labelledby, and the
                    click handler mirrors label behaviour without hijacking
                    clicks on the legal links. */}
                <span
                  id="register-terms-label"
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    field.onChange(!field.value);
                  }}
                  className="cursor-pointer text-sm font-normal leading-5"
                >
                  I agree to the{" "}
                  <Link
                    to="/terms"
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    Terms &amp; Conditions
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
                <FormMessage role="alert" />
              </div>
            </FormItem>
          )}
        />

        {serverError ? (
          <p
            id="register-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting || isLoading}
        >
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
