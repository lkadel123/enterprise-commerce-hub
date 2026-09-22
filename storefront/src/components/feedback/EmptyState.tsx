import * as React from "react";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string | undefined;
  description?: string | undefined;
  action?: React.ReactNode;
}

/**
 * Centered empty-state: icon, title, description, and an optional action.
 * Presentation-only; the consumer supplies any links/buttons via `action`.
 */
export function EmptyState({
  className,
  icon,
  title = "Nothing here yet",
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div aria-hidden="true" className="text-muted-foreground">
        {icon ?? <Package className="h-10 w-10" />}
      </div>
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export const EmptyStateAction = Button;
