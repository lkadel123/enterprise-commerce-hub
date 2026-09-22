import type { PaginationMeta } from "./ApiResponse.js";

export interface ResolvedPagination {
  page: number;
  pageSize: number;
  skip: number;
  limit: number;
}

export type SortMap = Record<string, 1 | -1>;

/**
 * Returns a positive integer for a numeric value or a numeric string, otherwise null.
 * Express parses query params as strings, so `parsePagination` must tolerate
 * numeric strings as well as numbers.
 */
function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function parsePagination(
  query: { page?: unknown; pageSize?: unknown },
  defaultPageSize = 10,
  maxPageSize = 100,
): ResolvedPagination {
  const page = toPositiveInt(query.page) ?? 1;
  const requestedPageSize = toPositiveInt(query.pageSize);
  const pageSize =
    requestedPageSize === null ? defaultPageSize : Math.min(requestedPageSize, maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

export function paginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Parses a `sort=field` / `sort=-field` query param against an allowlist of
 * fields. Returns an empty object when the field is not allowlisted.
 */
export function parseSort(sort: unknown, allowed: readonly string[]): SortMap {
  if (typeof sort !== "string" || sort.trim() === "") return {};
  const [field, dir] = sort.split(",");
  const rawField = field ?? "";
  const descending = dir === "desc" || rawField.startsWith("-");
  const cleanField = rawField.replace(/^-/, "");
  if (!allowed.includes(cleanField)) return {};
  return { [cleanField]: descending ? -1 : 1 };
}
