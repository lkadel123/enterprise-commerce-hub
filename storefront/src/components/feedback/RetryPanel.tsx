import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export interface RetryPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Error/error-like object to extract a message from (optional). */
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Inline error state with a retry affordance. Reuses Skeleton for a
 * non-animated fallback and Button for the retry control.
 */
export function RetryPanel({
  className,
  error,
  title = "Something went wrong",
  description,
  onRetry,
  retrying = false,
  ...props
}: RetryPanelProps) {
  const message = description ?? (error instanceof Error ? error.message : "Please try again.");

  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 text-center", className)}
      {...props}
    >
      <Skeleton className="h-10 w-10 rounded-full" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
    </div>
  );
}
