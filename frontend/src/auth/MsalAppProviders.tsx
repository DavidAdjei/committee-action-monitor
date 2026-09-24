import { useEffect, useState, type ReactNode } from "react";
import { MsalProvider } from "@azure/msal-react";
import type { PublicClientApplication, AuthenticationResult } from "@azure/msal-browser";
import { getMsalInstance, isEntraConfigured } from "@/auth/msalConfig";
import { setAccessToken } from "@/auth/token";
import { setDevUserId } from "@/api/client";
import { AuthProvider } from "@/state/authContext";
import { LoadingLogo } from "@/components/LoadingLogo";

/**
 * When Entra is configured, wraps the tree in MsalProvider so
 * AuthenticatedTemplate / UnauthenticatedTemplate / useMsal work.
 * Processes the redirect response once during bootstrap.
 */
export function MsalAppProviders({ children }: { children: ReactNode }) {
  const entra = isEntraConfigured();
  const [instance, setInstance] = useState<PublicClientApplication | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!entra) return;
    let cancelled = false;
    (async () => {
      try {
        const msal = await getMsalInstance();
        let result: AuthenticationResult | null = null;
        try {
          result = await msal.handleRedirectPromise();
        } catch (e) {
          console.error("MSAL redirect handling failed", e);
        }
        if (result?.account) {
          msal.setActiveAccount(result.account);
          if (result.accessToken) setAccessToken(result.accessToken);
          setDevUserId(null);
        } else {
          const accounts = msal.getAllAccounts();
          if (accounts[0]) msal.setActiveAccount(accounts[0]);
        }
        if (!cancelled) setInstance(msal);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : "Failed to initialize Microsoft sign-in.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entra]);

  if (!entra) {
    return <AuthProvider mode="dev">{children}</AuthProvider>;
  }

  if (bootError) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-red-600 dark:text-red-400">{bootError}</p>
          <p className="mt-2 text-xs text-slate-500">Check VITE_PUBLIC_AZURE_* environment variables.</p>
        </div>
      </div>
    );
  }

  if (!instance) {
    return <LoadingLogo scope="fullscreen" message="Starting Microsoft sign-in…" />;
  }

  return (
    <MsalProvider instance={instance}>
      <AuthProvider mode="entra">{children}</AuthProvider>
    </MsalProvider>
  );
}
