import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useState } from "react";
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
import { customersApi } from "@/lib/api/commerce";
import type { CustomerDto } from "@/lib/api/types";
import { formatNpr } from "@/lib/utils";

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

function customersToCsv(rows: CustomerDto[]): string {
  const header = ["Name", "Email", "Phone", "Group", "Status", "Orders", "Total spent", "AOV", "Joined"];
  const lines = rows.map((c) =>
    [c.name, c.email, c.phone ?? "", c.group, c.status, c.orders, c.spent, c.aov, c.joinedAt]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function CustomersPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);

  const params = {
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(group !== "all" ? { group } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const customersQuery = useQuery({
    queryKey: ["admin", "customers", params],
    queryFn: () => customersApi.list(params),
  });

  const rows = customersQuery.data?.data ?? [];
  const meta = customersQuery.data?.meta;
  const total = meta?.total ?? 0;
  const pageCount = meta?.totalPages ?? 1;

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info("No customers on this page to export");
      return;
    }
    const csv = customersToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded for the current page");
  };

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        description={`${total.toLocaleString()} registered customers matching current filters`}
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export page CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Customers" value={total.toLocaleString()} note="Matching current filters" />
        <StatCard label="Page Results" value={String(rows.length)} note={`Page ${page} of ${pageCount}`} />
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
              {customersQuery.isPending ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading customers…</td></tr>
              ) : customersQuery.isError ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">Couldn't load customers. Check your connection and try again.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No customers match the current filters.</td></tr>
              ) : (
              rows.map((c) => (
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
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-right">{c.orders}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{formatNpr(c.spent)}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{formatNpr(c.aov)}</td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.group}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {new Date(c.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
      </Section>
    </AppShell>
  );
}
