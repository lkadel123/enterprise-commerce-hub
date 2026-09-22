import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Label read by assistive tech describing the in-progress state. */
  label?: string;
}

/**
 * Full-viewport loader shown while a top-level route is loading.
 * Uses a pure-CSS spinner (no JS animation loop and no LayoutEffect), so it is
 * safe to render during SSR and hydration.
 */
export function PageLoader({ className, label = "Loading…", ...props }: PageLoaderProps) {
  return (
    <div
      aria-live="polite"
      aria-label={label}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center gap-3 bg-background/70 backdrop-blur-sm",
        className,
      )}
      {...props}
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden="true"
      />
      {/* Full `text-foreground` (not muted) — the label sits on a translucent
          overlay blended with arbitrary page content, so muted-foreground can
          fail WCAG AA contrast depending on what is underneath. */}
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
