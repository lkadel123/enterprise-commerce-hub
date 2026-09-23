import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Download,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
import { AdminApiError } from "@/lib/api/client";
import { brandsApi, categoriesApi, productsApi } from "@/lib/api/catalog";
import { formatNpr } from "@/lib/utils";
import type { ProductDto } from "@/lib/api/types";

export const Route = createFileRoute("/products/")({
  head: () => ({
    meta: [
      { title: "Products — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Manage your catalog: pricing, stock, brands, categories and product status with bulk actions.",
      },
    ],
  }),
  component: ProductsPage,
});

const PAGE_SIZE = 10;

function productsToCsv(rows: ProductDto[]): string {
  const header = ["name", "sku", "category", "brand", "price", "stock", "status", "createdAt"];
  const lines = rows.map((p) =>
    [
      p.name,
      p.sku,
      p.category?.name ?? "",
      p.brand?.name ?? "",
      p.price,
      p.stock,
      p.status,
      p.createdAt.slice(0, 10),
    ]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function ProductsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const params = {
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(brand !== "all" ? { brand } : {}),
    ...(status !== "all" ? { status } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const productsQuery = productsApi.useList(params);
  const categoriesQuery = categoriesApi.useList({ pageSize: 100 });
  const brandsQuery = brandsApi.useList({ pageSize: 100 });
  const setStatusMutation = productsApi.useSetStatus();
  const removeMutation = productsApi.useRemove();

  const rows: ProductDto[] = productsQuery.data?.data ?? [];
  const total = productsQuery.isError ? 0 : rows.length * Math.max(1, page);
  const pageCount = productsQuery.isError ? 1 : (productsQuery.data?.meta?.totalPages ?? 1);
  const categories = categoriesQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const allChecked = rows.length > 0 && rows.every((p) => selected.includes(p.id));

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const archiveSelected = () => {
    Promise.all(
      selected.map((id) => setStatusMutation.mutateAsync({ id, status: "Archived" as const })),
    )
      .then(() => {
        toast.success(`${selected.length} product(s) archived`);
        setSelected([]);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof AdminApiError ? e.message : "Archive failed"),
      );
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info("No products on this page to export");
      return;
    }
    const blob = new Blob([productsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded for the current page");
  };

  return (
    <AppShell>
      <PageHeader
        title="Products"
        description={`${total} products matching current filters`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link to="/products/new">
                <Plus className="h-4 w-4" /> Add product
              </Link>
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search products or SKUs..."
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[152px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={brand}
              onValueChange={(v) => {
                setBrand(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[144px]">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[144px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Active", "Draft", "Out of Stock", "Archived"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
            <p className="num text-xs font-medium">{selected.length} selected</p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={archiveSelected}>
                Archive
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {productsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-surface-muted" />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <EmptyState
            title="Couldn't load products"
            description={
              productsQuery.error instanceof AdminApiError
                ? productsQuery.error.message
                : "Check your connection and try again."
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No products match"
            description="Adjust your filters or add a new product to the catalog."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => setSelected(v ? rows.map((p) => p.id) : [])}
                      aria-label="Select all"
                    />
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
                {rows.map((p) => (
                  <tr key={p.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))
                        }
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {p.images[0]?.url ? (
                          <img
                            src={p.images[0].url}
                            alt={p.images[0].alt ?? p.name}
                            className="h-9 w-9 shrink-0 rounded-md border object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <p className="max-w-56 truncate font-medium">{p.name}</p>
                      </div>
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {p.sku}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.category?.name ?? "-"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {p.brand?.name ?? "-"}
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium">{formatNpr(p.price)}</td>
                    <td className="num px-4 py-2.5 text-right">
                      <span
                        className={
                          p.stock <= 0
                            ? "font-medium text-destructive"
                            : p.stock < 40
                              ? "font-medium text-warning"
                              : ""
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="num inline-flex items-center gap-1 whitespace-nowrap">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {p.rating.toFixed(1)}
                        <span className="text-xs text-muted-foreground">({p.reviewsCount})</span>
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {p.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Actions for ${p.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {p.status !== "Archived" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                act(
                                  () =>
                                    setStatusMutation.mutateAsync({
                                      id: p.id,
                                      status: "Archived" as const,
                                    }),
                                  `${p.name} archived`,
                                )
                              }
                            >
                              <Archive className="h-4 w-4" /> Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                act(
                                  () =>
                                    setStatusMutation.mutateAsync({
                                      id: p.id,
                                      status: "Draft" as const,
                                    }),
                                  `${p.name} restored to draft`,
                                )
                              }
                            >
                              <Archive className="h-4 w-4" /> Restore to draft
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              act(() => removeMutation.mutateAsync(p.id), `${p.name} deleted`)
                            }
                          >
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

        <TablePagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
      </Section>
    </AppShell>
  );
}
