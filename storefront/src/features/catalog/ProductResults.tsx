import { PackageX, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/features/catalog/ProductCard";
import type { PublicProductDto } from "@/types";

export interface ProductResultsProps {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  products: PublicProductDto[];
  onRetry: () => void;
  /** Rendered in the empty state; default is a generic "no products" message. */
  empty?: ReactNode;
  /** Empty-state title override (e.g. "No products found in this category"). */
  emptyTitle?: string;
  /** Empty-state description override. */
  emptyDescription?: string;
  className?: string;
}

/**
 * Renders the standard loading / error / empty / grid states for a product
 * listing. Keeps every catalog page consistent (the verified state system).
 */
export function ProductResults({
  isPending,
  isError,
  error,
  products,
  onRetry,
  empty,
  emptyTitle,
  emptyDescription,
  className,
}: ProductResultsProps) {
  if (isPending) {
    return (
      <LoadingSkeleton
        count={8}
        card
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          className,
        )}
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        error={error}
        title="Unable to load products"
        onRetry={onRetry}
        className={className}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<PackageX className="h-10 w-10" />}
        title={emptyTitle ?? "No products found"}
        description={
          emptyDescription ??
          "Try adjusting your search or filters to find what you're looking for."
        }
        action={empty}
        className={className}
      />
    );
  }

  return (
    <div
      data-testid="product-grid"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
