type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** Route prefixes carrying authenticated/customer data (G17-14). */
const PRIVATE_ROUTE_PREFIXES = [
  "/account",
  "/order-confirmation",
  "/payment",
  "/checkout",
  "/cart",
  "/wishlist",
] as const;

function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`),
  );
}

// ---------------------------------------------------------------------------
// Root-level SEO endpoints (production hardening)
//
// Crawlers request /robots.txt and /sitemap.xml on the storefront domain root.
// The backend already serves the canonical, DB-driven equivalents at
// /api/v1/public/robots.txt and /api/v1/public/sitemap.xml, built from the
// server-validated public base URL. Proxy them here so the storefront domain
// serves them without hardcoding any host. On backend failure the request
// falls through to the app router (which renders its normal error UI).
// ---------------------------------------------------------------------------
import { API_BASE_URL } from "./config/env.js";

const SEO_CACHE_CONTROL = "public, max-age=900";

async function serveSeoFile(pathname: "/robots.txt" | "/sitemap.xml"): Promise<Response | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${pathname}`, { redirect: "error" });
    if (!res.ok) return null;
    const body = await res.text();
    const contentType =
      pathname === "/robots.txt" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8";
    return new Response(body, {
      status: 200,
      headers: { "content-type": contentType, "cache-control": SEO_CACHE_CONTROL },
    });
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      // Phase 17 (G17-14): private customer pages must never be stored or
      // shared by browser/CDN caches. The SSR shell itself renders no private
      // data (auth-gated queries fire client-side only), but the explicit
      // header guarantees no intermediary caches authenticated HTML.
      const url = new URL(request.url);
      // Root-level SEO endpoints proxy the backend's canonical sitemap/robots.
      if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
        const seo = await serveSeoFile(url.pathname as "/robots.txt" | "/sitemap.xml");
        if (seo) return seo;
      }
      if (isPrivateRoute(url.pathname)) {
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store, must-revalidate");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
