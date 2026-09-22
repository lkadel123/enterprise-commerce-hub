import { DateLabel } from "@/components/common/DateLabel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { RatingStars } from "@/features/catalog/RatingStars";
import type { PublicReviewDto } from "@/types";

export interface ReviewsView {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  items: PublicReviewDto[];
  onRetry: () => void;
}

function ReviewItem({ review }: { review: PublicReviewDto }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <RatingStars value={review.rating} />
        <DateLabel date={review.createdAt} />
      </div>
      {review.title ? <p className="font-medium text-foreground">{review.title}</p> : null}
      <p className="text-sm text-muted-foreground">{review.body}</p>
      <p className="text-xs text-muted-foreground">
        {review.customer?.name ?? "Verified customer"}
        {review.helpfulCount > 0 ? ` · ${review.helpfulCount} found this helpful` : ""}
      </p>
    </li>
  );
}

/** Approved, public reviews for a product (read-only in the storefront). */
export function ReviewsSection({ reviews }: { reviews: ReviewsView }) {
  if (reviews.isLoading) return <LoadingSkeleton count={3} />;
  if (reviews.isError) {
    return (
      <ErrorState error={reviews.error} title="Unable to load reviews" onRetry={reviews.onRetry} />
    );
  }
  if (reviews.items.length === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews appear here once approved. You can share your own after a qualifying purchase."
      />
    );
  }
  return (
    <ul className="space-y-4">
      {reviews.items.map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
    </ul>
  );
}
