import * as React from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export interface RatingStarsProps {
  /** Numeric rating (0–5). */
  value: number;
  /** Optional review count rendered next to the stars. */
  count?: number;
  className?: string;
}

/**
 * Read-only star rating. Uses a half-star for fractional values and includes a
 * visually hidden numeric label for screen readers (color is not the only cue).
 */
export function RatingStars({ value, count, className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const whole = Math.floor(clamped);
  const hasHalf = clamped - whole >= 0.25 && clamped - whole < 0.75;
  const filled = Math.round(clamped);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={`Rated ${clamped.toFixed(1)} out of 5${count != null ? ` (${count} reviews)` : ""}`}
    >
      <span className="inline-flex items-center" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => {
          const position = i + 1;
          const isFull = position <= filled;
          const isHalf = position === whole + 1 && hasHalf;
          return (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                isFull || isHalf ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
            />
          );
        })}
      </span>
      {count != null ? <span className="text-sm text-muted-foreground">({count})</span> : null}
    </span>
  );
}
