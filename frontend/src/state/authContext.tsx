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
import { useMsal } from "@azure/msal-react";
import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { endpoints } from "@/api/endpoints";
import { getDevUserId, setDevUserId } from "@/api/client";
import { getAccessToken, setAccessToken } from "@/auth/token";
import { getLoginRequest, getTokenRequest, isEntraConfigured } from "@/auth/msalConfig";
import type { Me } from "@/types";

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  entraEnabled: boolean;
  devAuthEnabled: boolean;
  signInWithMicrosoft: () => Promise<void>;
  signInDev: (userId: number) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function acquireTokenForAccount(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string | null> {
  try {
    const result = await instance.acquireTokenSilent({
      ...getTokenRequest(),
      account,
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({ ...getTokenRequest(), account });
      return null;
    }
    console.error("Token acquisition failed", err);
    return null;
  }
}

/** Dev-only auth (no MsalProvider). */
function DevAuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const entraEnabled = false;
  const devAuthEnabled = import.meta.env.VITE_DEV_AUTH !== "false";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!getDevUserId()) {
        setMe(null);
        return;
      }
      setMe(await endpoints.me());
    } catch {
      setMe(null);
      setDevUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      entraEnabled,
      devAuthEnabled,
      signInWithMicrosoft: async () => {
        throw new Error(
          "Entra is not configured. Set VITE_PUBLIC_AZURE_CLIENT_ID, TENANT_ID, and SCOPE.",
        );
      },
      signInDev: async (userId: number) => {
        setAccessToken(null);
        setDevUserId(userId);
        setLoading(true);
        try {
          setMe(await endpoints.me());
        } catch {
          setMe(null);
          setDevUserId(null);
        } finally {
          setLoading(false);
        }
      },
      signOut: async () => {
        setMe(null);
        setAccessToken(null);
        setDevUserId(null);
      },
      refresh,
    }),
    [me, loading, entraEnabled, devAuthEnabled, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Entra auth — must render under MsalProvider. */
function EntraAuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const entraEnabled = true;
  const devAuthEnabled = import.meta.env.VITE_DEV_AUTH !== "false";

  // Stable id only — AccountInfo object identity changes every render and caused /me loops
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const accountId = account?.homeAccountId ?? null;

  // Prevent overlapping /me calls and repeat fetches for the same account
  const inFlight = useRef(false);
  const loadedAccountId = useRef<string | null>(null);

  const loadSession = useCallback(
    async (force = false) => {
      if (inProgress !== "none") return;
      if (inFlight.current) return;

      const currentAccount =
        instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
      const id = currentAccount?.homeAccountId ?? null;

      // Already attempted this Entra account (success or failure) unless force
      if (!force && id && loadedAccountId.current === id) {
        setLoading(false);
        return;
      }

      // No Entra session and no dev user
      if (!id && !getDevUserId()) {
        setMe(null);
        loadedAccountId.current = null;
        setLoading(false);
        return;
      }

      inFlight.current = true;
      setLoading(true);
      try {
        if (currentAccount) {
          instance.setActiveAccount(currentAccount);
          const token = await acquireTokenForAccount(instance, currentAccount);
          if (token) setAccessToken(token);
        }

        if (!getAccessToken() && !getDevUserId()) {
          setMe(null);
          loadedAccountId.current = null;
          return;
        }

        const profile = await endpoints.me();
        setMe(profile);
        loadedAccountId.current = id;
      } catch (err) {
        console.error("Session refresh failed", err);
        setMe(null);
        // Mark this account as attempted so we don't hammer /me on failure
        loadedAccountId.current = id;
        if (!getAccessToken()) setDevUserId(null);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [instance, inProgress],
  );

  useEffect(() => {
    if (inProgress !== "none") return;
    void loadSession(false);
  }, [inProgress, accountId, loadSession]);

  const refresh = useCallback(async () => {
    loadedAccountId.current = null;
    await loadSession(true);
  }, [loadSession]);

  const signInWithMicrosoft = useCallback(async () => {
    setDevUserId(null);
    setAccessToken(null);
    loadedAccountId.current = null;
    await instance.loginRedirect(getLoginRequest());
  }, [instance]);

  const signInDev = useCallback(async (userId: number) => {
    setAccessToken(null);
    setDevUserId(userId);
    loadedAccountId.current = null;
    setLoading(true);
    try {
      setMe(await endpoints.me());
    } catch {
      setMe(null);
      setDevUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setMe(null);
    setAccessToken(null);
    setDevUserId(null);
    loadedAccountId.current = null;
    // App-only logout: clear this SPA's MSAL token cache only.
    // Does not call Entra's end-session endpoint, so Teams/Outlook SSO stays intact.
    instance.setActiveAccount(null);
    await instance.clearCache();
  }, [instance]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading: loading || inProgress !== "none",
      entraEnabled,
      devAuthEnabled,
      signInWithMicrosoft,
      signInDev,
      signOut,
      refresh,
    }),
    [
      me,
      loading,
      inProgress,
      entraEnabled,
      devAuthEnabled,
      signInWithMicrosoft,
      signInDev,
      signOut,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({
  children,
  mode,
}: {
  children: ReactNode;
  mode?: "entra" | "dev";
}) {
  const resolved = mode ?? (isEntraConfigured() ? "entra" : "dev");
  if (resolved === "entra") {
    return <EntraAuthProvider>{children}</EntraAuthProvider>;
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
