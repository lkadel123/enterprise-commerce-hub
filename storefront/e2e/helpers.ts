import { expect, type Page } from "@playwright/test";

/**
 * E2E navigation helpers for the storefront.
 *
 * The storefront SSRs every route, but catalog react-query queries are
 * intentionally client-side only (enabled: !isSsr() in lib/query-client.ts).
 * The server markup therefore shows loading skeletons, and every visible card
 * is rendered only after hydration once the browser fetches the catalog API.
 *
 * Those fetches are cross-origin, so the storefront origin MUST be listed in
 * the backend CLIENT_ORIGIN allow-list (backend/scripts/e2e-server.mts sets it
 * for :8090/:3000). If it is not, every fetch is CORS-blocked, listing pages
 * stay on skeletons forever, and the app presents as "cards visible but not
 * clickable". The helpers below wait on real rendered UI (grids, buttons) that
 * only exists once client data has actually loaded, so such regressions fail
 * loudly instead of shipping.
 */

/** Load the app shell (the homepage) and wait for it to settle. */
export async function appHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /nasb/i }).first()).toBeVisible();
}

/** Reach /products via the header nav link (SPA navigation). */
export async function goToProducts(page: Page): Promise<void> {
  await appHome(page);
  await page
    .getByRole("link", { name: /^products$/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/products/);
  await expect(page.getByTestId("product-grid")).toBeVisible({ timeout: 25_000 });
}

/** Open the first product card (reached via /products). Returns its slug path. */
export async function openFirstProduct(page: Page): Promise<string> {
  await goToProducts(page);
  // The product card exposes exactly ONE anchor — a stretched link whose
  // invisible ::after cover makes the entire tile clickable (image, name,
  // price row). If this selector ever needs to skip to nth(1) again, the
  // single-anchor card contract has regressed.
  const cardLink = page.locator('a[href^="/products/"]').first();
  const href = await cardLink.getAttribute("href");
  expect(href).toBeTruthy();
  await cardLink.click();
  await expect(page).toHaveURL(new RegExp(href as string));
  await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible({
    timeout: 25_000,
  });
  return href as string;
}

/** Add the first product to the cart (SPA flow). Returns the product path. */
export async function addFirstProductToCart(page: Page): Promise<string> {
  const href = await openFirstProduct(page);
  await page
    .getByRole("button", { name: /add to cart/i })
    .first()
    .click();
  // Explicit confirmation: the cart mutation actually completed before any
  // further navigation (10s — the toast is near-instant when healthy).
  await expect(page.getByText(/added to cart/i)).toBeVisible({ timeout: 10_000 });
  return href;
}

/** Reach /cart via the header nav link (SPA navigation). */
export async function goToCart(page: Page): Promise<void> {
  await appHome(page);
  await page
    .getByRole("link", { name: /^cart$/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cart/);
  // The cart query is server-backed and resolves after hydration: wait until
  // it has completed AND contains an item (a product link). An empty or still
  // loading cart must never be treated as ready for checkout.
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible({
    timeout: 25_000,
  });
}

/** Reach /checkout via the cart page's proceed link (SPA navigation). */
export async function goToCheckout(page: Page): Promise<void> {
  await goToCart(page);
  // Wait for the proceed link itself: it only renders once the server-backed
  // cart query has resolved with items (the checkout flow depends on it).
  const proceed = page.getByRole("link", { name: /proceed to checkout/i }).first();
  await expect(proceed).toBeVisible({ timeout: 25_000 });
  await proceed.click();
  await expect(page).toHaveURL(/\/checkout/);
}

/** Reach /account/orders via the authed header + account sidebar (SPA navigation). */
export async function goToAccountOrders(page: Page): Promise<void> {
  await appHome(page);
  // Authenticated header shows the customer name linked to /account, so click
  // the account link by its stable href rather than an accessible-name regex.
  await page.locator('a[href="/account"]').first().click();
  await expect(page).toHaveURL(/\/account(\/|$)/);
  await page
    .getByRole("link", { name: /^orders$/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/account\/orders/);
}
