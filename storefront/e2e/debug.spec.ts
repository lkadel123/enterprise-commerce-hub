import { test } from "@playwright/test";

test("SSR direct render probe", async ({ page }) => {
  await page.goto("/products");
  await page.waitForTimeout(12000);
  const grid = await page.evaluate(
    () => document.querySelectorAll("[data-testid=product-grid]").length,
  );
  const skel = await page.evaluate(() => document.querySelectorAll(".animate-pulse").length);
  console.log("GRID=" + grid + " SKEL=" + skel);
});
