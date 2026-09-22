import * as React from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, PackageX, Store } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { PublicBrandDto, PublicCategoryDto } from "@/types";

/**
 * Shared directory primitives for the category and brand listing pages.
 * Renders loading / error / empty / grid states consistently, matching the
 * storefront's verified state system.
 */

export interface CategoryCardProps {
  category: PublicCategoryDto;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Card className="group relative cursor-pointer border-border-line transition-all duration-300 hover:-translate-y-0.5 hover:border-dark-gold/40 hover:shadow-raised focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <Link
        to="/categories/$slug"
        params={{ slug: category.slug }}
        // The link fills the whole card (block h-full inside a padding-less
        // Card) so every pixel of the tile triggers navigation — semantic
        // navigation, not a clickable div.
        className="block h-full rounded-xl focus-visible:outline-none"
      >
        <CardContent className="flex h-full min-h-[8.75rem] flex-col justify-end gap-2 border-t-2 border-transparent p-5 transition-colors group-hover:border-dark-gold">
          <FolderOpen className="h-6 w-6 text-dark-gold" aria-hidden="true" />
          <p className="font-serif text-lg font-semibold text-ink transition-colors group-hover:text-dark-gold">
            {category.name}
          </p>
          {category.productCount > 0 ? (
            <p className="text-sm uppercase tracking-[0.1em] text-muted-text">
              {category.productCount} {category.productCount === 1 ? "product" : "products"}
            </p>
          ) : null}
        </CardContent>
      </Link>
    </Card>
  );
}

export interface BrandCardProps {
  brand: PublicBrandDto;
}

export function BrandCard({ brand }: BrandCardProps) {
  const logo = mediaUrl(brand.logoUrl);

  return (
    <Card className="group relative cursor-pointer border-border-line transition-all duration-300 hover:-translate-y-0.5 hover:border-dark-gold/40 hover:shadow-raised focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <Link
        to="/brands/$slug"
        params={{ slug: brand.slug }}
        // The link fills the whole card so the entire tile navigates.
        className="block h-full rounded-xl focus-visible:outline-none"
      >
        <CardContent className="flex h-full min-h-[8.75rem] flex-col items-start gap-2 border-t-2 border-transparent p-5 transition-colors group-hover:border-dark-gold">
          <div className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-muted">
            {logo ? (
              <img src={logo} alt="" loading="lazy" className="h-7 w-7 object-contain" />
            ) : (
              <Store className="h-5 w-5 text-dark-gold" aria-hidden="true" />
            )}
          </div>
          <p className="font-serif text-lg font-semibold text-ink transition-colors group-hover:text-dark-gold">
            {brand.name}
          </p>
          {brand.productCount > 0 ? (
            <p className="text-sm uppercase tracking-[0.1em] text-muted-text">
              {brand.productCount} {brand.productCount === 1 ? "product" : "products"}
            </p>
          ) : null}
        </CardContent>
      </Link>
    </Card>
  );
}

export interface DirectoryGridProps<T extends { id: string }> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  items: T[];
  onRetry: () => void;
  renderItem: (item: T) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * Generic responsive card grid with the standard loading / error / empty
 * states. Used for the category and brand directories.
 */
export function DirectoryGrid<T extends { id: string }>({
  isPending,
  isError,
  error,
  items,
  onRetry,
  renderItem,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  className,
}: DirectoryGridProps<T>) {
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
      <ErrorState error={error} title="Unable to load" onRetry={onRetry} className={className} />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageX className="h-10 w-10" />}
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    );
  }

  return (
    <div
      data-testid="catalog-grid"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
      ))}
    </div>
  );
}
