import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Eye,
  Filter,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge, TablePagination, EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency, orders } from "@/lib/mock-data";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Search, filter and fulfil customer orders with bulk actions, payment status and refund workflows.",
      },
      { property: "og:title", content: "Orders — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Enterprise order management with filtering, bulk actions and refunds.",
      },
    ],
  }),
  component: OrdersPage,
});

const PAGE_SIZE = 10;

function OrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const q = query.trim().toLowerCase();
        const matchQ =
          !q ||
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.product.toLowerCase().includes(q);
        const matchS = status === "all" || o.status === status;
        const matchP = payment === "all" || o.payment === payment;
        return matchQ && matchS && matchP;
      }),
    [query, status, payment],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allChecked = current.length > 0 && current.every((o) => selected.includes(o.id));

  return (
    <AppShell>
      <PageHeader
        title="Orders"
        description={`${filtered.length} orders matching current filters`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Export queued — CSV will be emailed")}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" className="h-9">Create order</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ["All", orders.length],
          ["Pending", orders.filter((o) => o.status === "Pending").length],
          ["Processing", orders.filter((o) => o.status === "Processing").length],
          ["Shipped", orders.filter((o) => o.status === "Shipped").length],
          ["Delivered", orders.filter((o) => o.status === "Delivered").length],
          ["Refunded", orders.filter((o) => o.status === "Refunded").length],
        ].map(([label, count]) => (
          <button
            key={String(label)}
            onClick={() => {
              setStatus(label === "All" ? "all" : String(label));
              setPage(1);
            }}
            className={`card-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-muted ${
              status === (label === "All" ? "all" : label) ? "border-primary ring-1 ring-primary/30" : ""
            }`}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="num mt-0.5 text-lg font-semibold">{String(count)}</p>
          </button>
        ))}
      </div>

      <Section bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search order ID, customer or product..."
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[148px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Refunded"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={payment} onValueChange={(v) => { setPayment(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[168px]"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                {["Credit Card", "Digital Wallet", "Cash on Delivery", "Bank Transfer"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9">
              <Filter className="h-4 w-4" /> Date range
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
            <p className="num text-xs font-medium">{selected.length} selected</p>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => toast.success(`${selected.length} orders marked as shipped`)}>Mark shipped</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => toast.success("Invoices sent to printer queue")}>Print invoices</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setSelected([])}>Clear</Button>
            </div>
          </div>
        )}

        {current.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Try adjusting your search terms or clearing the status and payment filters."
            action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setStatus("all"); setPayment("all"); }}>Reset filters</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted/70 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) =>
                        setSelected(v ? current.map((o) => o.id) : [])
                      }
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Order ID</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((o) => (
                  <tr key={o.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={selected.includes(o.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, o.id] : s.filter((x) => x !== o.id)))
                        }
                        aria-label={`Select ${o.id}`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to="/orders/$orderId" params={{ orderId: o.id }} className="num font-medium text-primary hover:underline">
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="whitespace-nowrap">{o.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">{o.email}</p>
                    </td>
                    <td className="max-w-56 px-4 py-2.5">
                      <p className="truncate">{o.product}</p>
                      <p className="text-xs text-muted-foreground">{o.items} item(s)</p>
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{o.date}</td>
                    <td className="num px-4 py-2.5 text-right font-medium">{currency(o.amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="text-muted-foreground">{o.payment}</p>
                      <p className="text-xs text-muted-foreground">{o.paymentStatus}</p>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/orders/$orderId" params={{ orderId: o.id }}>
                              <Eye className="h-4 w-4" /> View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.success(`Invoice for ${o.id} sent to printer`)}>
                            <Printer className="h-4 w-4" /> Print invoice
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toast.success(`Refund initiated for ${o.id}`)}>
                            <RefreshCcw className="h-4 w-4" /> Refund
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => toast.error(`${o.id} cancelled`)}>
                            <XCircle className="h-4 w-4" /> Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination page={page} pageCount={pageCount} total={filtered.length} onPage={setPage} />
      </Section>
    </AppShell>
  );
}
