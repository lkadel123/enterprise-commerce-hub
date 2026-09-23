import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { ok } from "@/test/fixtures/catalog";
import { server } from "@/test/server";
import type { CustomerPaymentDto, CustomerPaymentResult, PaymentStatus } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * The panel is imported dynamically, after `vi.mock` and the MSW server are in
 * place — the same ordering every other payment-panel suite uses, so the panel
 * always exercises the intercepted `fetch`.
 */
const { CybersourceCheckout } = await import("./CybersourceCheckout");

/** Element id the panel uses for the Cybersource-hosted SDK script tag. */
const SDK_SCRIPT_ID = "cybersource-unified-checkout-sdk";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  document.getElementById(SDK_SCRIPT_ID)?.remove();
  // Every test publishes its own `window.VAS` surface; clearing it here keeps
  // the tests independent even when one throws before it can clean up.
  (globalThis as unknown as { VAS?: unknown }).VAS = undefined;
});
afterAll(() => server.close());

const ORDER_ID = "ord-cb-1";
const INITIATE_URL = `${API_BASE_URL}/customer/payments/${ORDER_ID}/initiate`;
const VERIFY_URL = `${API_BASE_URL}/customer/payments/${ORDER_ID}/verify`;
const PROVIDER_TRANSACTION_ID = "EC-ord-cb-1-AbCdEf012345";
const SIGNED_RESPONSE_TOKEN = "eb3c4a2d-1234-5678-9abc-def012345678";
const CONTAINER_SELECTOR = "#cybersource-payment-selection";

/** base64url-encode a JSON value, exactly like a JWT segment. */
function encodeSegment(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A structurally valid Unified Checkout capture context: a 3-segment JWT whose
 * payload carries the Cybersource-hosted `clientLibrary` URL the panel is
 * allowed to load. The signature is never verified client-side.
 */
const CAPTURE_CONTEXT = [
  encodeSegment({ alg: "RS256", kid: "test-kid-123", typ: "JWT" }),
  encodeSegment({
    ctx: [
      {
        type: "uc-1.0",
        data: {
          clientLibrary: "https://testup.cybersource.com/uc/v1/assets/1.0.5/UnifiedCheckout.js",
          clientLibraryIntegrity: "sha384-test-integrity",
        },
      },
    ],
    iat: 1700000000,
    exp: 9999999999,
  }),
  "FAKE_SIGNATURE",
].join(".");

/** The payment DTO the backend returns at initiation (and again after verify). */
function captureContextPayment(status: PaymentStatus = "Paid"): CustomerPaymentResult {
  return {
    payment: {
      orderId: ORDER_ID,
      gateway: "CYBERSOURCE",
      method: "Credit Card",
      status,
      transactionId: null,
      providerTransactionId: PROVIDER_TRANSACTION_ID,
      amount: 2150,
      currency: "USD",
      initiatedAt: "2026-01-01T00:00:00.000Z",
      paidAt: status === "Paid" ? "2026-01-01T00:02:00.000Z" : null,
      failureReason: status === "Failed" ? "Payment not completed" : null,
      clientToken: CAPTURE_CONTEXT,
    },
    duplicate: false,
  };
}

/** Insert the SDK tag the panel looks for (jsdom never fetches it). */
function installSdkScript(): HTMLScriptElement {
  const script = document.createElement("script");
  script.id = SDK_SCRIPT_ID;
  document.body.appendChild(script);
  return script;
}

/** Publish the `window.VAS` surface the panel resolves its factory from. */
function setVas(vas: unknown): void {
  (globalThis as unknown as { VAS?: unknown }).VAS = vas;
}

/**
 * A stub of the REAL SDK entry point: an async factory (never a constructor)
 * resolving an instance whose `createCheckout()` resolves the mountable
 * surface. `mount()` resolves with the Cybersource-signed response token once
 * the customer has paid — complete mandate is enabled server-side.
 */
function stubSdk(
  mountResult: unknown,
  seenCaptureContexts: string[] = [],
  seenContainers: unknown[] = [],
) {
  return vi.fn(async (captureContext: string) => {
    seenCaptureContexts.push(captureContext);
    return {
      createCheckout: vi.fn(async () => ({
        mount: vi.fn(async (containers: unknown) => {
          seenContainers.push(containers);
          return mountResult;
        }),
        isMounted: vi.fn(() => true),
      })),
    };
  });
}

function renderPanel(onSettled?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CybersourceCheckout orderId={ORDER_ID} {...(onSettled ? { onSettled } : {})} />
    </QueryClientProvider>,
  );
}

/**
 * Initiation plus the authoritative server-side verification handlers.
 *
 * Initiation returns a NOT-YET-PAID session (`Initiated`) carrying the capture
 * context, exactly like the backend does — the panel must not read that as an
 * already-settled order. Verification then returns the server-decided status.
 */
function paymentHandlers(
  options: {
    onInitiate?: () => void;
    onVerify?: () => void;
    initiateStatus?: PaymentStatus;
    verifyStatus?: PaymentStatus;
  } = {},
) {
  const initiateStatus = options.initiateStatus ?? "Initiated";
  const verifyStatus = options.verifyStatus ?? "Paid";
  return [
    http.post(INITIATE_URL, () => {
      options.onInitiate?.();
      return HttpResponse.json(ok(captureContextPayment(initiateStatus)));
    }),
    http.post(VERIFY_URL, () => {
      options.onVerify?.();
      return HttpResponse.json(ok({ payment: captureContextPayment(verifyStatus).payment }));
    }),
  ];
}

describe("CybersourceCheckout", () => {
  it("drives the real SDK contract — async factory, createCheckout, then mount — and verifies the signed token", async () => {
    const script = installSdkScript();
    const seenCaptureContexts: string[] = [];
    const seenContainers: unknown[] = [];
    const factory = stubSdk(SIGNED_RESPONSE_TOKEN, seenCaptureContexts, seenContainers);
    setVas({ UnifiedCheckout: factory });

    let initiateCalls = 0;
    let verifyCalls = 0;
    server.use(
      ...paymentHandlers({
        onInitiate: () => {
          initiateCalls += 1;
        },
        onVerify: () => {
          verifyCalls += 1;
        },
      }),
    );

    renderPanel();

    await waitFor(() => expect(initiateCalls).toBe(1));
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(verifyCalls).toBe(1));

    // The capture context is forwarded untouched — the panel never parses it.
    expect(seenCaptureContexts).toEqual([CAPTURE_CONTEXT]);
    // The panel reused the SDK tag instead of injecting a second script.
    expect(document.getElementById(SDK_SCRIPT_ID)).toBe(script);
    // `mount()` is called with the container SELECTOR (sidebar mode); the SDK
    // normalises it into `{ paymentSelection }` after validating that the
    // element exists — nesting it as `{ containers: … }` would fail that check.
    expect(seenContainers).toEqual([CONTAINER_SELECTOR]);
    // Success is server-verified: the panel shows the confirmed state.
    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay by card/i })).toBeNull();
  });

  it("fails gracefully when the loaded SDK never publishes window.VAS.UnifiedCheckout", async () => {
    const script = installSdkScript();
    // `window.VAS` exists but exposes no UnifiedCheckout entry point.
    setVas({});

    let initiateCalls = 0;
    server.use(
      ...paymentHandlers({
        onInitiate: () => {
          initiateCalls += 1;
        },
      }),
    );

    renderPanel();
    await waitFor(() => expect(initiateCalls).toBe(1));

    // jsdom never fetches the Cybersource script, so deliver its `load` event;
    // the panel then inspects window.VAS and reports the missing entry point.
    await waitFor(() => {
      script.dispatchEvent(new Event("load"));
      expect(screen.getByText(/card payment form could not be initialised/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry card payment/i })).toBeInTheDocument();
  });

  it("reports an incomplete payment when the server verifies a non-Paid status", async () => {
    installSdkScript();
    setVas({ UnifiedCheckout: stubSdk("declined-token-123") });

    let verifyCalls = 0;
    server.use(
      ...paymentHandlers({
        verifyStatus: "Failed",
        onVerify: () => {
          verifyCalls += 1;
        },
      }),
    );

    renderPanel();

    await waitFor(() => expect(verifyCalls).toBe(1));
    expect(await screen.findByText(/payment was not completed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry card payment/i })).toBeInTheDocument();
  });

  it("rejects a mount that resolves without a signed response token", async () => {
    installSdkScript();
    setVas({ UnifiedCheckout: stubSdk(null) });

    server.use(...paymentHandlers());

    renderPanel();

    expect(await screen.findByText(/did not return a signed result token/i)).toBeInTheDocument();
  });

  it("surfaces the backend error and never touches the SDK when initiation fails", async () => {
    installSdkScript();
    const factory = stubSdk(SIGNED_RESPONSE_TOKEN);
    setVas({ UnifiedCheckout: factory });

    let initiateCalls = 0;
    server.use(
      http.post(INITIATE_URL, () => {
        initiateCalls += 1;
        // The backend error envelope: { error: { code, message } }.
        return new Response(
          JSON.stringify({
            error: { code: "PAYMENT_UNAVAILABLE", message: "The card gateway is unavailable." },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const onSettled = vi.fn();
    renderPanel(onSettled);

    await waitFor(() => expect(initiateCalls).toBe(1));
    expect(await screen.findByText(/the card gateway is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry card payment/i })).toBeInTheDocument();
    expect(factory).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale UnifiedPayments entry and only accepts the UnifiedCheckout factory", async () => {
    const script = installSdkScript();
    const staleFactory = vi.fn(() => {
      throw new Error("UnifiedPayments is not a constructor");
    });
    setVas({ UnifiedPayments: staleFactory });

    let initiateCalls = 0;
    let verifyCalls = 0;
    server.use(
      ...paymentHandlers({
        onInitiate: () => {
          initiateCalls += 1;
        },
        onVerify: () => {
          verifyCalls += 1;
        },
      }),
    );

    renderPanel();
    await waitFor(() => expect(initiateCalls).toBe(1));
    await waitFor(() => {
      script.dispatchEvent(new Event("load"));
      expect(screen.getByText(/card payment form could not be initialised/i)).toBeInTheDocument();
    });
    // The retired contract is never constructed.
    expect(staleFactory).not.toHaveBeenCalled();

    // Publish the real entry point and retry — the panel now completes the flow.
    const factory = stubSdk(SIGNED_RESPONSE_TOKEN);
    setVas({ UnifiedCheckout: factory });
    await userEvent.click(screen.getByRole("button", { name: /retry card payment/i }));

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(verifyCalls).toBe(1));
    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
  });

  it("keeps exactly one payment flow in flight — no duplicate initiate or verify", async () => {
    installSdkScript();
    // A mount() that stays pending until the test releases it, so the first
    // flow is genuinely in-flight while we probe for duplicate submissions.
    let releaseMount!: (token: string) => void;
    const mountGate = new Promise<string>((resolve) => {
      releaseMount = resolve;
    });
    const factory = vi.fn(async () => ({
      createCheckout: vi.fn(async () => ({
        mount: vi.fn(() => mountGate),
        isMounted: vi.fn(() => true),
      })),
    }));
    setVas({ UnifiedCheckout: factory });

    let initiateCalls = 0;
    let verifyCalls = 0;
    server.use(
      ...paymentHandlers({
        onInitiate: () => {
          initiateCalls += 1;
        },
        onVerify: () => {
          verifyCalls += 1;
        },
      }),
    );

    renderPanel();

    await waitFor(() => expect(initiateCalls).toBe(1));
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    // While the hosted card form is mounted and awaiting the customer, the
    // panel exposes no pay/retry action — a second flow cannot be started.
    expect(screen.queryByRole("button", { name: /pay by card|retry card payment/i })).toBeNull();

    // The auto-start effect re-runs on every phase transition but must never
    // trigger a second initiation while the first flow is unresolved.
    releaseMount(SIGNED_RESPONSE_TOKEN);
    await waitFor(() => expect(verifyCalls).toBe(1));
    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
    expect(initiateCalls).toBe(1);
    expect(verifyCalls).toBe(1);
  });

  it("destroys the mounted SDK surface on unmount", async () => {
    installSdkScript();
    const destroy = vi.fn();
    const factory = vi.fn(async () => ({
      createCheckout: vi.fn(async () => ({
        mount: vi.fn(async () => SIGNED_RESPONSE_TOKEN),
        destroy,
        isMounted: vi.fn(() => true),
      })),
    }));
    setVas({ UnifiedCheckout: factory });

    server.use(...paymentHandlers());

    const { unmount } = renderPanel();
    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();

    unmount();

    // The teardown hook destroys the hosted surface so no stale iframe can
    // linger over a later attempt (Strict-Mode remounts included).
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/payment received/i)).toBeNull();
  });
});
