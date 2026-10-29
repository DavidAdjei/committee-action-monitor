# Committee Action Monitor — Backend (API)

Azure Functions (TypeScript) API with Prisma and MySQL.  
Authentication is **Microsoft Entra ID only** (Bearer JWT). There is no demo / header-based sign-in.

## Prerequisites

- **Node.js** 20 LTS (or 18+)
- **MySQL** 8.x running locally or reachable from your machine
- **Azure Functions Core Tools** v4 (`func`)
  - https://learn.microsoft.com/azure/azure-functions/functions-run-local
- **Entra ID** app registrations (API + SPA) with admin consent for your tenant

Optional for local storage emulators: Azurite (only if you use Azure Storage locally).

## 1. Install

```bash
cd backend
npm install
npx prisma generate
```

## 2. Configure environment

Copy the example settings and fill in real values:

```bash
cp local.settings.json.example local.settings.json
# optional: also keep a .env for Prisma CLI
cp .env.example .env
```

**Minimum to run and sign in:**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MySQL connection string |
| `ENTRA_TENANT_ID` | Your Entra tenant GUID |
| `ENTRA_API_AUDIENCE` | API app audience, e.g. `api://{api-client-id}` |
| `CORS_ALLOWED_ORIGIN` | Local SPA origin, e.g. `http://localhost:5173` |
| `APP_PUBLIC_URL` | Same as SPA URL (used in email links) |

**Optional (mail, directory, Teams):**

| Variable | Purpose |
|----------|---------|
| `ENTRA_GRAPH_TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` | Graph app registration |
| `ENTRA_GRAPH_MAIL_SENDER` | Mailbox used to send mail |
| `MAIL_DEV_LOG` | `true` = log mail instead of sending (local only) |
| `ENTRA_AUTO_PROVISION` | `true` = create user on first login (prefer directory sync in production) |

`local.settings.json` must put these under `"Values"` (Azure Functions style). Prisma reads `DATABASE_URL` from `.env` or the environment.

## 3. Database

Create an empty MySQL database, then:

```bash
# Development (applies migrations + can prompt for names)
npx prisma migrate dev

# Or production-style apply only
npx prisma migrate deploy

# Seed committees and users (including platform admins)
npx prisma db seed
# or: npm run prisma:seed
```

After seed, users can sign in with Microsoft once their Entra account matches a seeded/synced user (email or `entraObjectId`).

## 4. Start the API

```bash
npm start
```

This builds TypeScript and runs `func start`. Default local URL:

```text
http://localhost:7071/api
```

Health-style routes and business APIs are under `/api/...` (see `src/functions/`).

## 5. Useful scripts

| Command | What it does |
|---------|----------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Build + start Azure Functions host |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:seed` | Seed users and committees |
| `npm test` | Run unit tests |

## Auth (how sign-in works)

1. SPA signs the user in with MSAL and requests an access token for **this API** (`ENTRA_API_AUDIENCE` / `VITE_PUBLIC_SCOPE`).
2. Every API call sends `Authorization: Bearer <token>`.
3. The API validates the JWT (tenant + audience) and resolves the user in the database by Entra object id (or first-time email link when `entraObjectId` is still empty).

If a user is missing from the database, run directory sync (admin) or seed, or enable `ENTRA_AUTO_PROVISION` only if approved.

## Project layout

```text
backend/
  prisma/           Schema, migrations, seed
  src/
    functions/      HTTP + timer triggers
    lib/            auth, Prisma, HTTP helpers
    services/       Business logic
  host.json
  local.settings.json.example
```

## Troubleshooting

| Problem | Check |
|---------|--------|
| `UNAUTHENTICATED` / 401 | Bearer token present? `ENTRA_TENANT_ID` + `ENTRA_API_AUDIENCE` set? Token audience matches API app? |
| `ACCOUNT_NOT_PROVISIONED` | User not in DB — seed or directory sync |
| `IDENTITY_CONFLICT` | Email already linked to a different Entra oid — resolve in DB/admin |
| Prisma connection errors | `DATABASE_URL` host, user, password, database name |
| CORS errors in browser | `CORS_ALLOWED_ORIGIN` must match the SPA origin exactly |

## Production notes

- Do **not** enable demo auth flags (removed from this codebase).
- Prefer `ENTRA_AUTO_PROVISION=false` and directory sync.
- Set `MAIL_DEV_LOG=false` and configure Graph mail for real email.
- Use `prisma migrate deploy` in CI/CD, not `migrate dev`.
