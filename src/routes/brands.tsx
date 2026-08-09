import { createFileRoute } from "@tanstack/react-router";
import { Boxes, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { brandRows } from "@/lib/mock-data";

export const Route = createFileRoute("/brands")({
  head: () => ({
    meta: [
      { title: "Brands — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Manage supplier brands, logos, descriptions and product counts across the catalog.",
      },
      { property: "og:title", content: "Brands — Northpeak Commerce Console" },
      { property: "og:description", content: "Brand management for enterprise e-commerce catalogs." },
    ],
  }),
  component: BrandsPage,
});

function BrandsPage() {
  const [query, setQuery] = useState("");
  const rows = brandRows.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AppShell>
      <PageHeader
        title="Brands"
        description="Supplier and manufacturer brands available in the catalog."
        actions={<Button size="sm" className="h-9" onClick={() => toast.success("Brand form opened")}><Plus className="h-4 w-4" /> New brand</Button>}
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search brands..." className="h-9 pl-9" />
        </div>
      </div>

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
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => toast.error(`${b.name} deleted`)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
              <span className="text-muted-foreground">Products</span>
              <span className="num font-semibold">{b.products}</span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
