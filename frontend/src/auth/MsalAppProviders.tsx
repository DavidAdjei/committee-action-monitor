import { useEffect, useState, type ReactNode } from "react";
import { MsalProvider } from "@azure/msal-react";
import type { PublicClientApplication, AuthenticationResult } from "@azure/msal-browser";
import { getMsalInstance, isEntraConfigured } from "@/auth/msalConfig";
import { setAccessToken } from "@/auth/token";
import { AuthProvider } from "@/state/authContext";
import { LoadingLogo } from "@/components/LoadingLogo";

/**
 * Requires Entra (MSAL) configuration. Production auth is Bearer JWT only.
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
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-lg font-semibold text-white">Microsoft sign-in is required</p>
          <p className="text-sm text-slate-400">
            Set <code className="text-brand-300">VITE_PUBLIC_AZURE_CLIENT_ID</code>,{" "}
            <code className="text-brand-300">VITE_PUBLIC_AZURE_TENANT_ID</code>, and{" "}
            <code className="text-brand-300">VITE_PUBLIC_AZURE_API_SCOPE</code> (or equivalent
            VITE_ENTRA_* variables) for this SPA. Demo / header-based sign-in has been removed.
          </p>
        </div>
      </div>
    );
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
      <AuthProvider>{children}</AuthProvider>
    </MsalProvider>
  );
}
