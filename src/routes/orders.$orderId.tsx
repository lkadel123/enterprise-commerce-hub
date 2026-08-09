import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { currency, orders, products } from "@/lib/mock-data";

export const Route = createFileRoute("/orders/$orderId")({
  loader: ({ params }) => {
    const order = orders.find((o) => o.id === params.orderId);
    if (!order) throw notFound();
    return { order };
  },
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

function OrderDetail() {
  const { order } = Route.useLoaderData();
  const lines = products.slice(0, order.items + 1);
  const subtotal = lines.reduce((s, p) => s + p.price, 0);
  const discount = Math.round(subtotal * 0.08 * 100) / 100;
  const shipping = 12.5;
  const tax = Math.round((subtotal - discount) * 0.075 * 100) / 100;
  const total = Math.round((subtotal - discount + shipping + tax) * 100) / 100;

  const timeline = [
    { label: "Order placed", time: `${order.date} 09:14`, icon: Package, done: true },
    { label: "Payment confirmed", time: `${order.date} 09:16`, icon: CreditCard, done: order.paymentStatus === "Paid" },
    { label: "Processing", time: `${order.date} 11:02`, icon: RefreshCcw, done: order.status !== "Pending" },
    { label: "Shipped", time: `${order.date} 17:48`, icon: Truck, done: ["Shipped", "Delivered"].includes(order.status) },
    { label: "Delivered", time: order.status === "Delivered" ? `${order.date} — 2 days later` : "Pending", icon: CheckCircle2, done: order.status === "Delivered" },
  ];

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/orders"><ArrowLeft className="h-4 w-4" /> Back to orders</Link>
      </Button>

      <PageHeader
        title={`Order ${order.id}`}
        description={`Placed on ${order.date} · ${order.items} item(s) · ${order.region}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9"><Printer className="h-4 w-4" /> Print invoice</Button>
            <Button variant="outline" size="sm" className="h-9"><RefreshCcw className="h-4 w-4" /> Refund</Button>
            <Button size="sm" className="h-9">Update fulfilment</Button>
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
          <div className="mt-2"><StatusBadge status={order.paymentStatus} /></div>
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
                  {lines.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{p.brand} · {p.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-muted-foreground">{p.sku}</td>
                      <td className="num px-4 py-3 text-right">1</td>
                      <td className="num px-4 py-3 text-right">{currency(p.price)}</td>
                      <td className="num px-4 py-3 text-right font-medium">{currency(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Order timeline" description="Fulfilment history with timestamps">
            <ol className="relative space-y-5 pl-6">
              <span className="absolute top-1 bottom-1 left-[11px] w-px bg-border" />
              {timeline.map((t) => (
                <li key={t.label} className="relative">
                  <span
                    className={`absolute -left-6 grid h-6 w-6 place-items-center rounded-full border ${
                      t.done ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="num text-xs text-muted-foreground">{t.time}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Order summary">
            <dl className="space-y-2 text-sm">
              {[
                ["Subtotal", currency(subtotal)],
                ["Discount", `-${currency(discount)}`],
                ["Shipping", currency(shipping)],
                ["Tax (7.5%)", currency(tax)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="num">{currency(total)}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Customer">
            <p className="text-sm font-medium">{order.customer}</p>
            <p className="text-sm text-muted-foreground">{order.email}</p>
            <p className="num text-sm text-muted-foreground">+1 (415) 208-4412</p>
            <p className="num mt-1 text-xs text-muted-foreground">Customer ID: CUST-4821</p>
            <Separator className="my-3" />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Shipping address</p>
                <p className="mt-1 text-muted-foreground">248 Harrison Street, Suite 12<br />San Francisco, CA 94105<br />United States</p>
              </div>
              <div>
                <p className="text-label">Billing address</p>
                <p className="mt-1 text-muted-foreground">Same as shipping address</p>
              </div>
            </div>
          </Section>

          <Section title="Payment">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Method</dt><dd>{order.payment}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Transaction ID</dt><dd className="num">TXN-{order.id.slice(-5)}-88</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={order.paymentStatus} /></dd></div>
            </dl>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
