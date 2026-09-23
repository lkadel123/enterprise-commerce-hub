import { createFileRoute } from "@tanstack/react-router";
import { Boxes, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/kit";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminApiError } from "@/lib/api/client";
import { brandsApi } from "@/lib/api/catalog";
import type { BrandDto } from "@/lib/api/types";

function BrandForm({
  brand,
  onSubmit,
  submitting,
}: {
  brand?: BrandDto;
  onSubmit: (values: { name: string; description: string }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(brand?.name ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Brand name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aurora Audio"
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short brand description"
          className="h-9"
        />
      </div>
      <DialogFooter>
        <Button
          size="sm"
          disabled={submitting || !name.trim()}
          onClick={() => onSubmit({ name: name.trim(), description: description.trim() })}
        >
          {brand ? "Save changes" : "Create brand"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export const Route = createFileRoute("/brands")({
  head: () => ({
    meta: [
      { title: "Brands — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Manage supplier brands, logos, descriptions and product counts across the catalog.",
      },
      { property: "og:title", content: "Brands — Northpeak Commerce Console" },
      {
        property: "og:description",
        content: "Brand management for enterprise e-commerce catalogs.",
      },
    ],
  }),
  component: BrandsPage,
});

function BrandsPage() {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BrandDto | null>(null);
  const brandsQuery = brandsApi.useList(
    query.trim() ? { q: query.trim(), pageSize: 100 } : { pageSize: 100 },
  );
  const createBrand = brandsApi.useCreate();
  const updateBrand = brandsApi.useUpdate();
  const removeBrand = brandsApi.useRemove();

  const rows = brandsQuery.data ?? [];

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  return (
    <AppShell>
      <PageHeader
        title="Brands"
        description="Supplier and manufacturer brands available in the catalog."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" /> New brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create brand</DialogTitle>
                <DialogDescription>
                  Brands are instantly available to products and storefront filters.
                </DialogDescription>
              </DialogHeader>
              <BrandForm
                submitting={createBrand.isPending}
                onSubmit={(values) => {
                  act(
                    () => createBrand.mutateAsync(values).then(() => setCreateOpen(false)),
                    "Brand created",
                  );
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands..."
            className="h-9 pl-9"
          />
        </div>
      </div>

      {brandsQuery.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : brandsQuery.isError ? (
        <EmptyState
          title="Couldn't load brands"
          description="Check your connection and try again."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No brands found"
          description={
            query ? "Try a different search term." : "Create your first brand to get started."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <div key={b.id} className="card-surface p-4 transition-shadow hover:shadow-raised">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border bg-surface-muted text-muted-foreground">
                  <Boxes className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{b.name}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  {b.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {b.description}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(b)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        act(
                          () =>
                            updateBrand.mutateAsync({
                              id: b.id,
                              body: { status: b.status === "Active" ? "Hidden" : "Active" },
                            }),
                          b.status === "Active" ? "Brand hidden" : "Brand made active",
                        )
                      }
                    >
                      {b.status === "Active" ? "Hide brand" : "Make active"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => act(() => removeBrand.mutateAsync(b.id), "Brand deleted")}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
                <span className="text-muted-foreground">Products</span>
                <span className="num font-semibold">{b.productCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit brand</DialogTitle>
            <DialogDescription>Update the brand details.</DialogDescription>
          </DialogHeader>
          {editing && (
            <BrandForm
              brand={editing}
              submitting={updateBrand.isPending}
              onSubmit={(values) => {
                act(
                  () =>
                    updateBrand
                      .mutateAsync({ id: editing.id, body: values })
                      .then(() => setEditing(null)),
                  "Brand updated",
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
