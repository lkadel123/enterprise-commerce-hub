import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { customersApi } from "@/lib/api/commerce";
import { formatNpr } from "@/lib/utils";

export const Route = createFileRoute("/customers/$customerId")({
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
  const { customerId } = Route.useParams();
  const customerQuery = useQuery({
    queryKey: ["admin", "customers", customerId],
    queryFn: () => customersApi.getById(customerId),
  });

  if (customerQuery.isPending) {
    return (
      <AppShell>
        <div className="h-40 animate-pulse rounded-md bg-surface-muted" />
      </AppShell>
    );
  }
  if (customerQuery.isError || !customerQuery.data?.data) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">Couldn't load this customer. They may not exist or you may lack permission.</p>
      </AppShell>
    );
  }

  const customer = customerQuery.data.data;
  const history = customer.recentOrders ?? [];

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 h-8">
        <Link to="/customers"><ArrowLeft className="h-4 w-4" /> Back to customers</Link>
      </Button>

      <PageHeader
        title={customer.name}
        description={`${customer.id} · joined ${new Date(customer.joinedAt).toLocaleDateString()} · ${customer.group} group`}
        actions={
          <a href={`mailto:${customer.email}`}>
            <Button variant="outline" size="sm" className="h-9"><Mail className="h-4 w-4" /> Email</Button>
          </a>
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
              <li className="num flex items-center gap-2 text-muted-foreground">{customer.phone ?? "—"}</li>
              {customer.city && <li className="flex items-start gap-2 text-muted-foreground">{customer.city}</li>}
            </ul>
          </Section>

          <Section title="Lifetime value">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-surface-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Total spent</dt>
                <dd className="num mt-0.5 font-semibold">{formatNpr(customer.spent)}</dd>
              </div>
              <div className="rounded-md border bg-surface-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Orders</dt>
                <dd className="num mt-0.5 font-semibold">{customer.orders}</dd>
              </div>
              <div className="rounded-md border bg-surface-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Avg. order</dt>
                <dd className="num mt-0.5 font-semibold">{formatNpr(customer.aov)}</dd>
              </div>
              <div className="rounded-md border bg-surface-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Last order</dt>
                <dd className="num mt-0.5 font-semibold">{customer.lastOrder ? new Date(customer.lastOrder).toLocaleDateString() : "—"}</dd>
              </div>
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
                      {history.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No orders yet.</td></tr>
                      ) : (
                      history.map((o) => (
                        <tr key={o.id} className="border-t hover:bg-surface-muted/50">
                          <td className="px-4 py-2.5">
                            <Link to="/orders/$orderId" params={{ orderId: o.id }} className="num font-medium text-primary hover:underline">{o.orderNumber}</Link>
                          </td>
                          <td className="num px-4 py-2.5 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
                          <td className="num px-4 py-2.5">{o.items.reduce((n, it) => n + it.qty, 0)}</td>
                          <td className="num px-4 py-2.5 text-right font-medium">{formatNpr(o.amounts.total)}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                        </tr>
                      ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
