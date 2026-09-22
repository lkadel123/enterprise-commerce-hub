import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { PaginationMeta } from "@/types";

export interface PaginationBarProps {
  meta?: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
}

/**
 * Server-driven pagination controls. Renders prev/next plus a window of page
 * links, and invokes `onPageChange` so the owning route can update the URL.
 */
export function PaginationBar({ meta, onPageChange }: PaginationBarProps) {
  if (!meta || meta.totalPages <= 1) return null;

  const current = meta.page;
  const total = meta.totalPages;

  function pageNumbers(): Array<number | "ellipsis"> {
    const pages: Array<number | "ellipsis"> = [];
    for (let i = 1; i <= total; i += 1) {
      if (i === 1 || i === total || Math.abs(i - current) <= 1) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "ellipsis") {
        pages.push("ellipsis");
      }
    }
    return pages;
  }

  return (
    <Pagination aria-label="Products pagination">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (current > 1) onPageChange(current - 1);
            }}
            className={current <= 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {pageNumbers().map((page, index) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                isActive={page === current}
                onClick={(event) => {
                  event.preventDefault();
                  if (page !== current) onPageChange(page);
                }}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (current < total) onPageChange(current + 1);
            }}
            className={current >= total ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
