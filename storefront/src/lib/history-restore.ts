import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Back/forward-cache (bfcache) recovery for the client-routed storefront.
 *
 * Restoring a page from the bfcache resumes the FROZEN JavaScript heap: React
 * keeps rendering exactly the tree it rendered before the user navigated away,
 * while the address bar already shows the restored history entry's URL. The
 * HTML spec fires only `pageshow` (with `persisted: true`) for such a restore
 * and deliberately does NOT fire `popstate` â€” and TanStack Router/history
 * listens exclusively to `popstate` (`@tanstack/history`:
 * `win.addEventListener("popstate", onPushPopEvent)`), so nothing would put
 * the router back in sync with the URL the browser just restored.
 *
 * The consequence is a silently stale page: a back navigation to a listing can
 * leave the previously visited route (e.g. a product detail page) rendered
 * under `/products` indefinitely - the URL is correct, no error is shown, and
 * no catalog fetch ever runs.
 *
 * The handling below re-applies the restored URL to the router (`replace`, so
 * no extra history entry is created) and refetches the active queries once,
 * because they were frozen mid-flight and may never have completed.
 */

/** True only for a document restored from the back/forward cache. */
export function isHistoryRestore(event: Pick<PageTransitionEvent, "persisted">): boolean {
  return event.persisted === true;
}

/** Points the router at the URL the browser restored. */
export type HistoryRestoreResync = (href: string) => void;

/** The query-client surface this module needs. */
export type HistoryRestoreRefetch = Pick<QueryClient, "refetchQueries">;

/**
 * Applies a bfcache restore the router could not observe. Returns `true` when
 * the event was a restore and recovery ran, so callers stay free of duplicated
 * `persisted` checks and the behaviour can be unit-tested directly.
 */
export function applyHistoryRestore(
  event: Pick<PageTransitionEvent, "persisted">,
  href: string,
  resync: HistoryRestoreResync,
  queryClient: HistoryRestoreRefetch,
): boolean {
  if (!isHistoryRestore(event)) return false;
  resync(href);
  void queryClient.refetchQueries({ type: "active" });
  return true;
}

/**
 * Recovers from bfcache restores for the lifetime of the component.
 *
 * `resync` must be referentially stable (e.g. wrapped in `useCallback`) so the
 * `pageshow` listener is not re-registered on every render.
 */
export function useHistoryRestoreSync(
  resync: HistoryRestoreResync,
  queryClient: HistoryRestoreRefetch,
): void {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      applyHistoryRestore(event, window.location.href, resync, queryClient);
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resync, queryClient]);
}
