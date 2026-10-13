# Committee Action Monitor — Frontend (Web)

React + TypeScript + Vite SPA.  
Sign-in is **Microsoft Entra ID (MSAL) only**. The UI talks to the backend API with a Bearer access token.

## Prerequisites

- **Node.js** 20 LTS (or 18+)
- Backend API running (see `../backend/README.md`) — default `http://localhost:7071`
- **Entra ID SPA app registration** with redirect URI for local dev, e.g. `http://localhost:5173`

## 1. Install

```bash
cd frontend
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# With Vite proxy (recommended for local dev) — leave as /api
VITE_API_BASE_URL=/api

# SPA app registration
VITE_PUBLIC_AZURE_CLIENT_ID=<spa-client-id>
VITE_PUBLIC_AZURE_TENANT_ID=<tenant-guid>

# Scope for the API app (must match backend ENTRA_API_AUDIENCE)
# Example: api://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/access_as_user
VITE_PUBLIC_SCOPE=api://<api-client-id>/access_as_user
```

Aliases `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, and `VITE_ENTRA_API_SCOPE` work if the `VITE_PUBLIC_*` variables are empty.

## 3. Start the UI

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Vite proxies `/api` → `http://localhost:7071` (see `vite.config.ts`). Start the **backend first** so API calls succeed after sign-in.

## 4. Sign in

1. Open the app → **Sign in with Microsoft**.
2. Use a UMB work account that exists in the API database (seed or directory sync).
3. After consent, you land on a home page based on your role (dashboard, committees, or actions).

Sign-out clears only this app’s MSAL session (Teams / Outlook stay signed in).

## Useful scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Local dev server (port 5173) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | TypeScript check only (`tsc --noEmit`) |

## Project layout

```text
frontend/
  src/
    api/          HTTP client + endpoints
    auth/         MSAL config, token helper
    components/   UI (layout, modals, panels)
    pages/        Routes (dashboard, committees, actions, …)
    state/        Auth, theme, toasts
    lib/          Permissions, helpers
  vite.config.ts  Dev server + /api proxy
```

## Entra checklist (SPA)

1. Platform: **Single-page application**
2. Redirect URI: `http://localhost:5173` (and production URL when deployed)
3. API permissions: delegated access to your **API app** scope (admin consent)
4. Backend `ENTRA_API_AUDIENCE` must match the resource/audience of `VITE_PUBLIC_SCOPE`

## Troubleshooting

| Problem | Check |
|---------|--------|
| “Microsoft sign-in is required” on boot | `.env` missing client id / tenant / scope — restart `npm run dev` after changes |
| Sign-in works but blank / “not set up” | User missing in DB — run backend seed or directory sync |
| API 401 after login | Scope/audience mismatch between SPA token and backend `ENTRA_API_AUDIENCE` |
| Network errors to `/api` | Backend not running on 7071, or `VITE_API_BASE_URL` wrong |
| Vite 8 / Rolldown warnings | Keep **Vite 5** (`~5.4.x` in package.json); avoid `npm audit fix --force` |

## Production build

```bash
npm run build
```

Deploy the `dist/` folder to your static host (Azure Static Web Apps, Blob static website, etc.). Set production env vars at build time (`VITE_*` are baked in at build). Point `VITE_API_BASE_URL` at the public API base URL if you are not using a same-origin reverse proxy.
