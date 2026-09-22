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
 * Zod schema mirroring the backend `customerLoginSchema`
 * (see `backend/src/modules/customer-auth/customer-auth.validator.ts`).
 */
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  remember: z.boolean(),
});

interface LoginFormProps {
  /** Redirect target after successful login (validated externally). */
  redirect?: string;
}

export function LoginForm({ redirect }: LoginFormProps) {
  const { login, isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  // If already authenticated, redirect away from the login page.
  if (isAuthenticated) {
    const target = isSafeRedirect(redirect ?? "/account") ? (redirect ?? "/account") : "/account";
    return <Navigate to={target} replace />;
  }

  const friendlyError = (err: unknown): string => {
    if (err instanceof ApiClientError) {
      if (err.status === 401) return "Invalid email or password.";
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

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setServerError(null);
    try {
      const customer = await login({
        email: data.email,
        password: data.password,
        remember: data.remember,
      });
      toast.success(`Welcome back, ${customer.name}`);

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
            ["email", "password", "remember"],
            errors as Readonly<Record<string, unknown>>,
          );
        })}
        className="space-y-6"
        aria-describedby={serverError ? "login-error" : undefined}
      >
        <SocialLoginButtons redirect={redirect} />
        <SocialDivider />

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
                  autoComplete="current-password"
                  placeholder="• • • • • • • •"
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
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between">
              <FormLabel className="font-normal">Remember this device</FormLabel>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={form.formState.isSubmitting || isLoading}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {serverError ? (
          <p
            id="login-error"
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
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don’t have an account?{" "}
          <Link to="/register" className="text-primary underline underline-offset-2">
            Create account
          </Link>
        </p>
      </form>
    </Form>
  );
}
