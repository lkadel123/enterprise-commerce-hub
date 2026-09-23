import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  ModulePermission,
  PermissionAction,
  PermissionModule,
  UserDto,
} from "@/lib/api/types";

import { adminAuthApi } from "@/lib/api/auth";
import { configureAdminClient, setAccessToken } from "@/lib/api/client";

/**
 * Admin authentication state.
 *
 * Reuses the backend's existing admin session architecture:
 * - short-lived access token in memory only (never persisted),
 * - rotating httpOnly refresh cookie (managed by the backend),
 * - `GET /auth/me` for boot-time restoration, `POST /auth/refresh` for the
 *   cookie-only path (e.g. after a full page reload with no access token).
 * On any unrecoverable 401 the client transport calls `onUnauthenticated`
 * which clears state and lets the route guard route to /login (loop-free:
 * the login page is outside the guard).
 */

export type AdminAuthStatus = "restoring" | "authenticated" | "unauthenticated";

interface AdminAuthState {
  status: AdminAuthStatus;
  user: UserDto | null;
  permissions: ModulePermission[];
  hasPermission: (module: PermissionModule, action: PermissionAction) => boolean;
  login: (input: { email: string; password: string; remember?: boolean }) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

const ALL_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("restoring");
  const [user, setUser] = useState<UserDto | null>(null);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  // Refs keep the latest values accessible from the stable transport callbacks.
  const restoringRef = useRef(true);
  const refreshInFlight = useRef(false);

  const applyProfile = useCallback(
    (profile: { user: UserDto; permissions: ModulePermission[] }) => {
      setUser(profile.user);
      setPermissions(profile.permissions ?? []);
      setStatus("authenticated");
    },
    [],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setPermissions([]);
    setStatus("unauthenticated");
  }, []);

  // Boot-time session restoration: try /auth/me with no token (the transport
  // will attempt one refresh via cookie when it sees a 401); if the cookie is
  // absent/invalid the app ends up unauthenticated. Never loops.
  useEffect(() => {
    let cancelled = false;
    configureAdminClient({
      refresh: async () => {
        if (refreshInFlight.current) return null;
        refreshInFlight.current = true;
        try {
          const res = await adminAuthApi.refresh();
          if (cancelled) return null;
          setAccessToken(res.data.accessToken);
          applyProfile(res.data);
          return res.data.accessToken;
        } catch {
          if (!cancelled) clearSession();
          return null;
        } finally {
          refreshInFlight.current = false;
        }
      },
      onUnauthenticated: () => {
        if (restoringRef.current) {
          // 401 during restoration simply means "no valid session" — not an error.
          clearSession();
        } else {
          // Session expired mid-use (refresh already attempted + failed).
          clearSession();
        }
      },
    });

    (async () => {
      try {
        // The transport handles token restoration: a 401 on /auth/me triggers
        // one cookie-based refresh + retry, which stores the fresh access token
        // and applies the profile. `me()` itself returns no token material.
        const res = await adminAuthApi.me();
        if (cancelled) return;
        applyProfile(res.data);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        restoringRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyProfile, clearSession]);

  const login = useCallback(
    async (input: { email: string; password: string; remember?: boolean }) => {
      const res = await adminAuthApi.login(input);
      setAccessToken(res.data.accessToken);
      applyProfile(res.data);
      restoringRef.current = false;
      return res.data.user;
    },
    [applyProfile],
  );

  const logout = useCallback(async () => {
    try {
      await adminAuthApi.logout();
    } catch {
      // Logout is best-effort; the local session is cleared regardless.
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (module: PermissionModule, action: PermissionAction) => {
      // The backend remains the authority; this only shapes UI affordances.
      return permissions.some((rule) => rule.module === module && rule.actions.includes(action));
    },
    [permissions],
  );

  const value = useMemo<AdminAuthState>(
    () => ({ status, user, permissions, hasPermission, login, logout }),
    [status, user, permissions, hasPermission, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}

/** Permission helper for components outside the auth consumer (UI shaping only). */
export function useCan(): (module: PermissionModule, action: PermissionAction) => boolean {
  return useAdminAuth().hasPermission;
}

export { ALL_ACTIONS };
