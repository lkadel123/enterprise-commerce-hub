import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

/**
 * Reliable SSR detection: under Nitro/Vite the client bundle may not statically
 * replace `import.meta.env.SSR`, which would disable every query in the browser.
 */
export const isSsr = (): boolean => typeof window === "undefined";

/** Build the single, shared QueryClient used by both the router and providers. */
export function buildQueryClient(): QueryClient {
  const config: QueryClientConfig = {
    defaultOptions: {
      queries: {
        enabled: !isSsr(),
        // SSR streams queries in a "pending" state with no data; observers
        // hydrated from that state must still fetch on mount on the client.
        refetchOnMount: "always",
        retryOnMount: true,
      },
      mutations: { retry: false },
    },
  };
  return new QueryClient(config);
}
