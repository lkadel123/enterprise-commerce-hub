import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Configure store profile, payments, shipping, taxes, notifications and security policies.",
      },
      { property: "og:title", content: "Settings — Northpeak Commerce Console" },
      { property: "og:description", content: "Enterprise store configuration and security policies." },
    ],
  }),
  component: SettingsPage,
});

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SettingsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Store configuration, commerce policies and platform security."
        actions={<Button size="sm" className="h-9" onClick={() => toast.success("Settings saved")}>Save changes</Button>}
      />

      <Tabs defaultValue="store">
        <TabsList className="mb-4 h-9 flex-wrap">
          {["store", "payments", "shipping", "tax", "notifications", "security"].map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="store" className="m-0">
          <Section title="Store profile" description="Public identity used across storefront and invoices.">
            <div className="divide-y">
              <Row label="Store name"><Input className="h-9" defaultValue="Northpeak Commerce" /></Row>
              <Row label="Support email"><Input className="h-9" defaultValue="support@northpeak.com" /></Row>
              <Row label="Store description" hint="Shown in search results and social previews">
                <Textarea rows={3} defaultValue="Premium multi-category retail across North America and Europe." />
              </Row>
              <Row label="Default currency">
                <Select defaultValue="usd">
                  <SelectTrigger className="h-9 sm:w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD — US Dollar</SelectItem>
                    <SelectItem value="eur">EUR — Euro</SelectItem>
                    <SelectItem value="gbp">GBP — British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Timezone">
                <Select defaultValue="utc">
                  <SelectTrigger className="h-9 sm:w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">America/New_York</SelectItem>
                    <SelectItem value="cet">Europe/Amsterdam</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Maintenance mode" hint="Temporarily disable the storefront"><Switch /></Row>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="payments" className="m-0">
          <Section title="Payment gateways" description="Enabled providers and settlement behaviour.">
            <div className="divide-y">
              {["Stripe", "PayPal", "Adyen", "Cash on delivery"].map((p, i) => (
                <Row key={p} label={p} hint={i === 3 ? "Available for selected regions only" : "Card and wallet processing"}>
                  <Switch defaultChecked={i < 2} />
                </Row>
              ))}
              <Row label="Auto-capture payments" hint="Capture funds immediately on authorization"><Switch defaultChecked /></Row>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="shipping" className="m-0">
          <Section title="Shipping zones" description="Rates applied at checkout.">
            <div className="divide-y">
              <Row label="Free shipping threshold"><Input className="num h-9 sm:w-[220px]" defaultValue="60.00" /></Row>
              <Row label="Standard rate"><Input className="num h-9 sm:w-[220px]" defaultValue="5.99" /></Row>
              <Row label="Express rate"><Input className="num h-9 sm:w-[220px]" defaultValue="14.99" /></Row>
              <Row label="International shipping"><Switch defaultChecked /></Row>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="tax" className="m-0">
          <Section title="Tax configuration" description="Rates and inclusive pricing rules.">
            <div className="divide-y">
              <Row label="Prices include tax"><Switch /></Row>
              <Row label="Default tax rate"><Input className="num h-9 sm:w-[220px]" defaultValue="8.25" /></Row>
              <Row label="EU VAT registration"><Input className="num h-9 sm:w-[220px]" defaultValue="NL8241 9932 B01" /></Row>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="notifications" className="m-0">
          <Section title="Notification preferences" description="Where operational alerts are delivered.">
            <div className="divide-y">
              {["New order email", "Low stock alerts", "Refund requests", "Daily sales digest", "Review moderation"].map((n, i) => (
                <Row key={n} label={n}><Switch defaultChecked={i !== 4} /></Row>
              ))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="security" className="m-0">
          <Section title="Security policies" description="Account protection for all admin users.">
            <div className="divide-y">
              <Row label="Require two-factor authentication"><Switch defaultChecked /></Row>
              <Row label="Session timeout (minutes)"><Input className="num h-9 sm:w-[220px]" defaultValue="30" /></Row>
              <Row label="IP allowlist" hint="Comma separated CIDR ranges"><Input className="num h-9" defaultValue="10.44.0.0/16, 192.168.14.0/24" /></Row>
              <Row label="Password rotation" hint="Force reset every 90 days"><Switch defaultChecked /></Row>
            </div>
            <Separator className="my-4" />
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("All other sessions revoked")}>
              Revoke all other sessions
            </Button>
          </Section>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
