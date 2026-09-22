import * as React from "react";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { cn } from "@/lib/utils";

export interface NotFoundStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Not-found state for a missing resource (e.g. product, category or brand that
 * the backend could not resolve). Reuses EmptyState with a clear icon and an
 * optional recovery action (typically a link back to the related directory).
 */
export function NotFoundState({
  title = "Not found",
  description = "This item doesn't exist or is no longer available.",
  action,
  className,
  ...props
}: NotFoundStateProps) {
  return (
    <EmptyState
      icon={<SearchX className="h-10 w-10" />}
      title={title}
      description={description}
      action={action}
      className={cn("min-h-[40vh] justify-center", className)}
      {...props}
    />
  );
}
