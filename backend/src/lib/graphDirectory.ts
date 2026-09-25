/**
 * Microsoft Graph directory sync (application permissions).
 * Lists tenant users and upserts them into the local User table.
 *
 * Required app permission (admin consent): User.Read.All
 * Reads department, accountEnabled, userType; skips disabled and guests.
 *
 * Auth: client credentials (app-only).
 *
 * Env (either prefix works):
 *   ENTRA_GRAPH_TENANT_ID / GRAPH_TENANT_ID
 *   ENTRA_GRAPH_CLIENT_ID  / GRAPH_CLIENT_ID
 *   ENTRA_GRAPH_CLIENT_SECRET / GRAPH_CLIENT_SECRET
 *
 * Optional:
 *   GRAPH_SYNC_EXCLUDE_PREFIXES=svc-,sa-,noreply,app-   (comma-separated local-part prefixes)
 */
import { prisma } from "./prisma";
import { Errors } from "./http";

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
  department?: string | null;
  accountEnabled?: boolean;
  userType?: string | null;
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

function excludePrefixes(): string[] {
  const raw = env("GRAPH_SYNC_EXCLUDE_PREFIXES", ["ENTRA_GRAPH_SYNC_EXCLUDE_PREFIXES"]);
  if (!raw) return ["svc-", "sa-", "noreply", "no-reply", "app-", "sp-"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
 * List enabled member users (User.Read.All).
 * Filter: accountEnabled eq true and userType eq 'Member'
 * Advanced query requires ConsistencyLevel: eventual + $count=true.
 */
async function listAllGraphUsers(accessToken: string): Promise<GraphUser[]> {
  const select =
    "$select=id,displayName,mail,userPrincipalName,department,accountEnabled,userType";
  const filter = "$filter=accountEnabled eq true and userType eq 'Member'";
  // $count=true required with ConsistencyLevel eventual for this filter combination
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users?${select}&${filter}&$count=true&$top=100`;

  const out: GraphUser[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw Errors.badRequest(
        `Graph users list failed: ${res.status} ${t.slice(0, 300)}. ` +
          `Ensure the app has Application permission User.Read.All with admin consent.`,
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

/** Drop obvious service / system accounts by local-part prefix. */
function isLikelyServiceAccount(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return excludePrefixes().some((p) => local.startsWith(p));
}

/**
 * Upsert Graph users into local DB.
 * Match order: entraObjectId → email → create new.
 * Does not delete local users missing from Graph.
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
    if (isLikelyServiceAccount(email)) {
      skipped += 1;
      continue;
    }
    // Defence in depth if Graph filter was ignored
    if (g.accountEnabled === false || (g.userType && g.userType.toLowerCase() === "guest")) {
      skipped += 1;
      continue;
    }

    const fullName = (g.displayName || email.split("@")[0]).trim();
    const department = g.department ?? null;
    // After the skip above, remaining users are enabled (or accountEnabled omitted)
    const active = true;

    const byOid = await prisma.user.findUnique({ where: { entraObjectId: g.id } });
    if (byOid) {
      await prisma.user.update({
        where: { id: byOid.id },
        data: { fullName, email, department, active },
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
          department,
          active,
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
        department,
        active,
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
