import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useBrands, useCategories } from "@/features/catalog/catalog-hooks";

export const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "default", label: "Default / Featured" },
  { value: "name", label: "Name (A–Z)" },
  { value: "-name", label: "Name (Z–A)" },
  { value: "price", label: "Price: Low to High" },
  { value: "-price", label: "Price: High to Low" },
  { value: "-rating", label: "Top Rated" },
  { value: "-reviewsCount", label: "Most Reviewed" },
  { value: "-createdAt", label: "Newest" },
];

export interface CatalogFilterValues {
  q?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  sort?: string | undefined;
}

export interface CatalogToolbarProps {
  values: CatalogFilterValues;
  onChange: (next: CatalogFilterValues) => void;
  onReset: () => void;
  /** Show the category facet (hidden on category pages). */
  showCategory?: boolean;
  /** Show the brand facet (hidden on brand pages). */
  showBrand?: boolean;
  /** Disable the free-text search (kept minimal on category/brand pages). */
  showSearch?: boolean;
  hasActiveFilters?: boolean;
}

export function CatalogToolbar({
  values,
  onChange,
  onReset,
  showCategory = true,
  showBrand = true,
  showSearch = true,
  hasActiveFilters = false,
}: CatalogToolbarProps) {
  const [text, setText] = React.useState(values.q ?? "");
  // Backend caps pageSize at 48 (public catalog pagination) — requesting more
  // is rejected with 422, so stay within the verified contract.
  const categories = useCategories({ pageSize: 48 });
  const brands = useBrands({ pageSize: 48 });

  const categoryOptions = categories.data?.data ?? [];
  const brandOptions = brands.data?.data ?? [];

  const categoryValue = values.category && values.category !== "" ? values.category : ALL;
  const brandValue = values.brand && values.brand !== "" ? values.brand : ALL;
  const sortValue = values.sort && values.sort !== "" ? values.sort : DEFAULT_SORT;

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const next = text.trim();
    onChange({ ...values, q: next === "" ? undefined : next });
  }

  function clearSearch() {
    setText("");
    onChange({ ...values, q: undefined });
  }

  return (
    <div className="flex flex-col gap-4">
      {showSearch ? (
        <form onSubmit={submitSearch} role="search" className="flex w-full gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="pl-9 pr-9"
            />
            {text !== "" ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button type="submit">Search</Button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {showCategory ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-category" className="text-xs text-muted-foreground">
              Category
            </Label>
            <Select
              value={categoryValue}
              onValueChange={(value) =>
                onChange({ ...values, category: value === ALL ? undefined : value })
              }
            >
              <SelectTrigger id="filter-category" className="w-44" aria-label="Filter by category">
                <SelectValue>
                  {categoryOptions.find((c) => c.slug === categoryValue)?.name ?? "All categories"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category.id} value={category.slug}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showBrand ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-brand" className="text-xs text-muted-foreground">
              Brand
            </Label>
            <Select
              value={brandValue}
              onValueChange={(value) =>
                onChange({ ...values, brand: value === ALL ? undefined : value })
              }
            >
              <SelectTrigger id="filter-brand" className="w-44" aria-label="Filter by brand">
                <SelectValue>
                  {brandOptions.find((b) => b.slug === brandValue)?.name ?? "All brands"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All brands</SelectItem>
                {brandOptions.map((brand) => (
                  <SelectItem key={brand.id} value={brand.slug}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-sort" className="text-xs text-muted-foreground">
            Sort by
          </Label>
          <Select
            value={sortValue}
            onValueChange={(value) =>
              onChange({ ...values, sort: value === DEFAULT_SORT ? undefined : value })
            }
          >
            <SelectTrigger id="filter-sort" className="w-52" aria-label="Sort products">
              <SelectValue>
                {SORT_OPTIONS.find((o) => o.value === sortValue)?.label ?? "Sort"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters ? (
          <Button variant="ghost" onClick={onReset} className="h-11 self-end">
            Reset filters
          </Button>
        ) : null}
      </div>

      <Separator />
    </div>
  );
}

const ALL = "all";
const DEFAULT_SORT = "default";
