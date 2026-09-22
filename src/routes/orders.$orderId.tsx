import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MapPin,
  Package,
  Printer,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AdminApiError } from "@/lib/api/client";
import { ordersApi } from "@/lib/api/commerce";
import { formatNpr } from "@/lib/utils";

export const Route = createFileRoute("/orders/$orderId")({
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.orderId} — Northpeak Commerce Console` },
      {
        name: "description",
        content: `Full fulfilment detail, payment record and timeline for order ${params.orderId}.`,
      },
      { property: "og:title", content: `Order ${params.orderId} — Northpeak` },
      {
        property: "og:description",
        content: "Order detail with items, totals, payment and fulfilment timeline.",
      },
    ],
  }),
  component: OrderDetail,
});

const NEXT_STATUS: Record<string, string | undefined> = {
  Pending: "Processing",
  Processing: "Shipped",
  Shipped: "Delivered",
};

function OrderDetail() {
  const { orderId } = Route.useParams();
  const orderQuery = ordersApi.useDetail(orderId);
  const refund = ordersApi.useRefund();
  const updateStatus = ordersApi.useUpdateStatus();

  const order = orderQuery.data?.data;
  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  if (orderQuery.isPending) {
    return (
      <AppShell>
        <div className="h-40 animate-pulse rounded-md bg-surface-muted" />
      </AppShell>
    );
  }
  if (orderQuery.isError || !order) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">Couldn't load this order. It may not exist or you may lack permission.</p>
      </AppShell>
    );
  }

  const nextStatus = NEXT_STATUS[order.status];

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/orders"><ArrowLeft className="h-4 w-4" /> Back to orders</Link>
      </Button>

      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`Placed on ${new Date(order.createdAt).toLocaleString()} · ${order.items.length} line item(s) · ${order.region}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print invoice
            </Button>
            <Button
              variant="outline" size="sm" className="h-9"
              disabled={refund.isPending || order.payment.status !== "Paid"}
              onClick={() => act(() => refund.mutateAsync({ id: order.id }), "Refund requested")}
            >
              <RefreshCcw className="h-4 w-4" /> Refund
            </Button>
            {nextStatus && (
              <Button
                size="sm" className="h-9"
                disabled={updateStatus.isPending}
                onClick={() => act(() => updateStatus.mutateAsync({ id: order.id, status: nextStatus }), `Order marked ${nextStatus}`)}
              >
                Mark {nextStatus}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-surface p-4">
          <p className="text-label">Order status</p>
          <div className="mt-2"><StatusBadge status={order.status} /></div>
        </div>
        <div className="card-surface p-4">
          <p className="text-label">Payment status</p>
          <div className="mt-2"><StatusBadge status={order.payment.status} /></div>
        </div>
        <div className="card-surface p-4">
          <p className="text-label">Fulfilment</p>
          <div className="mt-2">
            <StatusBadge status={order.status === "Delivered" ? "Delivered" : "Processing"} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Section title="Items" description="Products included in this order" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.sku} className="border-t">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{it.name}</p>
                            <p className="num truncate text-xs text-muted-foreground">{it.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-muted-foreground">{it.sku}</td>
                      <td className="num px-4 py-3 text-right">{it.qty}</td>
                      <td className="num px-4 py-3 text-right">{formatNpr(it.unitPrice)}</td>
                      <td className="num px-4 py-3 text-right font-medium">{formatNpr(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Order timeline" description="Fulfilment history with timestamps">
            <ol className="relative space-y-5 pl-6">
              <span className="absolute top-1 bottom-1 left-[11px] w-px bg-border" />
              {order.timeline.map((t) => (
                <li key={t.label} className="relative">
                  <span
                    className={`absolute -left-6 grid h-6 w-6 place-items-center rounded-full border ${
                      t.done ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="num text-xs text-muted-foreground">{new Date(t.at).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Order summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="num">{formatNpr(order.amounts.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="num">-{formatNpr(order.amounts.discount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="num">{formatNpr(order.amounts.shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="num">{formatNpr(order.amounts.tax)}</dd></div>
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="num">{formatNpr(order.amounts.total)}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Customer">
            <p className="text-sm font-medium">{order.customer?.name ?? "Guest"}</p>
            <p className="text-sm text-muted-foreground">{order.email}</p>
            {order.customer && (
              <p className="num mt-1 text-xs text-muted-foreground">Customer ID: {order.customer.id}</p>
            )}
            <Separator className="my-3" />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Shipping address</p>
                <p className="mt-1 text-muted-foreground">
                  {order.addresses.shipping
                    ? [order.addresses.shipping.line1, order.addresses.shipping.line2, order.addresses.shipping.city, order.addresses.shipping.state, order.addresses.shipping.postalCode, order.addresses.shipping.country].filter(Boolean).join(", ")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-label">Billing address</p>
                <p className="mt-1 text-muted-foreground">
                  {order.addresses.billing
                    ? [order.addresses.billing.line1, order.addresses.billing.city, order.addresses.billing.country].filter(Boolean).join(", ")
                    : "Same as shipping address"}
                </p>
              </div>
            </div>
          </Section>

          <Section title="Payment">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Method</dt><dd>{order.payment.method}</dd></div>
              {order.payment.provider ? (
                <div className="flex justify-between"><dt className="text-muted-foreground">Provider</dt><dd>{order.payment.provider}</dd></div>
              ) : null}
              {order.payment.transactionId ? (
                <div className="flex justify-between"><dt className="text-muted-foreground">Transaction ID</dt><dd className="num">{order.payment.transactionId}</dd></div>
              ) : null}
              {order.payment.amount !== undefined ? (
                <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="num">{formatNpr(order.payment.amount)}</dd></div>
              ) : null}
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={order.payment.status} /></dd></div>
            </dl>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
