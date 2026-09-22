/**
 * LIVE sandbox browser test: real checkout order -> real Cybersource
 * Unified Checkout in a real Chromium browser. No mocks anywhere; the only
 * test double is the self-signed TLS cert (ignored by the lab browser).
 *
 * Usage: cd storefront && node ../live-lab/browser-payment-test.mjs
 */
import { chromium } from "playwright";

const BASE = "https://localhost:8443";
const EMAIL = `live-${Date.now()}@test.com`;
const PASSWORD = "Testpass123!";
const SHOT = (n) => `../live-lab/shot-${n}.png`;

const log = (...a) => console.log("[browser-test]", ...a);
const mask = (s) => String(s).slice(0, 8) + "...";

const browser = await chromium.launch({
  headless: true,
  args: ["--ignore-certificate-errors", "--ignore-certificate-errors-spki-list"],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

// Network observability (masked) — Cybersource + payment API traffic only.
page.on("response", (res) => {
  const url = res.url();
  if (/cybersource\.com|\/customer\/payments|\/uc\/v1\//i.test(url)) {
    log("NET", res.status(), url.replace(/\?[^]*$/, "").slice(0, 120));
  }
});
page.on("console", (msg) => {
  const text = msg.text();
  // Print Cybersource SDK errors in full (diagnostic lab tooling only —
  // no secrets; the SDK error objects contain reason/details only).
  if (/UnifiedCheckoutError|UnifiedPayments|MOUNT_|CAPTURE_CONTEXT/i.test(text)) {
    log("CONSOLE-FULL", msg.type(), text.slice(0, 2000));
  } else {
    log("CONSOLE", msg.type(), text.slice(0, 200));
  }
});
page.on("pageerror", (err) => log("PAGEERROR", String(err).slice(0, 300)));
page.on("requestfailed", (req) => {
  if (/cybersource/i.test(req.url())) log("REQFAILED", req.url().slice(0, 110), req.failure()?.errorText);
});

function dumpFrames() {
  for (const f of page.frames()) {
    if (f !== page.mainFrame()) log("FRAME", f.url().slice(0, 110));
  }
}

try {
  // 1. Register a customer through the real UI.
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Full name").fill("Live Sandbox Tester");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/account/, { timeout: 30_000 });
  log("registered+signed in:", mask(EMAIL));
  await page.screenshot({ path: SHOT("1-account"), fullPage: true });

  // 2. Add a product to the cart via the UI.
  await page.goto(`${BASE}/products`);
  await page.locator('a[href^="/products/"]').first().waitFor({ timeout: 30_000 });
  await page.locator('a[href^="/products/"]').first().click();
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.getByText(/added to cart/i).waitFor({ timeout: 15_000 });
  log("product added to cart");
  await page.screenshot({ path: SHOT("2-cart-added") });

  // 3. Checkout with card payment method.
  await page.goto(`${BASE}/checkout`);
  await page.getByLabel("Address line 1").fill("1 Live Lab Way");
  await page.getByLabel("City").fill("Kathmandu");
  await page.getByLabel("Postal code").fill("44600");
  await page.getByRole("button", { name: /continue to payment/i }).click();
  await page.getByRole("radio", { name: /credit \/ debit card/i }).check({ timeout: 15_000 });
  await page.getByRole("button", { name: /review order/i }).click();
  await page.screenshot({ path: SHOT("3-review") });
  await page.getByRole("button", { name: /place order/i }).click();
  await page.waitForURL(/order-confirmation/, { timeout: 30_000 });
  log("order placed:", page.url());

  // 4. The confirmation page auto-initiates the Cybersource payment.
  await page.waitForResponse(
    (r) => /\/customer\/payments\/.+\/initiate/.test(r.url()) && r.status() === 200,
    { timeout: 30_000 },
  );
  log("payment initiation OK (capture context issued by sandbox)");

  // Poll for up to 40s while Unified Checkout initializes; observe frames,
  // the mount container, and any visible status text each cycle.
  let ucSeen = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2_000);
    const frames = page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.url().slice(0, 100));
    const state = await page.evaluate(() => {
      const container = document.getElementById("cybersource-payment-selection");
      const section = document.querySelector("[aria-labelledby='cybersource-checkout-heading']");
      return {
        hasContainer: Boolean(container),
        containerChildren: container ? container.children.length : -1,
        sectionText: section ? (section.textContent ?? "").slice(0, 220) : null,
        iframes: document.querySelectorAll("iframe").length,
        statusText: document.querySelector("[role='status']")?.textContent?.slice(0, 120) ?? null,
      };
    });
    if (i % 3 === 0 || frames.length > 0 || state.sectionText === null) {
      log(`POLL ${i}:`, JSON.stringify({ frames: frames.length, ...state }));
      for (const f of frames) log("FRAME", f);
    }
    if (frames.length > 0) {
      ucSeen = true;
      break;
    }
  }
  log("ucSeen:", ucSeen);
  await page.screenshot({ path: SHOT("4-uc-rendered"), fullPage: true });

  // 5. Explore the Unified Checkout frame tree and locate inputs.
  const scanFrames = async () => {
    const found = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      let els = [];
      try {
        els = await frame.evaluate(() =>
          Array.from(document.querySelectorAll("input, button, iframe")).map((el) => ({
            tag: el.tagName,
            name: el.getAttribute("name") ?? "",
            id: el.id ?? "",
            title: el.getAttribute("title") ?? "",
            aria: el.getAttribute("aria-label") ?? "",
            placeholder: el.getAttribute("placeholder") ?? "",
          })),
        );
      } catch (e) {
        log("FRAME-SCAN-ERR", String(e).slice(0, 80));
      }
      if (els.length) found.push({ frame: frame.url().slice(0, 90), els });
    }
    return found;
  };
  const structure = await scanFrames();
  log("FRAME STRUCTURE:", JSON.stringify(structure, null, 1).slice(0, 3500));

  // 6. Card payment method selection: the UC buttonlist iframe renders a
  //    "Checkout with card" button; card entry appears ONLY after clicking it.
  const clickMethod = async () => {
    for (let i = 0; i < 15; i++) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        for (const name of [/check\s?out\s?with\s?card/i, /pay\s?with\s?card/i]) {
          try {
            const btn = frame.getByRole("button", { name });
            if ((await btn.count()) > 0) {
              await btn.first().click({ timeout: 2_000 });
              log("clicked UC method button:", String(name), "in", frame.url().slice(0, 80));
              return true;
            }
          } catch {
            /* still mounting */
          }
        }
      }
      await page.waitForTimeout(1_500);
    }
    return false;
  };
  const methodClicked = await clickMethod();

  // 7. Wait for the secure card-entry (MCE) iframe to appear, then discover
  //    the actual form field structure (no guessed selectors).
  log("POST-CLICK OBSERVATION:");
  // Timed snapshots so we see how the UC UI evolves (or disappears).
  let cardFields = [];
  for (let step = 1; step <= 8; step++) {
    await page.waitForTimeout(1_500);
    const snap = await page.evaluate(() => {
      const container = document.getElementById("cybersource-payment-selection");
      return {
        frames: Array.from(document.querySelectorAll("iframe")).map((f) => (f.getAttribute("id") ?? "").slice(0, 24)),
        containerKids: container ? Array.from(container.children).map((c) => (c.tagName ?? "") + ":" + (c.id ?? (c.getAttribute("src") ?? "").slice(0, 40))) : -1,
        sectionText: (document.querySelector("[aria-labelledby='cybersource-checkout-heading']")?.textContent ?? "").slice(0, 200),
        statusText: document.querySelector("[role='status']")?.textContent?.slice(0, 90) ?? null,
      };
    });
    if (step <= 3 || step === 8) {
      log(`T+${step * 1.5}s:`, JSON.stringify(snap).slice(0, 600));
      await page.screenshot({ path: SHOT(`5-uc-${step}`), fullPage: false });
    }
    // Discover form controls; break early once card fields appear.
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const fields = await frame.evaluate(() =>
          Array.from(document.querySelectorAll("input, button, select")).map((el) => ({
            tag: el.tagName,
            name: el.getAttribute("name") ?? "",
            id: el.id ?? "",
            type: el.getAttribute("type") ?? "",
            auto: el.getAttribute("autocomplete") ?? "",
            aria: el.getAttribute("aria-label") ?? "",
            ph: el.getAttribute("placeholder") ?? "",
            text: el.textContent ? el.textContent.trim().slice(0, 40) : "",
          })),
        );
        if (fields.length && !cardFields.some((e) => e.frame === frame.url().slice(0, 90))) {
          cardFields.push({ frame: frame.url().slice(0, 90), fields });
        }
      } catch {
        /* cross-origin/not ready */
      }
    }
  }
  log("CARD FORM STRUCTURE:", JSON.stringify(cardFields, null, 1).slice(0, 4500));

  // 8. Fill the card form with the official Cybersource sandbox test PAN.
  const fillReport = [];
  // Several UC iframes share the SAME asset URL (buttonlist, MCE, ORC), so
  // scan ALL frames for a selector instead of binding to one frame instance.
  const fillAnywhere = async (selectors, value, label, isSelect = false) => {
    for (const sel of selectors) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        try {
          const loc = frame.locator(sel).first();
          if ((await loc.count()) > 0) {
            if (isSelect) {
              try {
                await loc.selectOption({ value });
              } catch {
                try { await loc.selectOption({ label: value }); } catch { continue; }
              }
            } else {
              await loc.fill(value, { timeout: 3_000 });
            }
            fillReport.push(`${label}: ${sel}`);
            return true;
          }
        } catch {
          /* next frame/selector */
        }
      }
    }
    return false;
  };
const clickButtonInFrames = async (nameRe, label) => {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const btn = frame.getByRole("button", { name: nameRe });
        if ((await btn.count()) > 0) {
          await btn.first().click({ timeout: 3_000 });
          log("clicked UC payment button:", label, "in", frame.url().slice(0, 80));
          return true;
        }
      } catch {
        /* next */
      }
    }
    return false;
  };

  // The MCE card form is two-step: contact email first, then card fields.
  const allFields = cardFields.flatMap((e) => e.fields.map((f) => ({ frame: e.frame, f })));
  const sel = (f) => {
    const s = [];
    if (f.id) s.push(`#${f.id}`);
    if (f.name) s.push(`[name="${f.name}"]`);
    if (f.auto) s.push(`[autocomplete="${f.auto}"]`);
    return s;
  };
  const emails = allFields.filter(({ f }) => /^email$/i.test(f.auto) || f.name === "billTo.email" || f.id === "contact-email");
  const cards = allFields.filter(({ f }) =>
    /cc-number|cardNumber|expiry|expir|cvv|security code|cc-csc/i.test(`${f.auto} ${f.name} ${f.id} ${f.ph}`) && !/^email$/i.test(f.auto),
  );

  if (cards.length === 0 && emails.length > 0) {
    const emailSels = emails.flatMap(({ f }) => sel(f));
    await fillAnywhere(emailSels, EMAIL, "email");
    log("EMAIL FILL REPORT:", JSON.stringify(fillReport));
    await clickButtonInFrames(/^continue$/i, "Continue (email step)");
  }

  // 8b. Poll until the card-entry step appears (card / payment fields), then snapshot.
  const collectFields = async () => {
    const out = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const fields = await frame.evaluate(() =>
          Array.from(document.querySelectorAll("input, button, select")).map((el) => ({
            tag: el.tagName,
            name: el.getAttribute("name") ?? "",
            id: el.id ?? "",
            type: el.getAttribute("type") ?? "",
            auto: el.getAttribute("autocomplete") ?? "",
            aria: el.getAttribute("aria-label") ?? "",
            ph: el.getAttribute("placeholder") ?? "",
            text: el.textContent ? el.textContent.trim().slice(0, 40) : "",
          })),
        );
        if (fields.length) out.push({ frame: frame.url().slice(0, 90), fields });
      } catch {
        /* not ready */
      }
    }
    return out;
  };
  let snapshot = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1_500);
    snapshot = await collectFields();
    const flat = snapshot.flatMap((x) => x.fields);
    const hasCardForm = flat.some((f) =>
      /cc-number|cardNumber|card number|cvv|cc-csc|expiry|expir|paymentInformation/i.test(`${f.auto} ${f.name} ${f.id} ${f.ph}`),
    );
    if (hasCardForm || i === 11) break;
  }
log("CARD STEP FORM STRUCTURE:", JSON.stringify(snapshot, null, 1).slice(0, 4000));

  // Card number / expiry / CVV — recompute AFTER the email step re-scan.
    // Card + billing details using the REAL selectors discovered from the MCE form.
  await fillAnywhere(["#card-number"], "4000000000000002", "cardNumber");
  await fillAnywhere(["#card-expiry-month"], "12", "expiryMonth", true);
  await fillAnywhere(["#card-expiry-year"], "30", "expiryYear", true);
  await fillAnywhere(["#card-security-code"], "123", "cvv");
  await fillAnywhere(["#billing-first-name"], "Live", "firstName");
  await fillAnywhere(["#billing-last-name"], "Sandbox", "lastName");
  await fillAnywhere(["#billing-country"], "US", "country", true);
  await fillAnywhere(["#billing-address1"], "1 Live Lab Way", "address1");
  await fillAnywhere(["#billing-locality"], "New York", "locality");
  await fillAnywhere(["#billing-administrative-area"], "NY", "adminArea");
  await fillAnywhere(["#billing-postal-code"], "10001", "postalCode");
log("FILL REPORT:", JSON.stringify(fillReport));
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: SHOT("5-uc-filled"), fullPage: true });

  // 9. Click the UC pay/submit button (in whichever frame it appears).
  let clicked = false;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    for (const name of [/pay/i, /complete purchase/i, /continue/i, /submit/i, /place order/i]) {
      try {
        const btn = frame.getByRole("button", { name });
        if ((await btn.count()) > 0) {
          await btn.first().click({ timeout: 3_000 });
          log("clicked UC payment button:", String(name), "in", frame.url().slice(0, 80));
          clicked = true;
          break;
        }
      } catch {
        /* next */
      }
    }
    if (clicked) break;
  }
  if (!clicked) log("no UC pay button found to click");

  // 7. Wait for a settlement outcome on the page (server-verified result).
  // Extended to 180s with periodic progress polls: sandbox 3-D Secure
  // (Cardinal DDC + step-up challenge) can take well over 60 seconds.
  let outcome = "timeout";
  const knownFrames = new Set(page.frames().map((f) => f.url()));
  const progress = async (label) => {
    try {
      const info = await page.evaluate(() => ({
        frames: window.frames.length,
        body: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 160),
      }));
      const newFrames = page
        .frames()
        .map((f) => f.url())
        .filter((u) => u && !knownFrames.has(u));
      for (const u of newFrames) knownFrames.add(u);
      log(`POLL[${label}] frames=${info.frames} newFrames=${newFrames.length ? JSON.stringify(newFrames.map((u) => u.slice(0, 90))) : "none"} page="${info.body}"`);
    } catch (e) {
      log(`POLL[${label}] failed: ${String(e).slice(0, 120)}`);
    }
  };
  try {
    await Promise.race([
      page.getByText(/payment successful/i).first().waitFor({ timeout: 180_000 }).then(() => { outcome = "successful"; }),
      page.getByText(/payment could not be completed|failed|declined/i).first().waitFor({ timeout: 180_000 }).then(() => { outcome = "failed-ui"; }),
      (async () => {
        for (let i = 1; i <= 18; i++) {
          await page.waitForTimeout(10_000);
          await progress(String(i * 10) + "s");
        }
      })(),
    ]);
  } catch { /* keep timeout */ }
  log("OUTCOME:", outcome);
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: SHOT("6-outcome"), fullPage: true });

  log("DONE");
} catch (error) {
  log("ERROR:", String(error).slice(0, 500));
  try {
    await page.screenshot({ path: SHOT("error"), fullPage: true });
    dumpFrames();
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
