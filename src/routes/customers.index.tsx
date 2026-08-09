import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Mail, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatCard, StatusBadge, TablePagination } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency, customers } from "@/lib/mock-data";

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Segment customers by lifetime value, order frequency, group and status.",
      },
      { property: "og:title", content: "Customers — Northpeak Commerce Console" },
      { property: "og:description", content: "Customer directory with spend, orders and segmentation." },
    ],
  }),
  component: CustomersPage,
});

const PAGE_SIZE = 10;

function CustomersPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          (c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.email.toLowerCase().includes(query.toLowerCase())) &&
          (group === "all" || c.group === group),
      ),
    [query, group],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalSpend = customers.reduce((s, c) => s + c.spent, 0);

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        description="24,892 registered shoppers across all storefronts."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Customer export queued")}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" className="h-9"><Mail className="h-4 w-4" /> Email segment</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Customers" value="24,892" delta={14.2} note="612 new this period" />
        <StatCard label="Returning Rate" value="38.4%" delta={3.1} note="Repeat purchase within 90 days" />
        <StatCard label="Lifetime Value" value={currency(totalSpend / customers.length, 0)} delta={7.4} note="Average per customer" />
        <StatCard label="Churn Risk" value="1,204" delta={-2.6} note="No order in 120 days" />
      </div>

      <Section className="mt-4" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name or email..." className="h-9 pl-9" />
          </div>
          <Select value={group} onValueChange={(v) => { setGroup(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[168px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              <SelectItem value="Retail">Retail</SelectItem>
              <SelectItem value="Loyalty">Loyalty</SelectItem>
              <SelectItem value="Wholesale">Wholesale</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                <th className="px-4 py-2.5 text-right font-medium">Total spent</th>
                <th className="px-4 py-2.5 text-right font-medium">AOV</th>
                <th className="px-4 py-2.5 font-medium">Last order</th>
                <th className="px-4 py-2.5 font-medium">Group</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {current.map((c) => (
                <tr key={c.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link to="/customers/$customerId" params={{ customerId: c.id }} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-surface-muted text-xs">
                          {c.name.split(" ").map((n: string) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-primary hover:underline">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.phone}</td>
                  <td className="num px-4 py-2.5 text-right">{c.orders}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{currency(c.spent)}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{currency(c.spent / c.orders)}</td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.lastOrder}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.group}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TablePagination page={page} pageCount={pageCount} total={filtered.length} onPage={setPage} />
      </Section>
    </AppShell>
  );
}
