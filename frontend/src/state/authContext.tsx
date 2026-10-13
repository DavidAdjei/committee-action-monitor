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
import { ApiClientError } from "@/api/client";
import { getAccessToken, setAccessToken } from "@/auth/token";
import { getLoginRequest, getTokenRequest } from "@/auth/msalConfig";
import type { Me } from "@/types";

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  entraEnabled: boolean;
  /** Last profile/session error message for the UI (identity conflict, not provisioned, etc.). */
  authError: string | null;
  clearAuthError: () => void;
  signInWithMicrosoft: () => Promise<void>;
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

function messageFromErr(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not load your Committee Action Monitor profile.";
}

function EntraAuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const loadedAccountId = useRef<string | null>(null);
  const accountId = accounts[0]?.homeAccountId ?? null;

  const loadSession = useCallback(
    async (force: boolean) => {
      if (inProgress !== "none") return;
      const account = instance.getActiveAccount() ?? accounts[0] ?? null;
      if (!account) {
        setMe(null);
        setAccessToken(null);
        loadedAccountId.current = null;
        setLoading(false);
        return;
      }
      if (!force && loadedAccountId.current === account.homeAccountId && me) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const token = await acquireTokenForAccount(instance, account);
        if (!token) {
          if (!getAccessToken()) {
            setMe(null);
            setLoading(false);
          }
          return;
        }
        setAccessToken(token);
        instance.setActiveAccount(account);
        setMe(await endpoints.me());
        setAuthError(null);
        loadedAccountId.current = account.homeAccountId;
      } catch (err) {
        console.error("Session load failed", err);
        setMe(null);
        setAuthError(messageFromErr(err));
        // Keep access token so the user can still sign out cleanly; clear identity binding only.
        loadedAccountId.current = null;
      } finally {
        setLoading(false);
      }
    },
    [instance, accounts, inProgress, me],
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
    setAccessToken(null);
    setAuthError(null);
    loadedAccountId.current = null;
    await instance.loginRedirect(getLoginRequest());
  }, [instance]);

  const signOut = useCallback(async () => {
    setMe(null);
    setAccessToken(null);
    setAuthError(null);
    loadedAccountId.current = null;
    instance.setActiveAccount(null);
    await instance.clearCache();
  }, [instance]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading: loading || inProgress !== "none",
      entraEnabled: true,
      authError,
      clearAuthError,
      signInWithMicrosoft,
      signOut,
      refresh,
    }),
    [
      me,
      loading,
      inProgress,
      authError,
      clearAuthError,
      signInWithMicrosoft,
      signOut,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <EntraAuthProvider>{children}</EntraAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
