import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hexagon, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Secure administrator sign-in for the Northpeak Commerce Console.",
      },
      { property: "og:title", content: "Sign In — Northpeak Commerce Console" },
      { property: "og:description", content: "Secure administrator access with two-factor authentication." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <Hexagon className="h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">Northpeak</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Commerce operations, under control.</h2>
          <p className="mt-3 text-sm opacity-80">
            Unified catalog, orders, inventory and analytics for enterprise retail teams operating across
            five regions and twelve storefronts.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs opacity-70">
          <ShieldCheck className="h-4 w-4" /> SOC 2 Type II · ISO 27001 · GDPR compliant
        </p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to the console</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Use your corporate credentials to continue.</p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Signed in as Amelia Whitfield");
              navigate({ to: "/" });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Work email</Label>
              <Input id="email" type="email" className="h-10" defaultValue="amelia.w@northpeak.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input id="password" type="password" className="h-10" defaultValue="password" />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox defaultChecked /> Remember this device
              </label>
              <button type="button" className="text-sm text-primary hover:underline">Forgot password?</button>
            </div>
            <Button type="submit" className="h-10 w-full">Sign in</Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Protected by two-factor authentication
          </p>
        </div>
      </section>
    </main>
  );
}
