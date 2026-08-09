import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
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
import { categoryRows } from "@/lib/mock-data";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Create, order and publish catalog categories with parent hierarchy and product counts.",
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
  const rows = categoryRows.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AppShell>
      <PageHeader
        title="Categories"
        description="Organise your catalog into a browsable hierarchy."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4" /> New category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create category</DialogTitle>
                <DialogDescription>Categories appear in storefront navigation and filters.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label className="text-xs">Category name</Label><Input className="h-9" placeholder="Home & Living" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Parent category</Label>
                  <Select><SelectTrigger className="h-9"><SelectValue placeholder="None (top level)" /></SelectTrigger>
                    <SelectContent>{categoryRows.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={3} placeholder="Short description shown on the category page." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Sort order</Label><Input className="num h-9" placeholder="1" /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select defaultValue="active"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="hidden">Hidden</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button size="sm" onClick={() => toast.success("Category created")}>Create category</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Section bodyClassName="p-0">
        <div className="flex items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories..." className="h-9 pl-9" />
          </div>
          {selected.length > 0 && (
            <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() => { setSelected([]); toast.success("Categories hidden"); }}>
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
              {rows.map((c) => (
                <tr key={c.id} className="border-t transition-colors hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onCheckedChange={(v) => setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.parent}</td>
                  <td className="max-w-72 truncate px-4 py-2.5 text-muted-foreground">{c.description}</td>
                  <td className="num px-4 py-2.5 text-right">{c.products}</td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">{c.sort}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => toast.error(`${c.name} deleted`)}>
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
      </Section>
    </AppShell>
  );
}
