import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import { CustomerAuthProvider } from "@/lib/auth/CustomerAuthContext";
import { CartProvider } from "@/lib/cart/CartContext";

export interface AppContextValue {
  queryClient: QueryClient;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within <AppProviders>");
  return ctx;
}

export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  // The queryClient is the SAME instance the router context carries (built via
  // `buildQueryClient` in src/router.tsx), so there is exactly one QueryClient
  // shared by the provider, the router and every hook.

  // TanStack Start streams SSR HTML with queries left in a "pending" state
  // (they are disabled under SSR). On the client these are refetched on mount
  // (see buildQueryClient's refetchOnMount:'always'); this extra kick ensures
  // any active query that was dehydrated mid-flight still resolves promptly.
  // It is production-safe: it only finishes fetches that were already intended.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void queryClient.refetchQueries({ type: "active" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [queryClient]);

  if (typeof window !== "undefined") {
    (window as unknown as { __qc?: QueryClient }).__qc = queryClient;
  }
  const value: AppContextValue = { queryClient };

  return (
    <QueryClientProvider client={queryClient}>
      <CustomerAuthProvider>
        <CartProvider>
          <AppContext.Provider value={value}>
            {children}
            <section aria-label="Notifications" className="sr-only" id="announcer" />
            <Toaster position="bottom-right" />
          </AppContext.Provider>
        </CartProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>
  );
}
