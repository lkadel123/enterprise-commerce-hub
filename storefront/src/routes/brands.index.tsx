import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { useBrands } from "@/features/catalog/catalog-hooks";
import { BrandCard, DirectoryGrid } from "@/features/catalog/Directory";

/**
 * Brand directory at `/brands` — a public, paginated list of active brands.
 * Rendered inside the `/brands` layout (`brands.tsx`).
 */
export const Route = createFileRoute("/brands/")({
  head: () =>
    pageHead({
      title: "Brands — NASB",
      description: "Explore products from trusted brands.",
      path: "/brands",
    }),
  component: BrandsPage,
});

function BrandsPage() {
  const brands = useBrands({ pageSize: 24 });
  const items = brands.data?.data ?? [];

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-display">Brands</h1>
        <p className="mt-1 text-muted-foreground">Explore products from trusted brands.</p>
      </div>

      <DirectoryGrid
        isPending={brands.isPending}
        isError={brands.isError}
        error={brands.error}
        items={items}
        onRetry={() => void brands.refetch()}
        renderItem={(brand) => <BrandCard brand={brand} />}
        emptyTitle="No brands yet"
        emptyDescription="Brands will appear here as soon as products are published."
      />
    </section>
  );
}
