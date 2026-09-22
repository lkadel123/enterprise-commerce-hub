import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { NotFoundState } from "@/components/feedback/NotFoundState";
import { PageLoader } from "@/components/loading/PageLoader";
import { ApiClientError } from "@/lib/api/client";
import { parseCatalogSearch, type CatalogSearchParams } from "@/lib/catalogSearch";
import { pageHead, titleFromSlug } from "@/lib/seo";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/lib/JsonLd";
import { useCategory, useProductsQuery } from "@/features/catalog/catalog-hooks";
import { CatalogToolbar } from "@/features/catalog/CatalogToolbar";
import { PaginationBar } from "@/features/catalog/PaginationBar";
import { ProductResults } from "@/features/catalog/ProductResults";
import type { ProductListParams } from "@/types";

const PAGE_SIZE = 24;

/**
 * Category page = category header + filtered product listing (category facet is
 * implicitly fixed). Server-side filters for brand/sort/search/pagination are
 * driven by the URL search state.
 */
export const Route = createFileRoute("/categories/$slug")({
  validateSearch: parseCatalogSearch,
  head: ({ params }) => {
    const name = titleFromSlug(params.slug);
    return pageHead({
      title: `${name} — NASB`,
      description: `Browse products in ${name}.`,
      path: `/categories/${params.slug}`,
    });
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const search = useSearch({ from: Route.id });

  const category = useCategory(slug);

  const params: ProductListParams = {
    category: slug,
    q: search.q,
    brand: search.brand,
    sort: search.sort,
    page: search.page,
    pageSize: PAGE_SIZE,
  };
  const products = useProductsQuery(params);
  const items = products.data?.data ?? [];
  const meta = products.data?.meta;

  function go(next: CatalogSearchParams) {
    void navigate({ to: "/categories/$slug", params: { slug }, search: next });
  }

  if (category.isPending) {
    return <PageLoader label="Loading category…" />;
  }

  if (category.isError || !category.data) {
    if (category.error instanceof ApiClientError && category.error.code === "NOT_FOUND") {
      return (
        <NotFoundState
          title="Category not found"
          description="This category doesn't exist or has no public products."
          action={
            <Button variant="outline" asChild>
              <Link to="/categories">Browse categories</Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        error={category.error}
        title="Unable to load category"
        onRetry={() => void category.refetch()}
        className="py-12"
      />
    );
  }

  const cat = category.data?.data;
  const hasActiveFilters = Boolean(search.q || search.brand || search.sort);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <JsonLd data={collectionPageJsonLd(`/categories/${cat.slug}`, cat.name)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Categories", path: "/categories" },
          { name: cat.name, path: `/categories/${cat.slug}` },
        ])}
      />
      <div>
        <h1 className="text-display">{cat.name}</h1>
        {cat.description ? (
          <p className="mt-1 max-w-2xl text-muted-foreground">{cat.description}</p>
        ) : null}
        {cat.productCount > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {cat.productCount} {cat.productCount === 1 ? "product" : "products"}
          </p>
        ) : null}
      </div>

      <CatalogToolbar
        showCategory={false}
        values={{ q: search.q, brand: search.brand, sort: search.sort }}
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
        emptyTitle="No products found in this category"
        emptyDescription="This category is still being curated. Try adjusting your search or filters, or browse all categories."
        empty={
          hasActiveFilters ? (
            <Button variant="outline" onClick={() => go({})}>
              Clear filters
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/categories">Browse all categories</Link>
            </Button>
          )
        }
      />

      <PaginationBar meta={meta} onPageChange={(page) => go({ ...search, page })} />
    </section>
  );
}
