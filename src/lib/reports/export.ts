import type { RevenuePointDto } from "@/lib/api/types";

/**
 * Builds a CSV document from authoritative `/reports/revenue` points.
 * The rows are exactly the server-aggregated values — no client-side
 * recomputation of business metrics.
 */
export function buildReportCsv(points: RevenuePointDto[]): string {
  const escape = (value: string | number): string => {
    const raw = String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  const header = "period,revenue,profit,orders";
  const rows = points.map((p) => [p.key, p.revenue, p.profit, p.orders].map(escape).join(","));
  return [header, ...rows].join("\n");
}

/** Triggers a client-side CSV download of the given report contents. */
export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
