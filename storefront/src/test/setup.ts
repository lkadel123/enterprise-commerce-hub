/**
 * Global Vitest setup for the storefront test suite (Phase 11).
 *
 * Keep this minimal and documented:
 * - `@testing-library/jest-dom` matchers.
 * - RTL cleanup after every test so DOM state never leaks between tests.
 * - Browser APIs that Radix/TanStack components expect in jsdom but which
 *   jsdom does not implement (`matchMedia`, `IntersectionObserver`,
 *   `ResizeObserver`, `scrollIntoView`).
 * - `localStorage` starts empty for every test file (jsdom provides the
 *   storage; guest-cart tests clear it per-test for isolation).
 *
 * MSW is intentionally NOT started globally — each suite that performs HTTP
 * starts/stops the shared server itself (see `src/test/server.ts`) so pure
 * unit tests cannot accidentally hit the network.
 */
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  // Radix uses matchMedia for hover/pointer + reduced-motion detection.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    });
  }

  // Embla carousel / TanStack virtual hooks observe elements.
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  if (typeof window.IntersectionObserver === "undefined") {
    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });
  }
  if (typeof window.ResizeObserver === "undefined") {
    class MockResizeObserver implements ResizeObserver {
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    }
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: MockResizeObserver,
    });
  }

  // Radix Popper positions elements with scrollIntoView in some flows.
  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
}
