import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categories, coupons, currency } from "@/lib/mock-data";

export const Route = createFileRoute("/coupons")({
  head: () => ({
    meta: [
      { title: "Coupons & Promotions — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Create percentage, fixed and free-shipping promotions with usage limits and eligibility rules.",
      },
      { property: "og:title", content: "Coupons & Promotions — Northpeak" },
      { property: "og:description", content: "Promotion management with usage limits and scheduling." },
    ],
  }),
  component: CouponsPage,
});

function CouponsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Coupons & promotions"
        description="Discount campaigns running across storefronts and channels."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4" /> New coupon</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create coupon</DialogTitle>
                <DialogDescription>Define the discount, eligibility and validity window.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Coupon code</Label><Input className="num h-9" placeholder="AUTUMN20" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount type</Label>
                  <Select defaultValue="percentage">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage discount</SelectItem>
                      <SelectItem value="fixed">Fixed discount</SelectItem>
                      <SelectItem value="shipping">Free shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Discount value</Label><Input className="num h-9" placeholder="20" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Minimum order value</Label><Input className="num h-9" placeholder="100.00" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Maximum discount</Label><Input className="num h-9" placeholder="80.00" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Usage limit</Label><Input className="num h-9" placeholder="5000" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Per-customer limit</Label><Input className="num h-9" placeholder="1" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Applicable categories</Label>
                  <Select><SelectTrigger className="h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Start date</Label><Input type="date" className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs">End date</Label><Input type="date" className="h-9" /></div>
              </div>
              <DialogFooter>
                <Button size="sm" onClick={() => toast.success("Coupon created and scheduled")}>Create coupon</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Section bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5 text-right font-medium">Min. order</th>
                <th className="px-4 py-2.5 text-right font-medium">Max. discount</th>
                <th className="px-4 py-2.5 font-medium">Usage</th>
                <th className="px-4 py-2.5 font-medium">Valid</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="num px-4 py-3 font-semibold">{c.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.type}</td>
                  <td className="num px-4 py-3">{c.value}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{currency(c.min, 0)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{c.max ? currency(c.max, 0) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="w-36">
                      <p className="num text-xs text-muted-foreground">{c.used.toLocaleString()} / {c.limit.toLocaleString()}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.used / c.limit) * 100)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="num px-4 py-3 whitespace-nowrap text-muted-foreground">{c.start} → {c.end}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </AppShell>
  );
}
