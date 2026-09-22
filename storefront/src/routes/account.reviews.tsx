import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateLabel } from "@/components/common/DateLabel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { useMyReviewsQuery } from "@/features/account/account-hooks";

/**
 * `/account/reviews` — the customer's own submitted reviews.
 *
 * Shows moderation status exactly as exposed by the backend DTO
 * (`Approved` / `Pending` / `Rejected` / `Hidden`). No admin features.
 */
export const Route = createFileRoute("/account/reviews")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const [page, setPage] = useState(1);
  const reviews = useMyReviewsQuery(page);
  const meta = reviews.data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">My reviews</h2>

      {reviews.isPending ? (
        <div role="status">
          <LoadingSkeleton count={2} />
        </div>
      ) : reviews.isError ? (
        <ErrorState
          error={reviews.error}
          title="Unable to load your reviews"
          onRetry={() => void reviews.refetch()}
        />
      ) : reviews.data.items.length === 0 ? (
        <EmptyState
          icon={<Star className="h-10 w-10" />}
          title="No reviews yet"
          description="Reviews you submit for purchased products will appear here."
        />
      ) : (
        <>
          <ul className="space-y-4">
            {reviews.data.items.map((review) => (
              <li key={review.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words font-medium">
                    {review.product ? review.product.name : "Product"}
                  </p>
                  <Badge
                    variant={
                      review.status === "Approved"
                        ? "secondary"
                        : review.status === "Pending"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {review.status}
                  </Badge>
                </div>
                <p aria-label={`Rated ${review.rating} out of 5`} className="mt-1 text-sm">
                  {"★".repeat(review.rating)}
                  <span className="text-muted-foreground">{"☆".repeat(5 - review.rating)}</span>
                </p>
                {review.title ? (
                  <p className="mt-2 break-words font-medium">{review.title}</p>
                ) : null}
                <p className="mt-1 break-words text-sm text-muted-foreground">{review.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted <DateLabel date={review.createdAt} />
                </p>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav aria-label="Review pages" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
