/**
 * Microsoft Graph directory sync (application permissions).
 * Lists tenant users and upserts them into the local User table.
 *
 * Required app permission (admin consent): User.ReadBasic.All
 * (Works with the limited basic profile — id, displayName, mail, UPN.
 *  Does not read department or accountEnabled; those need User.Read.All.)
 *
 * Auth: client credentials (app-only).
 *
 * Env (either prefix works):
 *   ENTRA_GRAPH_TENANT_ID / GRAPH_TENANT_ID
 *   ENTRA_GRAPH_CLIENT_ID  / GRAPH_CLIENT_ID
 *   ENTRA_GRAPH_CLIENT_SECRET / GRAPH_CLIENT_SECRET
 */
import { prisma } from "./prisma";
import { Errors } from "./http";

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
};

function env(name: string, aliases: string[] = []): string | undefined {
  const keys = [name, ...aliases];
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function graphConfigured(): boolean {
  return Boolean(
    env("ENTRA_GRAPH_TENANT_ID", ["GRAPH_TENANT_ID"]) &&
      env("ENTRA_GRAPH_CLIENT_ID", ["GRAPH_CLIENT_ID"]) &&
      env("ENTRA_GRAPH_CLIENT_SECRET", ["GRAPH_CLIENT_SECRET"]),
  );
}

async function getAppToken(): Promise<string> {
  const tenant = env("ENTRA_GRAPH_TENANT_ID", ["GRAPH_TENANT_ID"])!;
  const clientId = env("ENTRA_GRAPH_CLIENT_ID", ["GRAPH_CLIENT_ID"])!;
  const clientSecret = env("ENTRA_GRAPH_CLIENT_SECRET", ["GRAPH_CLIENT_SECRET"])!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw Errors.badRequest(`Graph token request failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw Errors.badRequest("Graph token response missing access_token.");
  return json.access_token;
}

/**
 * List users using only properties allowed by User.ReadBasic.All.
 * No $filter on accountEnabled / department — those require User.Read.All.
 */
async function listAllGraphUsers(accessToken: string): Promise<GraphUser[]> {
  const select = "$select=id,displayName,mail,userPrincipalName";
  let url: string | null = `https://graph.microsoft.com/v1.0/users?${select}&$top=100`;

  const out: GraphUser[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const t = await res.text();
      throw Errors.badRequest(
        `Graph users list failed: ${res.status} ${t.slice(0, 300)}. ` +
          `Ensure the app has Application permission User.ReadBasic.All with admin consent.`,
      );
    }
    const json = (await res.json()) as { value?: GraphUser[]; "@odata.nextLink"?: string };
    out.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
  }
  return out;
}

function emailOf(u: GraphUser): string | null {
  const raw = (u.mail || u.userPrincipalName || "").trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

/**
 * Upsert Graph users into local DB.
 * Match order: entraObjectId → email → create new.
 * Does not delete local users missing from Graph.
 *
 * With User.ReadBasic.All: department is left unchanged on update / null on create;
 * active defaults to true (disabled accounts cannot be detected).
 */
export async function syncUsersFromEntra(): Promise<{
  created: number;
  updated: number;
  skipped: number;
  totalFromGraph: number;
}> {
  if (!graphConfigured()) {
    throw Errors.badRequest(
      "Graph directory sync is not configured. Set ENTRA_GRAPH_TENANT_ID, ENTRA_GRAPH_CLIENT_ID, ENTRA_GRAPH_CLIENT_SECRET (or GRAPH_* aliases).",
    );
  }

  const token = await getAppToken();
  const graphUsers = await listAllGraphUsers(token);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const g of graphUsers) {
    const email = emailOf(g);
    if (!email || !g.id) {
      skipped += 1;
      continue;
    }
    const fullName = (g.displayName || email.split("@")[0]).trim();

    const byOid = await prisma.user.findUnique({ where: { entraObjectId: g.id } });
    if (byOid) {
      // Preserve existing department / active — basic profile does not supply them
      await prisma.user.update({
        where: { id: byOid.id },
        data: { fullName, email },
      });
      updated += 1;
      continue;
    }

    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          entraObjectId: byEmail.entraObjectId ?? g.id,
          fullName,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.user.create({
      data: {
        entraObjectId: g.id,
        fullName,
        email,
        department: null,
        active: true,
        isCentralCommittee: false,
        isAdmin: false,
      },
    });
    created += 1;
  }

  return { created, updated, skipped, totalFromGraph: graphUsers.length };
}

export function isGraphDirectoryConfigured(): boolean {
  return graphConfigured();
}
