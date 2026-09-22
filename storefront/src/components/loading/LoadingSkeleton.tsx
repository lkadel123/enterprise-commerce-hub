import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Inline skeleton loader for card-based lists (e.g. product grids).
 * Renders a configurable number of placeholder cards. Presentation-only.
 */
export interface LoadingSkeletonProps {
  /** Number of placeholder lines/rows to render. */
  count?: number;
  /** When true, renders card-style placeholders; otherwise text lines. */
  card?: boolean;
  className?: string;
}

export function LoadingSkeleton({ count = 4, card = false, className }: LoadingSkeletonProps) {
  const items = Array.from({ length: count });
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4",
        card && "flex-row flex-wrap items-start gap-4",
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      {items.map((_, i) => (
        <React.Fragment key={i}>
          {card ? (
            <div className="flex w-full max-w-[260px] flex-col gap-3">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <Skeleton className="h-4 w-full" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
