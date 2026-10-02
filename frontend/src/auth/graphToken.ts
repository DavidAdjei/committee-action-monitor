import type { IPublicClientApplication } from "@azure/msal-browser";
import { getGraphTeamsTokenRequest, getMsalInstance, isEntraConfigured } from "@/auth/msalConfig";

/**
 * Acquire a delegated Graph token with OnlineMeetings.ReadWrite for interactive Teams create.
 * Returns null when Entra is not configured or silent acquisition fails (caller may still rely on OBO).
 */
export async function acquireGraphTeamsToken(): Promise<string | null> {
  if (!isEntraConfigured()) return null;
  try {
    const instance = await getMsalInstance();
    const accounts = instance.getAllAccounts();
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account) return null;
    const result = await instance.acquireTokenSilent({
      ...getGraphTeamsTokenRequest(),
      account,
    });
    return result.accessToken ?? null;
  } catch {
    try {
      const instance = await getMsalInstance();
      const accounts = instance.getAllAccounts();
      const account = instance.getActiveAccount() ?? accounts[0];
      if (!account) return null;
      // Interactive consent if OnlineMeetings.ReadWrite was not granted yet
      await instance.acquireTokenRedirect({
        ...getGraphTeamsTokenRequest(),
        account,
      });
      return null; // redirect in progress
    } catch {
      return null;
    }
  }
}
