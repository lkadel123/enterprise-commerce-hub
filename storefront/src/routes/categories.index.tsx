import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { useCategories } from "@/features/catalog/catalog-hooks";
import { CategoryCard, DirectoryGrid } from "@/features/catalog/Directory";

/**
 * Category directory at `/categories` — a public, paginated list of active
 * categories. Rendered inside the `/categories` layout (`categories.tsx`).
 */
export const Route = createFileRoute("/categories/")({
  head: () =>
    pageHead({
      title: "Categories — NASB",
      description: "Explore products by category.",
      path: "/categories",
    }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const categories = useCategories({ pageSize: 24 });
  const items = categories.data?.data ?? [];

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-display">Categories</h1>
        <p className="mt-1 text-muted-foreground">Browse products by category.</p>
      </div>

      <DirectoryGrid
        isPending={categories.isPending}
        isError={categories.isError}
        error={categories.error}
        items={items}
        onRetry={() => void categories.refetch()}
        renderItem={(category) => <CategoryCard category={category} />}
        emptyTitle="No categories yet"
        emptyDescription="Categories will appear here as soon as products are organized."
      />
    </section>
  );
}
