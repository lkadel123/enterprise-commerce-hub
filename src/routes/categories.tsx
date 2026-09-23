import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError } from "@/lib/api/client";
import { categoriesApi } from "@/lib/api/catalog";
import type { CategoryDto } from "@/lib/api/types";

function CategoryForm({
  category,
  parents,
  onSubmit,
  submitting,
}: {
  category?: CategoryDto;
  parents: CategoryDto[];
  onSubmit: (values: {
    name: string;
    parentId: string | null;
    description: string;
    sort: number;
    status: "Active" | "Hidden";
  }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(category?.parent?.id ?? "none");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sort, setSort] = useState(String(category?.sort ?? 1));
  const [status, setStatus] = useState(category?.status ?? "Active");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Category name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9"
          placeholder="Home & Living"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Parent category</Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="None (top level)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (top level)</SelectItem>
            {parents
              .filter((p) => p.id !== category?.id)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description shown on the category page."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Sort order</Label>
          <Input
            className="num h-9"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "Active" | "Hidden")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          size="sm"
          disabled={submitting || !name.trim()}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              parentId: parentId === "none" ? null : parentId,
              description: description.trim(),
              sort: Number(sort) || 1,
              status,
            })
          }
        >
          {category ? "Save changes" : "Create category"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Northpeak Commerce Console" },
      {
        name: "description",
        content:
          "Create, order and publish catalog categories with parent hierarchy and product counts.",
      },
      { property: "og:title", content: "Categories — Northpeak Commerce Console" },
      { property: "og:description", content: "Category CRUD for enterprise e-commerce catalogs." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const categoriesQuery = categoriesApi.useList({ pageSize: 100 });
  const createCategory = categoriesApi.useCreate();
  const updateCategory = categoriesApi.useUpdate();
  const removeCategory = categoriesApi.useRemove();

  const allRows = categoriesQuery.data ?? [];
  const rows = query.trim()
    ? allRows.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : allRows;

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  const bulkHide = () => {
    const ids = [...selected];
    Promise.all(ids.map((id) => updateCategory.mutateAsync({ id, body: { status: "Hidden" } })))
      .then(() => {
        setSelected([]);
        toast.success("Selected categories hidden");
      })
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  return (
    <AppShell>
      <PageHeader
        title="Categories"
        description="Organise your catalog into a browsable hierarchy."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" /> New category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create category</DialogTitle>
                <DialogDescription>
                  Categories appear in storefront navigation and filters.
                </DialogDescription>
              </DialogHeader>
              <CategoryForm
                parents={allRows}
                submitting={createCategory.isPending}
                onSubmit={(values) => {
                  act(
                    () => createCategory.mutateAsync(values).then(() => setCreateOpen(false)),
                    "Category created",
                  );
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <Section bodyClassName="p-0">
        <div className="flex items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories..."
              className="h-9 pl-9"
            />
          </div>
          {selected.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-9"
              disabled={updateCategory.isPending}
              onClick={bulkHide}
            >
              Hide {selected.length} selected
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-2.5" />
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Parent</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Products</th>
                <th className="px-4 py-2.5 text-right font-medium">Sort</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoriesQuery.isPending ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading categories…
                  </td>
                </tr>
              ) : categoriesQuery.isError ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-destructive">
                    Couldn't load categories. Check your connection and try again.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No categories found.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-t transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                        }
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.parent?.name ?? "—"}</td>
                    <td className="max-w-72 truncate px-4 py-2.5 text-muted-foreground">
                      {c.description ?? "—"}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{c.productCount}</td>
                    <td className="num px-4 py-2.5 text-right text-muted-foreground">{c.sort}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              act(
                                () =>
                                  updateCategory.mutateAsync({
                                    id: c.id,
                                    body: { status: c.status === "Active" ? "Hidden" : "Active" },
                                  }),
                                c.status === "Active" ? "Category hidden" : "Category made active",
                              )
                            }
                          >
                            {c.status === "Active" ? "Hide" : "Make active"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() =>
                              act(() => removeCategory.mutateAsync(c.id), "Category deleted")
                            }
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update the category details.</DialogDescription>
          </DialogHeader>
          {editing && (
            <CategoryForm
              category={editing}
              parents={allRows}
              submitting={updateCategory.isPending}
              onSubmit={(values) => {
                act(
                  () =>
                    updateCategory
                      .mutateAsync({ id: editing.id, body: values })
                      .then(() => setEditing(null)),
                  "Category updated",
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
