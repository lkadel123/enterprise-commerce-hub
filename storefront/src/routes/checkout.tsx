import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { CheckoutPage } from "@/features/checkout/CheckoutPage";

export const Route = createFileRoute("/checkout")({
  head: () => {
    const base = pageHead({
      title: "Checkout — NASB",
      description: "Complete your purchase.",
      path: "/checkout",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: CheckoutRoute,
});

function CheckoutRoute() {
  return <CheckoutPage />;
}
