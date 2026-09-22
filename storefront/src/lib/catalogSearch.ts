/**
 * Shared catalog URL search-state parsing.
 *
 * The backend contract (verified from `public-catalog`): products support
 * `q`, `category` (slug or id), `brand` (slug or id), `sort` (allowlist with
 * `-field` support), `page` and `pageSize`. Price range / stock / multi-select
 * filters are NOT supported by the backend — the URL deliberately omits them.
 */

export interface CatalogSearchParams {
  q?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  sort?: string | undefined;
  page?: number | undefined;
}

function optionalString(search: Record<string, unknown>, key: string): string | undefined {
  const value = search[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Parse TanStack Router search params into a typed catalog filter object. */
export function parseCatalogSearch(search: Record<string, unknown>): CatalogSearchParams {
  const result: CatalogSearchParams = {};

  const q = optionalString(search, "q");
  if (q !== undefined) result.q = q;

  const category = optionalString(search, "category");
  if (category !== undefined) result.category = category;

  const brand = optionalString(search, "brand");
  if (brand !== undefined) result.brand = brand;

  const sort = optionalString(search, "sort");
  if (sort !== undefined) result.sort = sort;

  const rawPage = search["page"];
  const num =
    typeof rawPage === "number"
      ? rawPage
      : typeof rawPage === "string"
        ? Number(rawPage)
        : Number.NaN;
  if (Number.isInteger(num) && num > 0) result.page = num;

  return result;
}
