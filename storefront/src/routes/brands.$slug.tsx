import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { NotFoundState } from "@/components/feedback/NotFoundState";
import { PageLoader } from "@/components/loading/PageLoader";
import { ApiClientError } from "@/lib/api/client";
import { parseCatalogSearch, type CatalogSearchParams } from "@/lib/catalogSearch";
import { pageHead, titleFromSlug } from "@/lib/seo";
import { breadcrumbJsonLd, brandJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/lib/JsonLd";
import { useBrand, useProductsQuery } from "@/features/catalog/catalog-hooks";
import { CatalogToolbar } from "@/features/catalog/CatalogToolbar";
import { PaginationBar } from "@/features/catalog/PaginationBar";
import { ProductResults } from "@/features/catalog/ProductResults";
import type { ProductListParams } from "@/types";

const PAGE_SIZE = 24;

/**
 * Brand page = brand header + filtered product listing (brand facet is
 * implicitly fixed). Server-side filters for category/sort/search/pagination
 * are driven by the URL search state.
 */
export const Route = createFileRoute("/brands/$slug")({
  validateSearch: parseCatalogSearch,
  head: ({ params }) => {
    const name = titleFromSlug(params.slug);
    return pageHead({
      title: `${name} — NASB`,
      description: `Browse products from ${name}.`,
      path: `/brands/${params.slug}`,
    });
  },
  component: BrandPage,
});

function BrandPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const search = useSearch({ from: Route.id });

  const brand = useBrand(slug);

  const params: ProductListParams = {
    brand: slug,
    q: search.q,
    category: search.category,
    sort: search.sort,
    page: search.page,
    pageSize: PAGE_SIZE,
  };
  const products = useProductsQuery(params);
  const items = products.data?.data ?? [];
  const meta = products.data?.meta;

  function go(next: CatalogSearchParams) {
    void navigate({ to: "/brands/$slug", params: { slug }, search: next });
  }

  if (brand.isPending) {
    return <PageLoader label="Loading brand…" />;
  }

  if (brand.isError || !brand.data) {
    if (brand.error instanceof ApiClientError && brand.error.code === "NOT_FOUND") {
      return (
        <NotFoundState
          title="Brand not found"
          description="This brand doesn't exist or has no public products."
          action={
            <Button variant="outline" asChild>
              <Link to="/brands">Browse brands</Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        error={brand.error}
        title="Unable to load brand"
        onRetry={() => void brand.refetch()}
        className="py-12"
      />
    );
  }

  const b = brand.data?.data;
  const hasActiveFilters = Boolean(search.q || search.category || search.sort);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <JsonLd data={brandJsonLd(b)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Brands", path: "/brands" },
          { name: b.name, path: `/brands/${b.slug}` },
        ])}
      />
      <div>
        <h1 className="text-display">{b.name}</h1>
        {b.description ? (
          <p className="mt-1 max-w-2xl text-muted-foreground">{b.description}</p>
        ) : null}
        {b.productCount > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {b.productCount} {b.productCount === 1 ? "product" : "products"}
          </p>
        ) : null}
      </div>

      <CatalogToolbar
        showBrand={false}
        values={{ q: search.q, category: search.category, sort: search.sort }}
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
        emptyTitle="No products found for this brand"
        emptyDescription="This brand has no products here yet. Try adjusting your search or filters, or browse all brands."
        empty={
          hasActiveFilters ? (
            <Button variant="outline" onClick={() => go({})}>
              Clear filters
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/brands">Browse all brands</Link>
            </Button>
          )
        }
      />

      <PaginationBar meta={meta} onPageChange={(page) => go({ ...search, page })} />
    </section>
  );
}
