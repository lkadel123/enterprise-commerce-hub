import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { AdminApiError } from "@/lib/api/client";
import { categoriesApi } from "@/lib/api/catalog";
import { couponsQueryApi } from "@/lib/api/commerce";
import type { CouponDto, CouponType } from "@/lib/api/types";
import { formatNpr } from "@/lib/utils";

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

function couponValue(c: { type: CouponType; value: number }): string {
  if (c.type === "Percentage") return `${c.value}%`;
  if (c.type === "Fixed") return formatNpr(c.value);
  return "Free shipping";
}

function CouponsPage() {
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("Percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editType, setEditType] = useState<CouponType>("Percentage");
  const [editValue, setEditValue] = useState("");
  const [editMinOrder, setEditMinOrder] = useState("");
  const [editMaxDiscount, setEditMaxDiscount] = useState("");
  const [editUsageLimit, setEditUsageLimit] = useState("");
  const [editPerCustomerLimit, setEditPerCustomerLimit] = useState("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editEndAt, setEditEndAt] = useState("");
  const [deleting, setDeleting] = useState<CouponDto | null>(null);

  const couponsQuery = couponsQueryApi.useList({ pageSize: 100 });
  const createCoupon = couponsQueryApi.useCreate();
  const updateCoupon = couponsQueryApi.useUpdate();
  const removeCoupon = couponsQueryApi.useRemove();

  const rows = couponsQuery.data ?? [];

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const resetForm = () => {
    setCode(""); setValue(""); setMinOrder(""); setMaxDiscount("");
    setUsageLimit(""); setPerCustomerLimit(""); setStartAt(""); setEndAt("");
  };

  const submit = () => {
    if (!code.trim() || !startAt || !endAt) {
      toast.error("Code, start date and end date are required");
      return;
    }
    act(
      () =>
        createCoupon
          .mutateAsync({
            code: code.trim().toUpperCase(),
            type,
            value: type === "Free Shipping" ? 0 : Number(value) || 0,
            ...(minOrder ? { minOrder: Number(minOrder) } : {}),
            ...(maxDiscount ? { maxDiscount: Number(maxDiscount) } : {}),
            ...(usageLimit ? { usageLimit: Number(usageLimit) } : {}),
            ...(perCustomerLimit ? { perCustomerLimit: Number(perCustomerLimit) } : {}),
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
          })
          .then(() => {
            setCreateOpen(false);
            resetForm();
          }),
      "Coupon created and scheduled",
    );
  };

  const openEdit = (c: CouponDto) => {
    setEditingId(c.id);
    setEditCode(c.code);
    setEditType(c.type);
    setEditValue(c.value > 0 ? String(c.value) : "");
    setEditMinOrder(c.minOrder > 0 ? String(c.minOrder) : "");
    setEditMaxDiscount(c.maxDiscount > 0 ? String(c.maxDiscount) : "");
    setEditUsageLimit(c.usageLimit > 0 ? String(c.usageLimit) : "");
    setEditPerCustomerLimit(String(c.perCustomerLimit));
    setEditStartAt(c.startAt.slice(0, 10));
    setEditEndAt(c.endAt.slice(0, 10));
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (!editingId || !editCode.trim() || !editStartAt || !editEndAt) {
      toast.error("Code, start date and end date are required");
      return;
    }
    if (new Date(editEndAt).getTime() <= new Date(editStartAt).getTime()) {
      toast.error("End date must be after start date");
      return;
    }
    act(
      () =>
        updateCoupon
          .mutateAsync({
            id: editingId,
            code: editCode.trim().toUpperCase(),
            type: editType,
            value: editType === "Free Shipping" ? 0 : Number(editValue) || 0,
            ...(editMinOrder ? { minOrder: Number(editMinOrder) } : {}),
            ...(editMaxDiscount ? { maxDiscount: Number(editMaxDiscount) } : {}),
            ...(editUsageLimit ? { usageLimit: Number(editUsageLimit) } : {}),
            ...(editPerCustomerLimit ? { perCustomerLimit: Number(editPerCustomerLimit) } : {}),
            startAt: new Date(editStartAt).toISOString(),
            endAt: new Date(editEndAt).toISOString(),
          })
          .then(() => setEditOpen(false)),
      "Coupon updated",
    );
  };

  const submitDelete = () => {
    if (!deleting) return;
    act(
      () => removeCoupon.mutateAsync(deleting.id).then(() => setDeleting(null)),
      "Coupon deleted",
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Coupons & promotions"
        description="Discount campaigns running across storefronts and channels."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4" /> New coupon</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create coupon</DialogTitle>
                <DialogDescription>Define the discount, eligibility and validity window.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Coupon code</Label>
                  <Input className="num h-9" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AUTUMN20" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as CouponType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Percentage">Percentage discount</SelectItem>
                      <SelectItem value="Fixed">Fixed discount</SelectItem>
                      <SelectItem value="Free Shipping">Free shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {type !== "Free Shipping" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discount value</Label>
                    <Input className="num h-9" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "Percentage" ? "20" : "500"} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Minimum order value</Label>
                  <Input className="num h-9" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="100.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Maximum discount</Label>
                  <Input className="num h-9" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="80.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Usage limit</Label>
                  <Input className="num h-9" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="5000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Per-customer limit</Label>
                  <Input className="num h-9" value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(e.target.value)} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" className="h-9" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End date</Label>
                  <Input type="date" className="h-9" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button size="sm" disabled={createCoupon.isPending} onClick={submit}>Create coupon</Button>
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
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {couponsQuery.isPending ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading coupons…</td></tr>
              ) : couponsQuery.isError ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">Couldn't load coupons. Check your connection and try again.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No coupons yet. Create your first promotion.</td></tr>
              ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="num px-4 py-3 font-semibold">{c.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.type}</td>
                  <td className="num px-4 py-3">{couponValue(c)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{c.minOrder > 0 ? formatNpr(c.minOrder) : "—"}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{c.maxDiscount > 0 ? formatNpr(c.maxDiscount) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="w-36">
                      <p className="num text-xs text-muted-foreground">{c.used.toLocaleString()} / {c.usageLimit.toLocaleString()}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${c.usageLimit > 0 ? Math.min(100, (c.used / c.usageLimit) * 100) : 0}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="num px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(c.startAt).toLocaleDateString()} → {new Date(c.endAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive"
                      onClick={() => setDeleting(c)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit coupon</DialogTitle>
            <DialogDescription>Update the discount, eligibility and validity window.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Coupon code</Label>
              <Input className="num h-9" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="AUTUMN20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Discount type</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as CouponType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Percentage discount</SelectItem>
                  <SelectItem value="Fixed">Fixed discount</SelectItem>
                  <SelectItem value="Free Shipping">Free shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editType !== "Free Shipping" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Discount value</Label>
                <Input className="num h-9" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder={editType === "Percentage" ? "20" : "500"} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Minimum order value</Label>
              <Input className="num h-9" value={editMinOrder} onChange={(e) => setEditMinOrder(e.target.value)} placeholder="100.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Maximum discount</Label>
              <Input className="num h-9" value={editMaxDiscount} onChange={(e) => setEditMaxDiscount(e.target.value)} placeholder="80.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Usage limit</Label>
              <Input className="num h-9" value={editUsageLimit} onChange={(e) => setEditUsageLimit(e.target.value)} placeholder="5000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Per-customer limit</Label>
              <Input className="num h-9" value={editPerCustomerLimit} onChange={(e) => setEditPerCustomerLimit(e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" className="h-9" value={editStartAt} onChange={(e) => setEditStartAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" className="h-9" value={editEndAt} onChange={(e) => setEditEndAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" disabled={updateCoupon.isPending} onClick={submitEdit}>
              {updateCoupon.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete coupon</DialogTitle>
            <DialogDescription>
              Delete coupon “{deleting?.code}”? This cannot be undone. Past redemptions are kept for
              order history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="destructive"
              disabled={removeCoupon.isPending}
              onClick={submitDelete}
            >
              {removeCoupon.isPending ? "Deleting…" : "Delete coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
