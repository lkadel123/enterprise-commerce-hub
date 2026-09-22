import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { canonicalUrl, pageHead } from "@/lib/seo";
import { collectionPageJsonLd, itemListJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/lib/JsonLd";
import { parseCatalogSearch, type CatalogSearchParams } from "@/lib/catalogSearch";
import { useProductsQuery } from "@/features/catalog/catalog-hooks";
import { CatalogToolbar } from "@/features/catalog/CatalogToolbar";
import { PaginationBar } from "@/features/catalog/PaginationBar";
import { ProductResults } from "@/features/catalog/ProductResults";
import type { ProductListParams } from "@/types";

const PAGE_SIZE = 24;

/**
 * Public catalog listing at `/products` with server-driven filtering, sorting
 * and pagination (URL state via search params). Data is fetched client-side
 * with TanStack Query — the verified SSR + hydrate convention. Rendered
 * inside the `/products` layout (`products.tsx`).
 */
export const Route = createFileRoute("/products/")({
  validateSearch: parseCatalogSearch,
  head: () =>
    pageHead({
      title: "Products — NASB",
      description: "Browse our catalog of quality products.",
      path: "/products",
    }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();

  const params: ProductListParams = {
    q: search.q,
    category: search.category,
    brand: search.brand,
    sort: search.sort,
    page: search.page,
    pageSize: PAGE_SIZE,
  };

  const products = useProductsQuery(params);
  const items = products.data?.data ?? [];
  const meta = products.data?.meta;

  const hasActiveFilters = Boolean(search.q || search.category || search.brand || search.sort);

  function go(next: CatalogSearchParams) {
    void navigate({ to: "/products", search: next });
  }

  const resetAction = (
    <Button variant="outline" onClick={() => go({})}>
      Clear filters
    </Button>
  );

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Pagination rel=prev/next — React 19 hoists these <link> tags into
          <head>. Emitted only from real pagination state, never invalid. */}
      {(search.page ?? 1) > 1 ? (
        <link rel="prev" href={canonicalUrl(`/products?page=${(search.page ?? 1) - 1}`)} />
      ) : null}
      {meta && (search.page ?? 1) < meta.totalPages ? (
        <link rel="next" href={canonicalUrl(`/products?page=${(search.page ?? 1) + 1}`)} />
      ) : null}

      {/* CollectionPage + ItemList from the real loaded results (unfiltered
          views only — filtered/sorted variants stay out of structured data). */}
      {!hasActiveFilters && items.length > 0 ? (
        <>
          <JsonLd data={collectionPageJsonLd("/products", "Products")} />
          <JsonLd
            data={itemListJsonLd(
              items.map((p) => ({
                name: p.name,
                path: `/products/${p.slug}`,
                image: p.images[0]?.url ?? null,
              })),
            )}
          />
        </>
      ) : null}
      <div>
        <h1 className="text-display">Products</h1>
        <p className="mt-1 text-muted-foreground">Browse our catalog of quality products.</p>
      </div>

      <CatalogToolbar
        values={{
          q: search.q,
          category: search.category,
          brand: search.brand,
          sort: search.sort,
        }}
        onChange={(filters) => go({ ...search, ...filters, page: 1 })}
        onReset={() => go({})}
        hasActiveFilters={hasActiveFilters}
      />

      <ProductResults
        isPending={products.isPending}
        isError={products.isError}
        error={products.error}
        products={items}
        onRetry={() => void products.refetch()}
        empty={
          hasActiveFilters ? (
            resetAction
          ) : (
            <Button variant="outline" asChild>
              <Link to="/products">Browse all products</Link>
            </Button>
          )
        }
      />

      <PaginationBar meta={meta} onPageChange={(page) => go({ ...search, page })} />
    </section>
  );
}
