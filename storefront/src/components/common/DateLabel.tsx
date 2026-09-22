import * as React from "react";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";

import { cn } from "@/lib/utils";

export interface DateLabelProps extends React.HTMLAttributes<HTMLTimeElement> {
  /** ISO date string, epoch ms number, or Date. */
  date: string | number | Date;
  /** If true (default) and the date is today/yesterday, shows a relative label. */
  relative?: boolean;
}

const toDate = (value: string | number | Date): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return parseISO(value);
};

/**
 * Renders a machine-readable `<time>` with a human-friendly date label.
 * SSR-safe: `date-fns` performs no browser-only work. Relative labels fall back
 * to an absolute format when the date cannot be resolved.
 */
export function DateLabel({ date, relative = true, className, ...props }: DateLabelProps) {
  let parsed: Date;
  try {
    parsed = toDate(date);
  } catch {
    parsed = new Date(date);
  }

  const isValid = !Number.isNaN(parsed.getTime());

  let label: string;
  if (!isValid) {
    label = "Invalid date";
  } else if (relative && isToday(parsed)) {
    label = formatDistanceToNow(parsed, { addSuffix: true });
  } else if (relative && isYesterday(parsed)) {
    label = "Yesterday";
  } else {
    label = format(parsed, "MMM d, yyyy");
  }

  const iso = isValid ? parsed.toISOString() : undefined;

  return (
    <time dateTime={iso} className={cn("text-sm text-muted-foreground", className)} {...props}>
      {label}
    </time>
  );
}
