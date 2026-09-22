/**
 * TanStack Query integration for cart mutations (Phase 11).
 *
 * Verifies that cart mutations invalidate the server-cart query so UI state
 * refetches authoritative data, and that the merge mutation posts ONLY
 * `{ items: [{ productId, quantity }] }` — never financial fields.
 */
import { afterEach, beforeEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { resetAuthState } from "@/test/handlers/auth";
import { recordedBodies, resetCommerceState } from "@/test/handlers/commerce";
import { server } from "@/test/server";

const { setAccessToken } = await import("@/lib/api/client");
const {
  cartKeys,
  useAddToCartMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useMergeCartMutation,
} = await import("./cart-hooks");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seed the cart query cache as if fetched.
  client.setQueryData(cartKeys.all, { items: [] });
  (setAccessToken as (t: string | null) => void)("test-access-token");
  resetAuthState();
  resetCommerceState();
});

afterEach(() => {
  (setAccessToken as (t: string | null) => void)(null);
});

describe("cart query invalidation", () => {
  it("add → invalidates the cart query", async () => {
    const { result } = renderHook(() => useAddToCartMutation(), { wrapper });
    result.current.mutate({ productId: "prod-1", quantity: 2 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryState(cartKeys.all)?.isInvalidated).toBe(true);
  });

  it("update quantity and remove invalidate the cart query", async () => {
    // Populate the mock server cart for this token first.
    const add = renderHook(() => useAddToCartMutation(), { wrapper });
    add.result.current.mutate({ productId: "prod-1", quantity: 2 });
    await waitFor(() => expect(add.result.current.isSuccess).toBe(true));

    client.clear(); // fresh cache so invalidation is observable again
    client.setQueryData(cartKeys.all, {
      items: [{ productId: "prod-1", quantity: 2 }],
    });
    const update = renderHook(() => useUpdateCartItemMutation(), { wrapper });
    update.result.current.mutate({ productId: "prod-1", quantity: 5 });
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true));
    expect(client.getQueryState(cartKeys.all)?.isInvalidated).toBe(true);

    const remove = renderHook(() => useRemoveCartItemMutation(), { wrapper });
    remove.result.current.mutate("prod-1");
    await waitFor(() => expect(remove.result.current.isSuccess).toBe(true));
    expect(client.getQueryState(cartKeys.all)?.isInvalidated).toBe(true);
  });

  it("merge posts only {items:[{productId,quantity}]}", async () => {
    const merge = renderHook(() => useMergeCartMutation(), { wrapper });
    // The hook takes the raw items array.
    merge.result.current.mutate([{ productId: "prod-9", quantity: 3 }] as never);
    await waitFor(() => expect(merge.result.current.isSuccess).toBe(true));
    const body = (recordedBodies["cart/merge"]?.[0] ?? {}) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["items"]);
    expect(body.items).toEqual([{ productId: "prod-9", quantity: 3 }]);
  });
});
