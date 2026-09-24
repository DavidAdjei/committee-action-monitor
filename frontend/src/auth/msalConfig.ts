import {
  LogLevel,
  PublicClientApplication,
  type Configuration,
  type RedirectRequest,
} from "@azure/msal-browser";

/**
 * Env (prefer VITE_PUBLIC_* to match bank templates; VITE_ENTRA_* still supported):
 * - VITE_PUBLIC_AZURE_CLIENT_ID / VITE_ENTRA_CLIENT_ID
 * - VITE_PUBLIC_AZURE_TENANT_ID / VITE_ENTRA_TENANT_ID
 * - VITE_PUBLIC_SCOPE / VITE_ENTRA_API_SCOPE  (API scope or User.Read)
 */

const clientId =
  (import.meta.env.VITE_PUBLIC_AZURE_CLIENT_ID as string | undefined) ||
  (import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined);

const tenantId =
  (import.meta.env.VITE_PUBLIC_AZURE_TENANT_ID as string | undefined) ||
  (import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined);

const scope =
  (import.meta.env.VITE_PUBLIC_SCOPE as string | undefined) ||
  (import.meta.env.VITE_ENTRA_API_SCOPE as string | undefined);

export function isEntraConfigured(): boolean {
  return Boolean(clientId && tenantId && scope);
}


export function getClientId(): string | undefined {
  return clientId;
}

export function getTenantId(): string | undefined {
  return tenantId;
}

export function getConfiguredScope(): string | undefined {
  return scope;
}

// MSAL configuration for Azure Entra ID
export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "missing-client-id",
    authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
    postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    // sessionStorage is safer for shared machines
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
          case LogLevel.Info:
          case LogLevel.Verbose:
          default:
            return;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

/** Scopes for login / token (API access_as_user or Graph User.Read). */
export const loginRequest: RedirectRequest = {
  scopes: scope ? [scope] : [],
};

/** Graph API endpoints (optional profile enrichment). */
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
};

export function getLoginRequest(): RedirectRequest {
  if (!scope) {
    throw new Error(
      "Set VITE_PUBLIC_SCOPE (or VITE_ENTRA_API_SCOPE), e.g. api://<api-app-id>/access_as_user or User.Read",
    );
  }
  return { scopes: [scope] };
}

export function getTokenRequest(): RedirectRequest {
  return getLoginRequest();
}

export function getMsalConfig(): Configuration {
  if (!clientId || !tenantId) {
    throw new Error(
      "Set VITE_PUBLIC_AZURE_CLIENT_ID and VITE_PUBLIC_AZURE_TENANT_ID (or VITE_ENTRA_* equivalents).",
    );
  }
  return {
    ...msalConfig,
    auth: {
      ...msalConfig.auth,
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: typeof window !== "undefined" ? window.location.origin : msalConfig.auth?.redirectUri,
      postLogoutRedirectUri:
        typeof window !== "undefined" ? window.location.origin : msalConfig.auth?.postLogoutRedirectUri,
    },
  };
}

/** Single shared MSAL instance (required for redirect login to work). */
let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = new PublicClientApplication(getMsalConfig());
    await instance.initialize();
    msalInstance = instance;
    return instance;
  })();

  return initPromise;
}
