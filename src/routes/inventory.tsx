import { createFileRoute } from "@tanstack/react-router";
import { Download, Search, TrendingDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { AdminApiError } from "@/lib/api/client";
import { inventoryApi } from "@/lib/api/catalog";
import type { AdjustmentReason, InventoryDto, Warehouse } from "@/lib/api/types";
import { formatNpr } from "@/lib/utils";

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

function InventoryPage() {
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState("all");
  const [adjusting, setAdjusting] = useState<InventoryDto | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<AdjustmentReason>("received");

  const summary = inventoryApi.useSummary();
  const listQuery = inventoryApi.useList({
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(warehouse !== "all" ? { warehouse } : {}),
    pageSize: 100,
  });
  const adjust = inventoryApi.useAdjust();

  const rows = listQuery.data ?? [];
  const stats = summary?.data;

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const downloadTemplate = () => {
    const csv = ["sku,warehouse,delta,reason,note", "SKU-1001,Rotterdam DC,10,received,example row"].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock-adjustment-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <PageHeader
        title="Inventory"
        description="Stock positions across all distribution centres."
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Template
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Products" value={stats ? String(stats.totalProducts) : "—"} note="Tracked inventory records" />
        <StatCard label="In Stock" value={stats ? String(stats.inStock) : "—"} note="Above reorder level" />
        <StatCard label="Low Stock" value={stats ? String(stats.lowStock) : "—"} note="Needs replenishment" />
        <StatCard label="Out of Stock" value={stats ? String(stats.outOfStock) : "—"} note="Blocking sales" />
        <StatCard label="Inventory Value" value={stats ? formatNpr(stats.inventoryValue) : "—"} note="At cost price" />
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
              {listQuery.isPending ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading inventory…</td></tr>
              ) : listQuery.isError ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">Couldn't load inventory. Check your connection and try again.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No inventory records match the current filters.</td></tr>
              ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="max-w-64 px-4 py-2.5">
                    <p className="truncate font-medium">{p.productName ?? p.sku}</p>
                  </td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.sku}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{p.warehouse}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{p.stock}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.reserved}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.incoming}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{p.reorderLevel}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => { setAdjusting(p); setDelta(""); }}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="mt-4" title="Low-stock alerts" description="Automatically flagged at or below reorder level">
        {rows.filter((p) => p.stock <= p.reorderLevel).length === 0 ? (
          <EmptyState title="No low-stock items" description="Everything is above its reorder level." />
        ) : (
        <ul className="space-y-2.5">
          {rows.filter((p) => p.stock <= p.reorderLevel).slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-warning/12 text-warning">
                <TrendingDown className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.productName ?? p.sku}</p>
                <p className="num truncate text-xs text-muted-foreground">{p.sku} · {p.warehouse} · reorder at {p.reorderLevel}</p>
              </div>
              <span className="num text-sm font-semibold text-warning">{p.stock}</span>
            </li>
          ))}
        </ul>
        )}
      </Section>

      <Dialog open={adjusting !== null} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {adjusting ? `${adjusting.productName ?? adjusting.sku} — ${adjusting.warehouse} (current: ${adjusting.stock})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Delta (negative to reduce)</Label>
              <Input className="num h-9" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 10 or -5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as AdjustmentReason)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="writeOff">Write-off</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="allocation">Allocation</SelectItem>
                  <SelectItem value="manual">Manual correction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={adjust.isPending || !delta || Number.isNaN(Number(delta))}
              onClick={() => {
                if (!adjusting) return;
                act(
                  () =>
                    adjust
                      .mutateAsync({
                        sku: adjusting.sku,
                        warehouse: adjusting.warehouse as Warehouse,
                        delta: Number(delta),
                        reason,
                      })
                      .then(() => setAdjusting(null)),
                  "Stock adjustment applied",
                );
              }}
            >
              Apply adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
