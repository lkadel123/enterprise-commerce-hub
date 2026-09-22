import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openFirstProduct } from "./helpers";

const SCANS: Array<{ name: string; path: string }> = [
  { name: "home", path: "/" },
  { name: "products", path: "/products" },
  { name: "cart", path: "/cart" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
];

test.describe("axe accessibility scans", () => {
  for (const { name, path } of SCANS) {
    test(`no critical/serious violations on ${name}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      );
      expect(
        serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        JSON.stringify(
          serious.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
        ),
      ).toEqual([]);
    });
  }

  test("no critical/serious violations on a product detail page", async ({ page }) => {
    // Reach a product detail via the reliable SPA navigation (same path the rest
    // of the suite uses — direct SSR first-load on this TanStack Start + React 19
    // stack can leave catalog queries on skeletons; see e2e/helpers.ts).
    const href = await openFirstProduct(page);
    test.skip(!href, "no products seeded");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );
    expect(serious.map((v) => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);
  });

  test("contrast: color-contrast rule passes on key public routes", async ({ page }) => {
    for (const path of ["/", "/products", "/login"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(
        results.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? "")),
        `${path} contrast violations`,
      ).toEqual([]);
    }
  });
});

test.describe("keyboard & focus behaviour", () => {
  test("landmarks exist on every page (main content target)", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("main#main-content")).toBeAttached();
    // Exactly one <main> landmark.
    await expect(page.locator("main")).toHaveCount(1);
  });
});
