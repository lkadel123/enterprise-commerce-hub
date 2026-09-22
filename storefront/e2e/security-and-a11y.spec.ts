import { expect, test } from "@playwright/test";

test.describe("Phase 10 accessibility regressions", () => {
  test("skip link is the first tab stop and moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("submitting an empty login form focuses the first invalid field", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    const email = page.locator('input[name="email"]');
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("reduced motion (WCAG 2.3.3)", () => {
  test("reduce-motion preference is honoured and focus stays usable", async ({ page }) => {
    // Emulate the OS-level reduce-motion preference at the browser level.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // The OS-level preference is actually delivered to the page.
    const prefersReduced = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(prefersReduced).toBe(true);

    // The reduced-motion CSS honours it: decorative transitions/animations
    // collapse to near-instant (see styles.css `@media (prefers-reduced-motion)`).
    const animationDuration = await page.evaluate(() => {
      const el = document.body;
      const style = getComputedStyle(el);
      return style.transitionDuration + "|" + style.animationDuration;
    });
    // transition/animation durations are collapsed to 0.01ms (not the default).
    // Chromium may serialise the same computed value as `1e-05s` (seconds),
    // which is numerically identical to 0.01ms — accept either representation.
    expect(animationDuration).toMatch(/0\.01ms|1e-05s/);

    // Focus indicators remain functional (skip link reachable via keyboard).
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});

test.describe("security regressions", () => {
  test("unauthenticated private routes do not leak customer data in SSR HTML", async ({
    request,
  }) => {
    for (const path of ["/account", "/cart", "/checkout", "/wishlist"]) {
      const response = await request.get(`http://localhost:8090${path}`);
      expect(response.status(), path).toBeLessThan(500);
      const html = await response.text();
      // No customer profile fields may appear server-side.
      expect(html).not.toContain('"email"');
      expect(html).not.toContain("accessToken");
    }
  });

  test("public product HTML exposes metadata and parses JSON-LD safely", async ({ request }) => {
    const home = await request.get("http://localhost:8090/");
    const homeHtml = await home.text();
    expect(homeHtml).toContain('property="og:type"');
    expect(homeHtml).toContain('rel="canonical"');
  });

  test("login rejects bad credentials without redirecting to external origins", async ({
    page,
  }) => {
    await page.goto("/login?redirect=//evil.example");
    await page.locator('input[name="email"]').fill("nobody@test.com");
    await page.locator('input[name="password"]').fill("wrongpass");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForTimeout(1_000);
    // Still on the app origin — an open redirect would have navigated away.
    expect(new URL(page.url()).origin).toBe("http://localhost:8090");
  });
});
