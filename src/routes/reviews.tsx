import { createFileRoute } from "@tanstack/react-router";
import { Check, EyeOff, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AdminApiError } from "@/lib/api/client";
import { reviewsApi } from "@/lib/api/catalog";
import type { ReviewStatus } from "@/lib/api/types";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Northpeak Commerce Console" },
      {
        name: "description",
        content: "Moderate product reviews, approve or reject submissions and monitor rating distribution.",
      },
      { property: "og:title", content: "Reviews — Northpeak Commerce Console" },
      { property: "og:description", content: "Review moderation queue with rating analytics." },
    ],
  }),
  component: ReviewsPage,
});

const STATUS_FILTERS = ["All", "Pending", "Approved", "Rejected", "Hidden"] as const;

function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const listQuery = reviewsApi.useList({
    ...(statusFilter !== "All" ? { status: statusFilter } : {}),
    pageSize: 50,
  });
  const statsQuery = reviewsApi.useStats();
  const setStatus = reviewsApi.useSetStatus();
  const removeReview = reviewsApi.useRemove();

  const reviews = listQuery.data ?? [];
  const stats = statsQuery?.data;
  const total = stats?.total ?? 0;

  const act = (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => toast.success(success))
      .catch((e: unknown) => toast.error(e instanceof AdminApiError ? e.message : "Action failed"));
  };

  return (
    <AppShell>
      <PageHeader title="Reviews" description="Moderate customer feedback before it reaches the storefront." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Rating overview" description={stats ? `${total.toLocaleString()} approved reviews` : "Loading…"}>
          {stats ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="num text-3xl font-semibold">{stats.average.toFixed(2)}</p>
                <span className="inline-flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={`h-4 w-4 ${i <= Math.round(stats.average) ? "fill-warning text-warning" : "text-border"}`} />
                  ))}
                </span>
              </div>
              <p className="num mt-1 text-xs text-muted-foreground">{stats.pending} pending moderation</p>
              <ul className="mt-4 space-y-2">
                {stats.distribution.map((d) => (
                  <li key={d.stars} className="flex items-center gap-2 text-xs">
                    <span className="num w-8">{d.stars}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${total > 0 ? (d.count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="num w-12 text-right text-muted-foreground">{d.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : statsQuery ? (
            <div className="h-24 animate-pulse rounded-md bg-surface-muted" />
          ) : (
            <p className="text-sm text-destructive">Couldn't load review stats.</p>
          )}
        </Section>

        <Section className="xl:col-span-2" title="Moderation queue" bodyClassName="p-0" description="Filter by moderation status">
          <div className="flex flex-wrap gap-1.5 border-b p-3">
            {STATUS_FILTERS.map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          {listQuery.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded bg-surface-muted" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <p className="p-4 text-sm text-destructive">Couldn't load reviews. Check your connection and try again.</p>
          ) : reviews.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No reviews match this filter.</p>
          ) : (
          <ul className="divide-y">
            {reviews.map((r) => (
              <li key={r.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num inline-flex items-center gap-1 text-sm font-semibold">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />{r.rating}.0
                      </span>
                      <p className="truncate text-sm font-medium">{r.product?.name ?? "Unknown product"}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.title && <p className="mt-1 text-sm font-medium">{r.title}</p>}
                    <p className="mt-1.5 text-sm text-muted-foreground">{r.body}</p>
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {r.customer?.name ?? "Unknown customer"} · {new Date(r.createdAt).toLocaleDateString()} · {r.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="outline" size="icon" className="h-8 w-8" aria-label="Approve review"
                      disabled={r.status === "Approved" || setStatus.isPending}
                      onClick={() => act(() => setStatus.mutateAsync({ id: r.id, status: "Approved" }), "Review approved")}
                    >
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8" aria-label="Reject review"
                      disabled={r.status === "Rejected" || setStatus.isPending}
                      onClick={() => act(() => setStatus.mutateAsync({ id: r.id, status: "Rejected" }), "Review rejected")}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8" aria-label="Hide review"
                      disabled={r.status === "Hidden" || setStatus.isPending}
                      onClick={() => act(() => setStatus.mutateAsync({ id: r.id, status: "Hidden" }), "Review hidden")}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8" aria-label="Delete review"
                      disabled={removeReview.isPending}
                      onClick={() => act(() => removeReview.mutateAsync(r.id), "Review deleted")}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
