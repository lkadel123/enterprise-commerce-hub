import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a backend-supplied NPR amount — identical to the storefront's
 * `formatNpr` so both apps render the same monetary values.
 */
export function formatNpr(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `रू ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact NPR for chart axes / large KPI values (e.g. रू 12.4L). */
export function formatNprCompact(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n) >= 10_000_000) return `रू ${(n / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100_000) return `रू ${(n / 100_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `रू ${(n / 1_000).toFixed(1)}k`;
  return `रू ${n.toFixed(0)}`;
}
