import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { NotFoundState } from "@/components/feedback/NotFoundState";
import { PageLoader } from "@/components/loading/PageLoader";
import { ApiClientError } from "@/lib/api/client";
import { pageHead, titleFromSlug } from "@/lib/seo";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/lib/JsonLd";
import { useProduct, useProductReviews } from "@/features/catalog/catalog-hooks";
import { ProductDetail } from "@/features/catalog/ProductDetail";

/**
 * Product detail: gallery, server-authoritative price/stock, variations &
 * shipping info, and approved public reviews. Lookups happen client-side.
 * A NOT_FOUND backend error renders a dedicated 404 state.
 *
 * SEO: the SSR `head()` uses the slug-derived name (unique per product);
 * full Product/Offer/AggregateRating/BreadcrumbList JSON-LD renders once the
 * real DTO has loaded — no fabricated values ever enter structured data.
 */
export const Route = createFileRoute("/products/$slug")({
  head: ({ params }) => {
    const name = titleFromSlug(params.slug);
    return pageHead({
      title: `${name} — NASB`,
      description: `View ${name}: pricing, availability and customer reviews.`,
      path: `/products/${params.slug}`,
    });
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const product = useProduct(slug);
  const productId = product.data?.data?.id;
  const reviews = useProductReviews(productId, 1, 20);

  if (product.isPending) {
    return <PageLoader label="Loading product…" />;
  }

  if (product.isError || !product.data) {
    if (product.error instanceof ApiClientError && product.error.code === "NOT_FOUND") {
      return (
        <NotFoundState
          title="Product not found"
          description="This product doesn't exist or is no longer available."
          action={
            <Button variant="outline" asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        error={product.error}
        title="Unable to load product"
        onRetry={() => void product.refetch()}
        className="py-12"
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
      {product.data?.data ? (
        <>
          {/* Structured data from the real product DTO (no fabricated values). */}
          <JsonLd data={productJsonLd(product.data.data)} />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Products", path: "/products" },
              ...(product.data.data.category
                ? [
                    {
                      name: product.data.data.category.name,
                      path: `/categories/${product.data.data.category.slug}`,
                    },
                  ]
                : []),
              ...(product.data.data.brand
                ? [
                    {
                      name: product.data.data.brand.name,
                      path: `/brands/${product.data.data.brand.slug}`,
                    },
                  ]
                : []),
              {
                name: product.data.data.name,
                path: `/products/${product.data.data.slug}`,
              },
            ])}
          />
          <ProductDetail
            product={product.data.data}
            reviews={{
              isLoading: reviews.isLoading,
              isError: reviews.isError,
              error: reviews.error,
              items: reviews.data?.data ?? [],
              onRetry: () => void reviews.refetch(),
            }}
          />
        </>
      ) : null}
    </div>
  );
}
