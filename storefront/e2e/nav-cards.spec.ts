import { expect, test, type Page } from "@playwright/test";

/**
 * REGRESSION SPEC — catalog card navigation.
 *
 * Guards the three production navigation failures:
 *   1. Category card click → /categories/<slug>
 *   2. Brand card click    → /brands/<slug>
 *   3. Product card click  → /products/<slug> (anywhere on the tile)
 * plus the product-card contract: add-to-cart / wishlist clicks never navigate.
 *
 * The SSR markup only ever shows skeletons (catalog queries are client-side
 * only), so these tests wait on real rendered grids — which also means any
 * CORS/CLIENT_ORIGIN regression that leaves pages on skeletons fails here.
 */

/** Load a listing route and wait until the client data grid has rendered. */
async function openListing(page: Page, path: string, gridId: string) {
  await page.goto(path);
  await expect(page.getByTestId(gridId)).toBeVisible({ timeout: 30_000 });
  return page.locator(`[data-testid="${gridId}"] > *`).first();
}

async function cardBox(card: ReturnType<Page["locator"]>) {
  const box = await card.boundingBox();
  expect(box, "card must have a rendered bounding box").not.toBeNull();
  return box!;
}

function urlRegex(href: string) {
  // Playwright matches `toHaveURL` regexes against the ABSOLUTE URL, so the
  // pattern must not be anchored at the string start — anchor the tail only.
  return new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

/** First card in the grid whose Add to Cart is enabled (in-stock product). */
async function firstInStockCard(page: Page, gridId: string) {
  const cards = page.locator(`[data-testid="${gridId}"] > *`);
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const btn = cards.nth(i).getByRole("button", { name: /add to cart/i });
    if ((await btn.count()) > 0 && (await btn.isEnabled())) {
      return {
        card: cards.nth(i),
        href: await cards.nth(i).locator("a[href^='/products/']").first().getAttribute("href"),
      };
    }
  }
  return null;
}

test("category card navigates to the category product listing", async ({ page }) => {
  const card = await openListing(page, "/categories", "catalog-grid");
  // The card's single anchor must target /categories/<slug>.
  const href = await card.locator("a").first().getAttribute("href");
  expect(href).toMatch(/^\/categories\/[^/]+$/);
  // Click the card CENTRE — the whole tile must be clickable, not just text.
  const box = await cardBox(card);
  await card.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page).toHaveURL(urlRegex(href!));
  // The category listing must actually load its products (not stay skeletoned).
  await expect(page.getByTestId("product-grid")).toBeVisible({ timeout: 30_000 });
});

test("brand card navigates to the brand product listing", async ({ page }) => {
  await page.goto("/brands");
  await expect(page.getByTestId("catalog-grid")).toBeVisible({ timeout: 30_000 });
  // Pick a brand that advertises products so the listing renders a real grid
  // (a zero-product brand correctly shows the empty state instead).
  const card = page
    .locator('[data-testid="catalog-grid"] > *')
    .filter({ hasText: /\d+\s+product/i })
    .first();
  await card.waitFor({ timeout: 30_000 });
  const href = await card.locator("a").first().getAttribute("href");
  expect(href).toMatch(/^\/brands\/[^/]+$/);
  const box = await cardBox(card);
  await card.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page).toHaveURL(urlRegex(href!));
  await expect(page.getByTestId("product-grid")).toBeVisible({ timeout: 30_000 });
});

test("product card navigates from the image area AND from the price row (old dead zone)", async ({
  page,
}) => {
  const card = await openListing(page, "/products", "product-grid");
  const href = await card.locator("a").first().getAttribute("href");
  expect(href).toMatch(/^\/products\/[^/]+$/);

  // 1) Click inside the IMAGE area (25% height).
  let box = await cardBox(card);
  await card.click({ position: { x: box.width / 2, y: box.height * 0.25 } });
  await expect(page).toHaveURL(urlRegex(href!));
  // Detail page marker: the product heading (works for out-of-stock too).
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });

  // 2) Back to the listing; find the LOWEST card point that still resolves to
  //    the product anchor — i.e. the price row that was dead when the
  //    stretched link was mispositioned. Buttons correctly never resolve.
  await page.goto("/products");
  await expect(page.getByTestId("product-grid")).toBeVisible({ timeout: 30_000 });
  const card2 = page.locator('[data-testid="product-grid"] > *').first();
  const hit = await card2.evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    for (let frac = 0.95; frac > 0.3; frac -= 0.05) {
      const el2 = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height * frac,
      );
      const anchor = el2?.closest("a");
      if (anchor) return { frac, href: anchor.getAttribute("href") };
    }
    return null;
  });
  expect(hit, "some point below the card middle must hit the product link").not.toBeNull();
  expect(hit!.href).toMatch(/^\/products\//);
  expect(
    hit!.frac,
    "the clickable point must be in the LOWER card half (price row)",
  ).toBeGreaterThan(0.5);
  box = await cardBox(card2);
  await card2.click({ position: { x: box.width / 2, y: box.height * hit!.frac } });
  await expect(page).toHaveURL(/\/products\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
});

test("add to cart from the product listing does NOT navigate", async ({ page }) => {
  await openListing(page, "/products", "product-grid");
  // Use an in-stock card so the button is enabled.
  const stock = await firstInStockCard(page, "product-grid");
  test.skip(!stock, "no in-stock product available");
  const addButton = stock!.card.getByRole("button", { name: /add to cart/i });
  await expect(addButton).toBeEnabled({ timeout: 30_000 });
  await addButton.click();
  // Give any accidental navigation time to happen — the URL must not change.
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).pathname).toBe("/products");
});

test("wishlist toggle from the product listing does NOT navigate to a product page", async ({
  page,
}) => {
  await openListing(page, "/products", "product-grid");
  const wishlist = page.getByRole("button", { name: /add to wishlist/i }).first();
  await expect(wishlist).toBeVisible({ timeout: 30_000 });
  await wishlist.click();
  // Guests are intentionally routed to /login?redirect=/products (auth-gated
  // wishlist). What must NEVER happen is navigation to a product detail page.
  await page.waitForTimeout(1500);
  const pathname = new URL(page.url()).pathname;
  expect(pathname === "/products" || pathname === "/login").toBe(true);
  expect(pathname).not.toMatch(/^\/products\/[^/]+$/);
});

test("product detail supports direct URL, refresh, back and forward", async ({ page }) => {
  await openListing(page, "/products", "product-grid");
  const stock = await firstInStockCard(page, "product-grid");
  test.skip(!stock, "no in-stock product available");
  const href = stock!.href;
  expect(href).toMatch(/^\/products\/[^/]+$/);

  // Direct load + refresh must both render the detail page.
  await page.goto(href!);
  const addButton = page.getByRole("button", { name: /add to cart/i }).first();
  await expect(addButton).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(addButton).toBeVisible({ timeout: 30_000 });

  // Back → listing, forward → detail again.
  await page.goBack();
  await expect(page).toHaveURL(/\/products\/?$/);
  await expect(page.getByTestId("product-grid")).toBeVisible({ timeout: 30_000 });
  await page.goForward();
  await expect(page).toHaveURL(urlRegex(href!));
  await expect(addButton).toBeVisible({ timeout: 30_000 });
});

test("nonexistent product shows the not-found UI, never a blank page", async ({ page }) => {
  await page.goto("/products/definitely-not-a-real-product");
  await expect(page.getByText(/doesn't exist|no longer available|not found/i).first()).toBeVisible({
    timeout: 30_000,
  });
});
