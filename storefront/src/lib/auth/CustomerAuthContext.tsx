import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { configureClient, setAccessToken } from "@/lib/api/client";
import { customerAuthApi } from "@/lib/api/customer-client";
import { clearCustomerSessionHint, hasCustomerSessionHint } from "@/lib/auth/sessionHint";
import type { CustomerAuthProfile } from "@/types";

/**
 * Authentication status of the customer session.
 *
 * - `loading`: session is being restored (first mount, or refresh in flight).
 *   During this state, protected routes must NOT redirect — they wait.
 * - `authenticated`: access token is in memory and customer is loaded.
 * - `unauthenticated`: no valid session (no token, refresh failed, or logged out).
 */
export type CustomerAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface CustomerAuthContextValue {
  status: CustomerAuthStatus;
  customer: CustomerAuthProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Replace the in-memory customer snapshot (e.g. after a profile update). */
  applyCustomer: (customer: CustomerAuthProfile) => void;
  login: (credentials: {
    email: string;
    password: string;
    remember?: boolean;
  }) => Promise<CustomerAuthProfile>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    acceptedTerms: true;
  }) => Promise<CustomerAuthProfile>;
  /**
   * Completes a NEW social (Google/Facebook) registration after explicit
   * Terms & Conditions acceptance. The provider identity lives only in the
   * backend's signed, single-use consent cookie — nothing sensitive is sent
   * from the browser. Establishes the SAME session as register/login.
   */
  acceptSocialTerms: () => Promise<CustomerAuthProfile>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CustomerAuthStatus>("loading");
  const [customer, setCustomer] = useState<CustomerAuthProfile | null>(null);
  const busy = useRef(false);

  const applySession = useCallback(
    (session: { customer: CustomerAuthProfile; accessToken: string }) => {
      setAccessToken(session.accessToken);
      setCustomer(session.customer);
      setStatus("authenticated");
    },
    [],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setCustomer(null);
    setStatus("unauthenticated");
  }, []);

  const queryClient = useQueryClient();

  const clearAll = useCallback(() => {
    clearSession();
    // Drop the JS-readable session hint on every unauthenticated transition
    // (logout, failed refresh, guest boot) so future boots stay guest-safe.
    clearCustomerSessionHint();
    void queryClient.clear();
  }, [clearSession, queryClient]);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const response = await customerAuthApi.refresh();
      const { customer: refreshedCustomer, accessToken: newToken } = response.data;
      applySession({ customer: refreshedCustomer, accessToken: newToken });
      return newToken;
    } catch {
      // 401 (expired/invalid session) and network failures both resolve to the
      // unauthenticated (guest) state — this is the expected path for guests
      // and expired sessions, not an application error. clearAll() removes the
      // stale hint cookie so future boots skip the refresh call for this
      // browser.
      clearAll();
      return null;
    }
  }, [applySession, clearAll]);

  useEffect(() => {
    configureClient({
      refresh,
      onUnauthenticated: () => {
        clearAll();
      },
    });
  }, [refresh, clearAll]);

  useEffect(() => {
    if (busy.current) return;
    busy.current = true;
    let cancelled = false;

    (async () => {
      try {
        /**
         * Guest-safe session restoration.
         *
         * The refresh token is an HttpOnly cookie the frontend cannot inspect.
         * The backend mirrors its presence in the JS-readable
         * `customer_session_hint` cookie (set on login/register/refresh,
         * cleared on logout). Without the hint there is no session, so the
         * refresh endpoint is NOT called at all — guests get no request and
         * therefore no 401 network error in the console.
         *
         * When the hint IS present but the session has expired, the 401 from
         * refresh() is handled as the expected unauthenticated state (see
         * above): the storefront continues in Guest Mode with no uncaught
         * error and no redirect loop.
         */
        if (!hasCustomerSessionHint()) {
          if (cancelled) return;
          clearAll();
          return;
        }

        const token = await refresh();
        if (cancelled) return;
        if (!token) {
          clearAll();
        }
      } catch {
        if (cancelled) return;
        clearAll();
      } finally {
        busy.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, clearAll]);

  const login = useCallback(
    async (credentials: {
      email: string;
      password: string;
      remember?: boolean;
    }): Promise<CustomerAuthProfile> => {
      const response = await customerAuthApi.login(credentials);
      const { customer: loggedInCustomer, accessToken: newToken } = response.data;
      applySession({ customer: loggedInCustomer, accessToken: newToken });
      return loggedInCustomer;
    },
    [applySession],
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      acceptedTerms: true;
    }): Promise<CustomerAuthProfile> => {
      const response = await customerAuthApi.register(data);
      const { customer: newCustomer, accessToken: newToken } = response.data;
      applySession({ customer: newCustomer, accessToken: newToken });
      return newCustomer;
    },
    [applySession],
  );

  const acceptSocialTerms = useCallback(async (): Promise<CustomerAuthProfile> => {
    const response = await customerAuthApi.acceptSocialTerms({ acceptedTerms: true });
    const { customer: newCustomer, accessToken: newToken } = response.data;
    applySession({ customer: newCustomer, accessToken: newToken });
    return newCustomer;
  }, [applySession]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await customerAuthApi.logout();
    } catch {
      // Best-effort: still clear local state even if the network fails.
    }
    clearAll();
  }, [clearAll]);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      status,
      customer,
      isAuthenticated: status === "authenticated",
      isLoading: status === "loading",
      applyCustomer: (updated) => setCustomer(updated),
      login,
      register,
      acceptSocialTerms,
      logout,
    }),
    [status, customer, login, logout, register, acceptSocialTerms],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error("useCustomerAuth must be used within <CustomerAuthProvider>");
  }
  return ctx;
}

/**
 * Whether the customer is authenticated and ready for protected data fetching.
 *
 * Returns `false` during loading and after logout. Authenticated TanStack
 * Query hooks should bind their `enabled` option to this value.
 */
export function useCustomerAuthReady(): boolean {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  return isAuthenticated && !isLoading;
}

/**
 * Whether a redirect to a given path is safe (same-origin, relative).
 *
 * Prevents open-redirect attacks: the redirect must start with `/` and must
 * not start with `//` (protocol-relative) or `/\\`.
 */
export function isSafeRedirect(to: string): boolean {
  if (!to || typeof to !== "string") return false;
  if (!to.startsWith("/")) return false;
  if (to.startsWith("//")) return false;
  if (to.startsWith("/\\") || to.startsWith("\\/")) return false;
  return true;
}
