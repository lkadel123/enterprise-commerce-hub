import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { pageHead } from "@/lib/seo";
import { parseCatalogSearch, type CatalogSearchParams } from "@/lib/catalogSearch";
import { useProductsQuery, useSearchSuggestions } from "@/features/catalog/catalog-hooks";
import { PaginationBar } from "@/features/catalog/PaginationBar";
import { ProductResults } from "@/features/catalog/ProductResults";
import type { ProductListParams } from "@/types";

const PAGE_SIZE = 24;

/**
 * Public search: keyword results (product name/sku) plus deferred suggestions.
 * The results page is intentionally `noindex` (dynamic query).
 */
export const Route = createFileRoute("/search")({
  validateSearch: parseCatalogSearch,
  head: () => {
    const base = pageHead({
      title: "Search — NASB",
      description: "Search our product catalog.",
      path: "/search",
    });
    return { ...base, meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }] };
  },
  component: SearchPage,
});

function SearchPage() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const query = search.q?.trim() ?? "";
  const hasQuery = query.length > 0;

  const suggestions = useSearchSuggestions(query);
  const products = useProductsQuery({
    q: query,
    page: search.page,
    pageSize: PAGE_SIZE,
  } as ProductListParams);

  const items = products.data?.data ?? [];
  const meta = products.data?.meta;

  const [text, setText] = React.useState(query);

  function go(nextQuery: string) {
    const trimmed = nextQuery.trim();
    const next: CatalogSearchParams = trimmed === "" ? {} : { q: trimmed };
    void navigate({ to: "/search", search: next });
  }

  const suggestionItems = suggestions.data?.data?.suggestions ?? [];

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display">Search</h1>
        <p className="text-sm text-muted-foreground">Search our catalog by product name or SKU.</p>
      </div>

      <form
        role="search"
        className="flex w-full gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          go(text);
        }}
      >
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
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {query && suggestionItems.length > 0 ? (
        <nav aria-label="Search suggestions" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Suggestions:</span>
          {suggestionItems.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setText(suggestion);
                go(suggestion);
              }}
              className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent"
            >
              {suggestion}
            </button>
          ))}
        </nav>
      ) : null}

      <Separator />

      {!hasQuery ? (
        <div className="py-10 text-center">
          <h2 className="text-lg font-semibold">Enter a search term</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Search matches product names and SKUs.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {products.isPending
              ? `Searching for “${query}”…`
              : items.length > 0
                ? `${products.data?.meta?.total ?? items.length} result${items.length === 1 ? "" : "s"} for “${query}”`
                : `No results for “${query}”`}
          </p>
          <ProductResults
            isPending={products.isPending}
            isError={products.isError}
            error={products.error}
            products={items}
            onRetry={() => void products.refetch()}
            empty={
              <p className="max-w-sm text-sm text-muted-foreground">Try a different keyword.</p>
            }
          />
          <PaginationBar
            meta={meta}
            onPageChange={(page) => void navigate({ to: "/search", search: { q: query, page } })}
          />
        </>
      )}
    </section>
  );
}
