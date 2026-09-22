import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hexagon, Lock, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { apiErrorMessage } from "@/lib/api/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Secure administrator sign-in for the Northpeak Commerce Console.",
      },
      { property: "og:title", content: "Sign In — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Secure administrator access to the commerce console.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { status, login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // If already authenticated (e.g. returning after session restore), skip to dashboard.
  useEffect(() => {
    if (status === "authenticated") {
      navigate({ to: "/", replace: true });
    }
  }, [status, navigate]);

  if (status === "authenticated") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    setLoading(true);
    setSubmitted(true);
    try {
      await login({ email, password, remember });
      toast.success("Signed in successfully.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? "Sign-in failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <Hexagon className="h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">Northpeak</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">
            Commerce operations, under control.
          </h2>
          <p className="mt-3 text-sm opacity-80">
            Unified catalog, orders, inventory and analytics for enterprise retail
            teams.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs opacity-70">
          <Lock className="h-4 w-4" /> Admin access controlled by role-based permissions
        </p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to the console</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your administrator credentials to continue.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {submitted && !loading && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Sign-in failed. Check your credentials and try again.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Work email</Label>
              <Input
                id="email"
                type="email"
                className="h-10"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                className="h-10"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} />
                Remember this device
              </label>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                disabled
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
