import { createFileRoute } from "@tanstack/react-router";
import { Download, PackageSearch, Search, TrendingDown, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency, products } from "@/lib/mock-data";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Track stock levels, reserved units, incoming shipments and reorder thresholds by warehouse.",
      },
      { property: "og:title", content: "Inventory — Northpeak Commerce Console" },
      { property: "og:description", content: "Warehouse-level inventory control with low-stock alerts." },
    ],
  }),
  component: InventoryPage,
});

function stockStatus(stock: number, reorder: number) {
  if (stock === 0) return "Out of Stock";
  if (stock <= reorder) return "Low Stock";
  return "In Stock";
}

function InventoryPage() {
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState("all");

  const rows = products.filter(
    (p) =>
      (p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase())) &&
      (warehouse === "all" || p.warehouse === warehouse),
  );

  const inStock = products.filter((p) => p.stock > p.reorder).length;
  const low = products.filter((p) => p.stock > 0 && p.stock <= p.reorder).length;
  const out = products.filter((p) => p.stock === 0).length;
  const value = products.reduce((s, p) => s + p.stock * p.cost, 0);

  return (
    <AppShell>
      <PageHeader
        title="Inventory"
        description="Stock positions across all distribution centres."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Stock template downloaded")}>
              <Download className="h-4 w-4" /> Template
            </Button>
            <Button size="sm" className="h-9" onClick={() => toast.success("Bulk stock update applied")}>
              <Upload className="h-4 w-4" /> Bulk update
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Products" value={String(products.length)} delta={2.4} note="Active catalog items" />
        <StatCard label="In Stock" value={String(inStock)} delta={1.8} note="Above reorder level" />
        <StatCard label="Low Stock" value={String(low)} delta={-4.2} note="Needs replenishment" />
        <StatCard label="Out of Stock" value={String(out)} delta={-1.1} note="Blocking sales" />
        <StatCard label="Inventory Value" value={currency(value, 0)} delta={6.3} note="At cost price" />
      </div>

      <Section className="mt-4" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product or SKU..." className="h-9 pl-9" />
          </div>
          <Select value={warehouse} onValueChange={setWarehouse}>
            <SelectTrigger className="h-9 w-[176px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              <SelectItem value="Rotterdam DC">Rotterdam DC</SelectItem>
              <SelectItem value="Newark DC">Newark DC</SelectItem>
              <SelectItem value="Singapore DC">Singapore DC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Warehouse</th>
                <th className="px-4 py-2.5 text-right font-medium">Available</th>
                <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
                <th className="px-4 py-2.5 text-right font-medium">Incoming</th>
                <th className="px-4 py-2.5 text-right font-medium">Reorder level</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Adjust</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="max-w-64 px-4 py-2.5">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.brand}</p>
                  </td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.sku}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{p.warehouse}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{p.stock}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.reserved}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.incoming}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.reorder}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={stockStatus(p.stock, p.reorder)} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success(`Stock adjustment logged for ${p.sku}`)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Low-stock alerts" description="Automatically flagged at or below reorder level">
          <ul className="space-y-2.5">
            {products.filter((p) => p.stock <= p.reorder).slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-warning/12 text-warning">
                  <TrendingDown className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="num truncate text-xs text-muted-foreground">{p.sku} · reorder at {p.reorder}</p>
                </div>
                <span className="num text-sm font-semibold text-warning">{p.stock}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Recent inventory history" description="Adjustments recorded in the last 48 hours">
          <ul className="space-y-3">
            {[
              ["SKU-1052", "+120 units received", "Rotterdam DC", "2 hrs ago"],
              ["SKU-1024", "-14 units damaged write-off", "Newark DC", "5 hrs ago"],
              ["SKU-1108", "+60 units transferred in", "Singapore DC", "Yesterday"],
              ["SKU-1080", "-38 units allocated to orders", "Rotterdam DC", "Yesterday"],
            ].map(([sku, desc, wh, time]) => (
              <li key={String(sku) + String(time)} className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                  <PackageSearch className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm"><span className="num font-medium">{sku}</span> — {desc}</p>
                  <p className="text-xs text-muted-foreground">{wh} · {time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
