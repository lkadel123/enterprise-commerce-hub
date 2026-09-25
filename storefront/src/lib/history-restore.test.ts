import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

import {
  applyHistoryRestore,
  isHistoryRestore,
  useHistoryRestoreSync,
  type HistoryRestoreRefetch,
} from "./history-restore";

/**
 * bfcache (back/forward cache) recovery.
 *
 * A restore resumes the frozen React tree under the restored URL and fires
 * `pageshow`/`persisted:true` â€” never `popstate` â€” so TanStack Router cannot
 * notice it. These tests pin the recovery: the restored URL is re-applied to
 * the router and active queries are refetched, while ordinary loads do nothing.
 */

/** jsdom has no PageTransitionEvent; build the shape the handler reads. */
function pageShowEvent(persisted: boolean): PageTransitionEvent {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  return event as PageTransitionEvent;
}

/** Real QueryClient with a spied refetchQueries (keeps the production type). */
function spiedQueryClient() {
  const client = new QueryClient();
  const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue(undefined);
  return { client: client as HistoryRestoreRefetch, refetch };
}

describe("isHistoryRestore", () => {
  it("is true only when the document came out of the back/forward cache", () => {
    expect(isHistoryRestore({ persisted: true })).toBe(true);
    expect(isHistoryRestore({ persisted: false })).toBe(false);
  });
});

describe("applyHistoryRestore", () => {
  it("re-applies the restored URL and refetches active queries", () => {
    const resync = vi.fn();
    const { client, refetch } = spiedQueryClient();

    const handled = applyHistoryRestore(
      { persisted: true },
      "http://localhost:8090/products",
      resync,
      client,
    );

    expect(handled).toBe(true);
    expect(resync).toHaveBeenCalledExactlyOnceWith("http://localhost:8090/products");
    // Frozen in-flight queries may never have resolved before the restore.
    expect(refetch).toHaveBeenCalledExactlyOnceWith({ type: "active" });
  });

  it("ignores an ordinary page load (nothing to resync)", () => {
    const resync = vi.fn();
    const { client, refetch } = spiedQueryClient();

    expect(applyHistoryRestore({ persisted: false }, "/products", resync, client)).toBe(false);
    expect(resync).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe("useHistoryRestoreSync", () => {
  it("recovers from a bfcache restore reported via pageshow", () => {
    const resync = vi.fn();
    const { client, refetch } = spiedQueryClient();

    renderHook(() => useHistoryRestoreSync(resync, client));
    window.dispatchEvent(pageShowEvent(true));

    expect(resync).toHaveBeenCalledExactlyOnceWith(window.location.href);
    expect(refetch).toHaveBeenCalledExactlyOnceWith({ type: "active" });
  });

  it("does nothing for the initial pageshow of a freshly loaded document", () => {
    const resync = vi.fn();
    const { client, refetch } = spiedQueryClient();

    renderHook(() => useHistoryRestoreSync(resync, client));
    window.dispatchEvent(pageShowEvent(false));

    expect(resync).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const resync = vi.fn();
    const { client } = spiedQueryClient();

    const { unmount } = renderHook(() => useHistoryRestoreSync(resync, client));
    unmount();
    window.dispatchEvent(pageShowEvent(true));

    expect(resync).not.toHaveBeenCalled();
  });
});
