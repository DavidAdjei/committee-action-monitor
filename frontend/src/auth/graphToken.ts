import { getGraphTeamsTokenRequest, getMsalInstance, isEntraConfigured } from "@/auth/msalConfig";

/**
 * Acquire a delegated Graph token with OnlineMeetings.ReadWrite for interactive Teams create.
 * Silent only — does not redirect (that would abandon the create-meeting request).
 * If silent fails, returns null so the API can try OBO or application permissions.
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
  } catch (err) {
    console.warn(
      "[teams] Silent Graph OnlineMeetings.ReadWrite token unavailable; API will try OBO/application.",
      err,
    );
    return null;
  }
}
