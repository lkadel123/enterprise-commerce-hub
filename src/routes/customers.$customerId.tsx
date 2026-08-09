import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Heart, Mail, MapPin, Phone, Star } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { currency, customers, orders, products, reviews } from "@/lib/mock-data";

export const Route = createFileRoute("/customers/$customerId")({
  loader: ({ params }) => {
    const customer = customers.find((c) => c.id === params.customerId);
    if (!customer) throw notFound();
    return { customer };
  },
  head: ({ params }) => ({
    meta: [
      { title: `Customer ${params.customerId} — Northpeak Commerce Console` },
      {
        name: "description",
        content: `Profile, order history, spend and activity for customer ${params.customerId}.`,
      },
      { property: "og:title", content: `Customer ${params.customerId} — Northpeak` },
      { property: "og:description", content: "Customer profile with orders, reviews and lifetime value." },
    ],
  }),
  component: CustomerDetail,
});

function CustomerDetail() {
  const { customer } = Route.useLoaderData();
  const history = orders.slice(0, 6);

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/customers"><ArrowLeft className="h-4 w-4" /> Back to customers</Link>
      </Button>

      <PageHeader
        title={customer.name}
        description={`${customer.id} · joined ${customer.joined} · ${customer.group} group`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9"><Mail className="h-4 w-4" /> Email</Button>
            <Button size="sm" className="h-9">Create order</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Section>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {customer.name.split(" ").map((n: string) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">{customer.name}</p>
                <StatusBadge status={customer.status} />
              </div>
            </div>
            <Separator className="my-4" />
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{customer.email}</span></li>
              <li className="num flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 shrink-0" />{customer.phone}</li>
              <li className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />248 Harrison Street, {customer.city}</li>
            </ul>
          </Section>

          <Section title="Lifetime value">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Total spent", currency(customer.spent)],
                ["Orders", String(customer.orders)],
                ["Avg. order", currency(customer.spent / customer.orders)],
                ["Last order", customer.lastOrder],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border bg-surface-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="num mt-0.5 font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Internal notes">
            <Textarea rows={4} placeholder="Add a note visible only to your team..." />
            <Button size="sm" className="mt-3 h-8">Save note</Button>
          </Section>
        </div>

        <div className="xl:col-span-2">
          <Section bodyClassName="p-0">
            <Tabs defaultValue="orders">
              <div className="border-b px-4 pt-3">
                <TabsList className="h-9">
                  <TabsTrigger value="orders" className="text-xs">Order history</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
                  <TabsTrigger value="reviews" className="text-xs">Reviews</TabsTrigger>
                  <TabsTrigger value="wishlist" className="text-xs">Wishlist</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="orders" className="m-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted/60 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Order</th>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Items</th>
                        <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((o) => (
                        <tr key={o.id} className="border-t hover:bg-surface-muted/50">
                          <td className="px-4 py-2.5">
                            <Link to="/orders/$orderId" params={{ orderId: o.id }} className="num font-medium text-primary hover:underline">{o.id}</Link>
                          </td>
                          <td className="num px-4 py-2.5 text-muted-foreground">{o.date}</td>
                          <td className="num px-4 py-2.5">{o.items}</td>
                          <td className="num px-4 py-2.5 text-right font-medium">{currency(o.amount)}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="m-0 p-4">
                <ol className="relative space-y-4 pl-5">
                  <span className="absolute top-1 bottom-1 left-[5px] w-px bg-border" />
                  {[
                    ["Placed order ORD-10284", "Today, 09:14"],
                    ["Added Aurora 27\" 4K Monitor to wishlist", "Yesterday, 18:02"],
                    ["Updated shipping address", "3 days ago"],
                    ["Redeemed coupon SUMMER25", "1 week ago"],
                  ].map(([label, time]) => (
                    <li key={label} className="relative">
                      <span className="absolute -left-5 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-surface" />
                      <p className="text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{time}</p>
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="reviews" className="m-0 divide-y">
                {reviews.slice(0, 3).map((r) => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="num inline-flex items-center gap-1 text-sm font-medium">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />{r.rating}.0
                      </span>
                      <p className="truncate text-sm font-medium">{r.product}</p>
                      <span className="ml-auto"><StatusBadge status={r.status} /></span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{r.body}</p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="wishlist" className="m-0 divide-y">
                {products.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                      <Heart className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="num truncate text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <p className="num text-sm font-medium">{currency(p.price)}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
