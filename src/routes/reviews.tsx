import { createFileRoute } from "@tanstack/react-router";
import { Check, EyeOff, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Section, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { reviews } from "@/lib/mock-data";

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

const distribution = [
  { stars: 5, count: 1842 },
  { stars: 4, count: 964 },
  { stars: 3, count: 318 },
  { stars: 2, count: 142 },
  { stars: 1, count: 86 },
];

function ReviewsPage() {
  const total = distribution.reduce((s, d) => s + d.count, 0);

  return (
    <AppShell>
      <PageHeader title="Reviews" description="Moderate customer feedback before it reaches the storefront." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Rating overview" description={`${total.toLocaleString()} published reviews`}>
          <div className="flex items-baseline gap-2">
            <p className="num text-3xl font-semibold">4.42</p>
            <span className="inline-flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-4 w-4 ${i <= 4 ? "fill-warning text-warning" : "text-border"}`} />
              ))}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {distribution.map((d) => (
              <li key={d.stars} className="flex items-center gap-2 text-xs">
                <span className="num w-8">{d.stars}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${(d.count / total) * 100}%` }} />
                </div>
                <span className="num w-12 text-right text-muted-foreground">{d.count}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section className="xl:col-span-2" title="Moderation queue" bodyClassName="p-0" description="Newest submissions first">
          <ul className="divide-y">
            {reviews.map((r) => (
              <li key={r.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num inline-flex items-center gap-1 text-sm font-semibold">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />{r.rating}.0
                      </span>
                      <p className="truncate text-sm font-medium">{r.product}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{r.body}</p>
                    <p className="num mt-1 text-xs text-muted-foreground">{r.customer} · {r.date} · {r.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toast.success(`${r.id} approved`)}>
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toast.success(`${r.id} rejected`)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toast.success(`${r.id} hidden`)}>
                      <EyeOff className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toast.error(`${r.id} deleted`)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
