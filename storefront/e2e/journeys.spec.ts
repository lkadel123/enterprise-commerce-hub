import { expect, test, type Page } from "@playwright/test";
import {
  addFirstProductToCart,
  goToCart,
  goToCheckout,
  goToProducts,
  goToAccountOrders,
  openFirstProduct,
} from "./helpers";

/**
 * P0 customer journeys (Phase 11) against the REAL storefront + seeded test
 * backend. Cybersource Unified Checkout is mocked at the network boundary —
 * the test backend answers the Cybersource Sessions API + public-key endpoints
 * in-process and a fake client library (routed from flex.cybersource.com to
 * `/mock-cybersource/uc.js`) auto-completes with a properly signed response
 * token. No real gateway traffic occurs.
 *
 * Catalog/cart/checkout/account pages are reached through the in-app SPA links
 * (see e2e/helpers.ts) because the hydrated first route on this TanStack
 * Start + React 19 stack can leave react-query observers un-subscribed on
 * direct URL loads; the SPA navigation path is the reliable real-user flow.
 */

const RUN = `e2e-${Date.now()}`;
const EMAIL = `${RUN}@test.com`;
const PASSWORD = "Testpass123!";

async function registerViaUi(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Runner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // The backend enforces Terms & Conditions acceptance (acceptedTerms must be
  // literally true) — tick the consent checkbox before submitting.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account/);
}

async function loginViaUi(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/account/);
}

async function logoutViaUi(page: Page) {
  await page.goto("/account");
  await page
    .getByRole("button", { name: /sign out/i })
    .first()
    .click();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
}

test.describe.serial("P0 auth journeys", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("register creates an account and signs the customer in", async () => {
    await registerViaUi(page);
    await page
      .getByRole("button", { name: /sign out/i })
      .first()
      .waitFor();
  });

  test("logout ends the session", async () => {
    await logoutViaUi(page);
  });

  test("login restores the session", async () => {
    await loginViaUi(page);
  });
});

test.describe("catalog browsing", () => {
  test("home renders the brand link", async ({ page }) => {
    await page.goto("/");
    // Scoped to the page banner: the brand name also appears outside the
    // header (e.g. footer), which made the unscoped query ambiguous.
    await expect(page.getByRole("banner").getByRole("link", { name: /nasb/i })).toBeVisible();
  });

  test("products grid lists products with prices", async ({ page }) => {
    await goToProducts(page);
    await expect(page.getByText(/रू/).first()).toBeVisible();
  });

  test("product details show price and add-to-cart", async ({ page }) => {
    await openFirstProduct(page);
    await expect(page.getByText(/रू/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
  });
});

test.describe("guest to authenticated cart merge", () => {
  test("a guest cart is merged into the account after login", async ({ page, request }) => {
    // Self-contained: register a dedicated account through the API so this
    // test never depends on the P0 auth suite, another browser context, or
    // module-level account state.
    const email = `cart-${Date.now()}@test.com`;
    const registration = await request.post("http://localhost:4000/api/v1/auth/customer/register", {
      data: {
        name: "Cart Merge Runner",
        email,
        password: PASSWORD,
        acceptedTerms: true,
      },
    });
    expect(registration.ok()).toBeTruthy();

    // As a guest: add an item from a product page (local guest cart).
    const href = await openFirstProduct(page);
    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();
    await expect(page.getByText(/added to cart/i)).toBeVisible();

    // Sign in — the local cart should merge into the server cart.
    await page.goto(`/login?redirect=${encodeURIComponent(href)}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(new RegExp(href.replace("?", "\\?")));

    await goToCart(page);
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });
});

async function fillAddressAndContinue(page: Page, line1: string, city: string) {
  await goToCheckout(page);
  await page.getByLabel("Address line 1").fill(line1);
  await page.getByLabel("City").fill(city);
  await page.getByLabel("Postal code").fill("44600");
  await page.getByRole("button", { name: /continue to payment/i }).click();
}

test.describe.serial("checkout journeys", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Register and sign in a dedicated account for checkout journeys so this
    // block has no implicit dependency on the P0 auth serial block having run.
    const RUN_ID = `checkout-${Date.now()}`;
    const checkoutEmail = `${RUN_ID}@test.com`;
    await registerViaUi(page, checkoutEmail, PASSWORD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("COD checkout places an order and shows confirmation + history", async () => {
    await addFirstProductToCart(page); // waits for the "Added to cart" confirmation.

    // fillAddressAndContinue routes through goToCheckout, which explicitly
    // verifies the server-backed cart contains a product before checkout.
    await fillAddressAndContinue(page, "12 E2E Road", "Kathmandu");
    await page.getByRole("radio", { name: /cash on delivery/i }).check();
    await page.getByRole("button", { name: /review order/i }).click();
    await page.getByRole("button", { name: /place order/i }).click();

    await expect(page).toHaveURL(/order-confirmation/, { timeout: 20_000 });
    await expect(page.getByText(/order placed|thank you|payment/i).first()).toBeVisible();

    // Order history and detail.
    await goToAccountOrders(page);
    const detailLink = page.locator('a[href^="/account/orders/"]').first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(page.getByText(/ORD-/).first()).toBeVisible();
  });

  test("card checkout completes via the mocked Cybersource checkout and is verified", async () => {
    // NOTE: intentionally uses the serial block's shared `page` (registered
    // account from beforeAll). Declaring `{ page }` here would shadow it with
    // a fresh fixture page — a guest context with no session — and the cart
    // page then renders the guest state with no "Proceed to checkout" link.
    test.info().annotations.push({
      type: "note",
      description:
        "Cybersource mocked at the network boundary by the test backend (Sessions API + public keys in-process, client library via flex.cybersource.com route). No real gateway traffic.",
    });
    // Serve the local fake Unified Checkout client library under the real
    // flex.cybersource.com URL the capture context advertises — the storefront
    // allowlist is exercised unchanged while no network call leaves the host.
    const fakeLibraryResponse = await page.request.get(
      "http://localhost:4000/mock-cybersource/uc.js",
    );
    const fakeLibrary = await fakeLibraryResponse.text();
    await page.route("https://flex.cybersource.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fakeLibrary,
      }),
    );

    await addFirstProductToCart(page); // waits for the "Added to cart" confirmation.

    // No state from the COD test above is relied on: this test adds its own
    // product, and fillAddressAndContinue → goToCheckout explicitly verifies
    // the server-backed cart contains a product before checkout.
    await fillAddressAndContinue(page, "13 Gateway Way", "Lalitpur");
    await page.getByRole("radio", { name: /credit \/ debit card/i }).check();
    await page.getByRole("button", { name: /review order/i }).click();
    await page.getByRole("button", { name: /place order/i }).click();
    await expect(page).toHaveURL(/order-confirmation/, { timeout: 20_000 });

    // The embedded Cybersource checkout initializes automatically; the fake
    // library completes the payment and the backend verifies the signed token
    // server-side (signature + merchant reference + amount).
    await expect(page.getByText(/payment successful|thank you/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Authoritative status eventually shows Paid on the order detail.
    await goToAccountOrders(page);
    await page.locator('a[href^="/account/orders/"]').first().click();
    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("keyboard and dialog behaviour", () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test("mobile menu dialog opens and closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("security journeys", () => {
  const API = "http://localhost:4000/api/v1";

  test("cross-customer authorization: another customers order is not readable (IDOR)", async ({
    request,
  }) => {
    const a = await request.post(`${API}/auth/customer/register`, {
      data: {
        name: "Customer A",
        email: `a-${RUN}@test.com`,
        password: PASSWORD,
        acceptedTerms: true,
      },
    });
    const b = await request.post(`${API}/auth/customer/register`, {
      data: {
        name: "Customer B",
        email: `b-${RUN}@test.com`,
        password: PASSWORD,
        acceptedTerms: true,
      },
    });
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();
    const tokenA = (await a.json()).data.accessToken;
    const tokenB = (await b.json()).data.accessToken;

    // A stocks their server cart and places a real order.
    const prod = await request.get(`${API}/public/products?pageSize=1`);
    const productId = ((await prod.json()).data as Array<{ id: string }>)[0]!.id;
    await request.post(`${API}/cart/items`, {
      headers: { authorization: `Bearer ${tokenA}` },
      data: { productId, quantity: 1 },
    });
    const created = await request.post(`${API}/customer/orders`, {
      headers: { authorization: `Bearer ${tokenA}` },
      data: {
        shippingAddress: { line1: "1 A St", city: "Kathmandu", country: "Nepal" },
        paymentMethod: "Cash on Delivery",
      },
    });
    expect(created.ok()).toBeTruthy();
    const orderId = ((await created.json()).data as { id: string }).id;

    // B cannot read As order - the server enforces ownership (403/404).
    const response = await request.get(`${API}/customer/orders/${orderId}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(response.status());
  });

  test("unsafe redirect param never leaves the origin after login", async ({
    page,
    playwright,
  }) => {
    // Register a dedicated account via an isolated API context (so its
    // refresh cookie cannot leak into the page) — the flow is otherwise
    // identical to a real user logging in with an unsafe `redirect` param.
    const api = await playwright.request.newContext();
    const reg = await api.post(`${API}/auth/customer/register`, {
      data: {
        name: "Redirect Tester",
        email: `rd-${RUN}@test.com`,
        password: PASSWORD,
        acceptedTerms: true,
      },
    });
    expect(reg.ok()).toBeTruthy();
    await api.dispose();

    await page.goto(`/login?redirect=${encodeURIComponent("https://evil.example")}`);
    await page.getByLabel("Email").fill(`rd-${RUN}@test.com`);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Never navigates off-origin; the unsafe target is replaced by /account.
    await page.waitForURL(/localhost:8090\/account/, { timeout: 20_000 });
    expect(new URL(page.url()).origin).toBe("http://localhost:8090");
    expect(page.url()).not.toContain("evil.example");
  });
});
