import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section, StatusBadge, TablePagination } from "@/components/kit";
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
import { brands, categories, currency, products } from "@/lib/mock-data";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Products — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Manage your catalog: pricing, stock, brands, categories and product status with bulk actions.",
      },
      { property: "og:title", content: "Products — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Enterprise catalog management with advanced filters and bulk operations.",
      },
    ],
  }),
  component: ProductsPage,
});

const PAGE_SIZE = 10;

function ProductsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const q = query.trim().toLowerCase();
        return (
          (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
          (category === "all" || p.category === category) &&
          (brand === "all" || p.brand === brand) &&
          (status === "all" || p.status === status)
        );
      }),
    [query, category, brand, status],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allChecked = current.length > 0 && current.every((p) => selected.includes(p.id));

  return (
    <AppShell>
      <PageHeader
        title="Products"
        description={`${products.length} products across ${categories.length} categories`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={() => toast.success("Catalog export started")}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link to="/products/new"><Plus className="h-4 w-4" /> Add product</Link>
            </Button>
          </>
        }
      />

      <Section bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search products or SKUs..."
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[152px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={brand} onValueChange={(v) => { setBrand(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[144px]"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[144px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Active", "Draft", "Out of Stock", "Archived"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
            <p className="num text-xs font-medium">{selected.length} selected</p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => toast.success("Products archived")}>Archive</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => toast.success("Price update applied")}>Update price</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setSelected([])}>Clear</Button>
            </div>
          </div>
        )}

        {current.length === 0 ? (
          <EmptyState title="No products match" description="Adjust your filters or add a new product to the catalog." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox checked={allChecked} onCheckedChange={(v) => setSelected(v ? current.map((p) => p.id) : [])} aria-label="Select all" />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Brand</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Rating</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((p) => (
                  <tr key={p.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(v) => setSelected((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                        <p className="max-w-56 truncate font-medium">{p.name}</p>
                      </div>
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.category}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.brand}</td>
                    <td className="num px-4 py-2.5 text-right font-medium">{currency(p.price)}</td>
                    <td className="num px-4 py-2.5 text-right">
                      <span className={p.stock < 40 ? "font-medium text-warning" : ""}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5">
                      <span className="num inline-flex items-center gap-1 whitespace-nowrap">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {p.rating}
                        <span className="text-xs text-muted-foreground">({p.reviews})</span>
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.created}</td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Eye className="h-4 w-4" /> View</DropdownMenuItem>
                          <DropdownMenuItem asChild><Link to="/products/new"><Pencil className="h-4 w-4" /> Edit</Link></DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.success(`${p.name} duplicated`)}><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toast.success(`${p.name} archived`)}><Archive className="h-4 w-4" /> Archive</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => toast.error(`${p.name} deleted`)}>
                            <Trash2 className="h-4 w-4" /> Delete
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
