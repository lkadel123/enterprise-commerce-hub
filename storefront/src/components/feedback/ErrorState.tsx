import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Prominent error state for empty slots / failed loads.
 */
export function ErrorState({
  className,
  error,
  title = "Unable to load data",
  description,
  onRetry,
  retrying = false,
  ...props
}: ErrorStateProps) {
  const message =
    description ??
    (error instanceof Error
      ? error.message
      : "We couldn't load this content. Please try again later.");

  return (
    <div className={cn("w-full", className)} {...props}>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 min-h-[44px]"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
