import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openFirstProduct } from "./helpers";

test("tmp: dump color-contrast violation details on product detail", async ({ page }) => {
  const href = await openFirstProduct(page);
  console.log("[tmp] product:", href);
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  for (const v of results.violations) {
    for (const n of v.nodes) {
      console.log("[tmp] violation:", v.id, v.impact, "target:", JSON.stringify(n.target));
      console.log("[tmp] html:", n.html.slice(0, 300));
      console.log("[tmp] summary:", n.failureSummary?.slice(0, 400));
    }
  }
});
