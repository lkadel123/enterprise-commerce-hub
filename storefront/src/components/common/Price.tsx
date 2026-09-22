import * as React from "react";

import { cn, formatNpr } from "@/lib/utils";

export interface PriceProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Monetary value, in the smallest currency unit already converted to a float
   * (e.g. `1299.00` for NPR 1,299.00). The storefront NEVER computes prices —
   * it only renders backend-supplied values via `formatNpr`.
   */
  value: number;
  /** Render the value as screen-reader-only (visually hidden). */
  srOnly?: boolean;
}

/**
 * Formats a backend-supplied NPR price. No discount/tax/shipping math is
 * performed here — callers pass the final amount returned by the API.
 */
export function Price({ value, srOnly = false, className, ...props }: PriceProps) {
  const formatted = formatNpr(value);
  return (
    <span
      className={cn("num font-medium tabular-nums text-foreground", srOnly && "sr-only", className)}
      {...props}
    >
      {formatted}
    </span>
  );
}
