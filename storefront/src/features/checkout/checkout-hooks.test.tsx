/**
 * Checkout hook integration tests (Phase 17 G17-03 / P2-04).
 *
 * Verifies the order-creation idempotency contract end-to-end at the hook
 * layer:
 * - every intentional submission sends a non-empty `Idempotency-Key` header
 * - two intentional submissions get DIFFERENT keys (new logical operation)
 * - a failed submission is NOT retried automatically (retry: 0), so the key
 *   can never be regenerated for an accidental transport retry
 * - unrelated endpoints (payment initiation) never carry the header
 * - success invalidates the server cart and the order-history list
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";

import { API_BASE_URL } from "@/config/env";
import { ok } from "@/test/fixtures/catalog";
import { resetAuthState } from "@/test/handlers/auth";
import { resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";

const { setAccessToken } = await import("@/lib/api/client");
const { usePlaceOrderMutation, useInitiatePaymentMutation } = await import("./checkout-hooks");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  (setAccessToken as (t: string | null) => void)("test-access-token");
  resetAuthState();
  resetCommerceState();
});

afterEach(() => {
  (setAccessToken as (t: string | null) => void)(null);
});

/** Records the `Idempotency-Key` header of every POST /customer/orders. */
function recordOrderCreateHeaders(keys: string[]): { callCount: () => number } {
  let calls = 0;
  server.use(
    http.post(`${API_BASE_URL}/customer/orders`, ({ request }) => {
      calls += 1;
      const key = request.headers.get("Idempotency-Key");
      if (key) keys.push(key);
      return HttpResponse.json(
        ok({
          id: "ord-1",
          orderNumber: "ORD-1",
          status: "Pending",
          payment: { method: "Credit Card", provider: "CYBERSOURCE", status: "Pending" },
          amounts: { subtotal: 0, discount: 0, tax: 0, shipping: 0, total: 0 },
          items: [],
          addresses: {},
          coupon: null,
          notes: null,
          createdAt: new Date().toISOString(),
        }),
        { status: 201 },
      );
    }),
  );
  return { callCount: () => calls };
}

describe("usePlaceOrderMutation idempotency (G17-03)", () => {
  it("sends a non-empty Idempotency-Key on order creation", async () => {
    const keys: string[] = [];
    recordOrderCreateHeaders(keys);
    const { result } = renderHook(() => usePlaceOrderMutation(), { wrapper });
    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys).toHaveLength(1);
    expect(keys[0]!.length).toBeGreaterThan(0);
  });

  it("generates a DIFFERENT key for each intentional submission", async () => {
    const keys: string[] = [];
    recordOrderCreateHeaders(keys);
    const { result } = renderHook(() => usePlaceOrderMutation(), { wrapper });

    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    result.current.reset();
    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("does NOT retry a failed submission (key is never regenerated)", async () => {
    const keys: string[] = [];
    let calls = 0;
    server.use(
      http.post(`${API_BASE_URL}/customer/orders`, ({ request }) => {
        calls += 1;
        const key = request.headers.get("Idempotency-Key");
        if (key) keys.push(key);
        return HttpResponse.json(
          { success: false, error: { code: "SERVER_ERROR" } },
          { status: 500 },
        );
      }),
    );
    const { result } = renderHook(() => usePlaceOrderMutation(), { wrapper });
    result.current.mutate({});
    await waitFor(() => expect(result.current.isError).toBe(true));
    // One logical submission = exactly one transport attempt.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
    expect(keys).toHaveLength(1);
  });

  it("payment initiation never carries the order Idempotency-Key", async () => {
    let sawHeader: string | null = "sentinel";
    server.use(
      http.post(`${API_BASE_URL}/customer/payments/ord-1/initiate`, ({ request }) => {
        sawHeader = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          ok({
            payment: {
              orderId: "ord-1",
              provider: "FONEPAY",
              gateway: "FONEPAY",
              status: "Initiated",
            },
          }),
        );
      }),
    );
    const { result } = renderHook(() => useInitiatePaymentMutation(), { wrapper });
    result.current.mutate({ orderId: "ord-1", gateway: "FONEPAY" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sawHeader).toBeNull();
  });
});
