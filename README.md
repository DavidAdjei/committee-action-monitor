# Committee Action Monitor

A modern, full-stack governance application for tracking committee action points, evidence, and escalations. Built with Azure Functions (TypeScript), React (TypeScript), Prisma ORM, and MySQL.

**Recreated from the original Next.js prototype** with a production-ready backend architecture, comprehensive authorization model, and audit logging.

## Architecture

```
committee-action-monitor/
├── backend/              # Azure Functions API
│   ├── prisma/
│   │   ├── schema.prisma   # Data model (Entra identity key, memberships, snapshots, audit)
│   │   └── seed.ts         # Sample data seeding
│   ├── src/
│   │   ├── lib/            # HTTP, auth, authorization helpers
│   │   ├── services/       # Domain logic (actions, meetings, minutes, notifications, etc.)
│   │   └── functions/      # HTTP endpoints (committees, meetings, actions, evidence, etc.)
│   ├── package.json
│   ├── tsconfig.json
│   └── host.json
└── frontend/             # Vite + React + TypeScript
    ├── src/
    │   ├── api/            # Typed API client
    │   ├── components/     # Reusable UI (modals, panels, shared bits)
    │   ├── pages/          # Route pages
    │   ├── state/          # Auth & toast contexts
    │   ├── styles/         # Tailwind CSS entry
    │   └── types.ts        # Shared TypeScript types
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── package.json
```

## Key Features

### Backend (Azure Functions)

- **Identity & Authorization**: Entra ID (Easy Auth) + dev fallback for local development
- **Prisma + MySQL**: Full relational schema with optimistic concurrency, audit events, notification outbox
- **Action Lifecycle**: Create → Update (with evidence) → Verify (Pending Verification) → Complete
- **Evidence Handling**: Local filesystem storage (dev), pluggable for Azure Blob Storage
- **Notification Outbox**: Transactional, idempotent delivery queue (CREATED, DAILY_REMINDER, STATUS_CHANGE, etc.)
- **Escalation Job**: Daily timer trigger for reminders (14 days before deadline) and overdue transitions
- **Immutable Minutes**: Snapshots of action status at issuance time, never overwritten
- **Audit Trail**: Every create/update logged with actor, resource, before/after state

### Frontend (React + Vite)

- **Tailwind CSS**: Modern, responsive design
- **TypeScript**: Type-safe components and API integration
- **Role-Based UI**: Central Committee, Administrators, Chairpersons, Secretaries, Members, Owners
- **Dev Sign-In**: Local picker for testing without Entra ID
- **Modals**: New Action, Status Update, Create Meeting, Create Minutes, Add Committee
- **Pages**: Dashboard (bank-wide), Committees (list + workspace), Action Points (register), Notifications
- **Action Detail Panel**: History, evidence, stakeholders, verify/update controls

## Prerequisites

### Local Development

- **Node.js** 18+ (with npm)
- **MySQL** 8.0+ (local instance or container)
- **Azure Functions Core Tools** 4.x (for backend)
- **Vite** (included in frontend dependencies)

### Production Deployment

- **Azure subscription** with:
  - Azure Functions (v4+)
  - Azure SQL Database or managed MySQL
  - Azure Storage (for evidence files)
  - Azure App Service Authentication (Easy Auth / Entra ID)
  - Application Insights (recommended)
- **Microsoft 365 tenant** for Entra ID and optional Teams integration

## Getting Started

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Generate Prisma client
DATABASE_URL="mysql://user:password@localhost:3306/committee_actions" \
  npx prisma generate

# Create database and run migrations
npm run prisma:migrate

# Seed sample data
npm run prisma:seed

# Start the local Functions app
npm run dev
```

The Functions app will listen on `http://localhost:7071`. Test the `/api/me` endpoint:

```bash
curl -H "x-dev-user-id: 1" http://localhost:7071/api/me
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (proxies /api to http://localhost:7071)
npm run dev
```

Visit `http://localhost:5173/signin` in your browser. The dev sign-in picker loads a list of seeded users — select one to start.

## API Endpoints

All endpoints live under `/api` and require authentication (Entra ID or dev header `x-dev-user-id`).

### Identity & Auth

- `GET /me` — Current user, memberships, effective roles
- `GET /dev/users` — Dev-only: List seeded users for sign-in picker

### Committees

- `GET /committees` — List committees you can view
- `POST /committees` — Create committee (admin only)
- `GET /committees/{id}` — Committee detail, members, pending verifications, summary
- `GET /committees/{id}/meetings` — Meetings for this committee
- `POST /committees/{id}/meetings` — Create meeting (officer only)
- `GET /committees/{id}/actions` — Actions for this committee (with status/search filters)
- `POST /committees/{id}/actions` — Create action point (officer only)

### Actions

- `GET /actions` — Global consolidated register (read-only, all permitted committees)
- `GET /actions/{id}` — Action detail with history, evidence, stakeholders
- `POST /actions/{id}/updates` — Record a status/progress update (owner or officer)
- `POST /actions/{id}/verify` — Approve or reject completion (officer only)
- `POST /actions/{id}/evidence/upload` — Upload evidence file for an action
- `GET /evidence/{evidenceId}/download` — Download evidence (authorization-checked)

### Minutes

- `GET /meetings/{meetingId}/minutes` — Minutes for a meeting
- `POST /meetings/{meetingId}/minutes` — Create draft minutes (officer only)
- `POST /minutes/{minutesId}/issue` — Issue and notify (officer only)
- `POST /minutes/{minutesId}/approve` — Approve (officer only)

### Notifications

- `GET /notifications` — Inbox for current user
- `POST /notifications/{id}/read` — Mark as read
- `POST /notifications/read-all` — Mark all as read

### Reports & Directory

- `GET /reports/dashboard` — Bank-wide summary (Central Committee only)
- `GET /reports/committee-summary` — Per-committee summaries
- `GET /directory?q=name` — User directory search (for pickers)

### Internal Jobs

- `dailyReminderTimer` (timer trigger, 08:00 UTC) — Queue reminders and escalate overdue actions

## Configuration

### Environment Variables (Backend)

Create `backend/local.settings.json` (copy from `local.settings.json.example`):

```json
{
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "DATABASE_URL": "mysql://cam_app:changeme@localhost:3306/committee_actions",
    "CORS_ALLOWED_ORIGIN": "http://localhost:5173",
    "DEV_AUTH_ENABLED": "true"
  }
}
```

In production:
- Set `DEV_AUTH_ENABLED` to unset (or "false")
- Wire `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` for Teams integration
- Set `EVIDENCE_STORAGE_CONNECTION_STRING` for Azure Blob Storage (and implement the upload path in `storageService.ts`)

### Environment Variables (Frontend)

Create `frontend/.env` (or use `frontend/.env.example`):

```
VITE_API_BASE_URL=/api
```

In production, update to your Functions app URL if not proxied.

## Data Model Highlights

### Users & Committees

- **User**: Identified by `entraObjectId` (Entra principal) — the durable key for directory lookups
- **CommitteeMembership**: A user's role (Chairperson, Secretary, Member) is scoped to one committee — same person can chair one committee and be a secretary in another
- **Authorization**: Chairperson/Secretary are officers who can create actions, meetings, minutes, and verify evidence; Members and Central Committee Members are read-only; Central Committee Administrators can create committees

### Action Lifecycle

1. **OPEN** — Created, awaiting work to start
2. **IN_PROGRESS** — Owner updates progress toward completion
3. **PENDING_VERIFICATION** — Owner submits evidence; awaits officer approval (not auto-closed)
4. **COMPLETED** — Officer approved the evidence
5. **OVERDUE** — Deadline passed while still active; owner posts blocker/revised deadline
6. **CANCELLED** — Officers withdrew the action

### Evidence & Audit

- **EvidenceFile**: Each update record can have multiple files; metadata stored in the relational DB, binaries in local FS or Blob Storage
- **ActionUpdate**: Append-only history — never rewritten — captures status, progress, notes, revised deadlines, evidence links
- **AuditEvent**: Every create/update operation is logged with the actor, resource type, before/after JSON, and result (SUCCESS/DENIED)

### Minutes & Snapshots

- **MeetingMinutes**: Drafted, issued (notifies stakeholders), optionally approved
- **MinuteActionSnapshot**: Immutable capture of each included action's status, progress, remarks at issuance time — later action updates never touch these rows
- **sourcePopulation**: Indicates which actions were included (latest meeting, previous meeting, all open across the bank)

## Deployment Guide

### Azure Functions

1. **Create a Function App** in Azure Portal (v4, Node.js 20 LTS, Linux)
2. **Connect to MySQL** — Update `DATABASE_URL` in app settings; use Azure SQL's connection string or managed MySQL
3. **Deploy the code**:
   ```bash
   cd backend
   npm run build
   func azure functionapp publish <your-function-app-name>
   ```
4. **Enable Easy Auth** — In Functions > Authentication, turn on Microsoft Entra ID
5. **Run migrations** — Connect remotely and execute `npx prisma migrate deploy`

### React Frontend

1. **Build** from `frontend/`:
   ```bash
   npm run build
   ```
2. **Deploy** `dist/` to Azure Static Web Apps, or Docker, or GitHub Pages — make sure `/api` proxy points to your Functions app

### Evidence Storage

**Local (development)**:
- Files go into `.evidence-storage/` folder
- Already configured in `storageService.ts`

**Azure Blob Storage (production)**:
- Create a storage account and container
- Set `EVIDENCE_STORAGE_CONNECTION_STRING` in app settings
- Implement the upload/download paths in `src/services/storageService.ts` using the `@azure/storage-blob` SDK
- Add the SDK to `package.json`: `npm install @azure/storage-blob`

### Microsoft Teams Integration

When a meeting is created with `teamsRequested: true`:
1. The API saves the meeting as `teamsRequested: true` with no `teamsEventId` or `teamsJoinUrl` yet
2. A background job (e.g., Azure Logic App, APIM policy, or manual workflow) should:
   - Call Microsoft Graph to create an online meeting under the committee owner's calendar
   - Invoke `PATCH /api/meetings/{id}/attach-teams` to store the event ID and join URL
3. Stakeholders receive the join URL in meeting notifications

For now, this integration is a seam — the backend provides `attachTeamsEvent()` in `meetingService.ts` but does not call Graph itself.

## Development Tips

### Prisma Studio

Browse the database live:

```bash
cd backend
DATABASE_URL="mysql://user:password@localhost:3306/committee_actions" npx prisma studio
```

Opens a web UI at `http://localhost:5555`.

### Resetting the Database

```bash
cd backend
npx prisma migrate reset  # Clears everything and re-runs seed
```

### API Testing

Use the included `dev/users` endpoint to pick a user, then test endpoints with the header:

```bash
curl -H "x-dev-user-id: 1" http://localhost:7071/api/committees
```

Or use a REST client (Postman, VS Code REST Client, etc.).

### Frontend Routes

- `/signin` — Dev user picker
- `/dashboard` — Bank-wide metrics (Central Committee only)
- `/committees` — Committee list
- `/committees/{id}` — Committee workspace (overview, actions, meetings tabs)
- `/actions` — Global consolidated action register
- `/notifications` — Notification inbox

## Architecture Decisions

### Why Prisma?

- Type-safe ORM matching TypeScript everywhere
- Zero boilerplate migrations (`npx prisma migrate dev`)
- Strong relational capabilities (foreign keys, cascade, transactions)
- Native support for JSON fields (audit events, rich business data)

### Why Transactional Notifications Outbox?

- Durability: Actions are committed before notifications are sent, so no loss even if the mailer goes down
- Idempotency: Duplicate writes with the same `idempotencyKey` are no-ops — safe to retry
- Decoupling: The notification sender is a separate job, not on the HTTP request path

### Why Immutable Minute Snapshots?

- Auditability: Meeting minutes are legal records; actions' status at meeting time is locked forever
- Historical accuracy: "The minutes said the action was 50% complete" — that statement is always verifiable
- Simplicity: No need to handle "what if someone changed an action after minutes were issued?"

### Why Optimistic Concurrency on Action Updates?

- Prevents lost updates when two users edit the same action simultaneously
- Resolved by reloading and retrying — typical conflict scenario is rare (same person updating from two tabs)
- Keeps the code simple vs. pessimistic locking (which requires transactions to span HTTP requests)

## Extending the Application

### Adding a New Endpoint

1. Create a new function in `src/functions/yourfeature.ts`:
   ```typescript
   import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
   import { requireUser } from "../lib/auth";
   import { ok, errorResponse } from "../lib/http";

   async function handler(req: HttpRequest): Promise<HttpResponseInit> {
     try {
       const user = await requireUser(req);
       // Your logic here
       return ok({ result: "success" });
     } catch (err) {
       return errorResponse(err);
     }
   }

   app.http("yourfeature", {
     methods: ["GET", "POST"],
     authLevel: "anonymous",
     route: "yourfeature/{id}",
     handler,
   });
   ```

2. Import it in `src/index.ts`:
   ```typescript
   import "./functions/yourfeature";
   ```

3. Test locally at `http://localhost:7071/api/yourfeature`

### Adding a New Page

1. Create `frontend/src/pages/YourPage.tsx` with React component
2. Export it in `frontend/src/App.tsx` and add a route:
   ```typescript
   <Route path="/yourpage" element={<RequireAuth><YourPage /></RequireAuth>} />
   ```
3. Add a nav link in `frontend/src/components/Layout.tsx`

### Adding a New Modal

1. Create `frontend/src/components/modals/YourModal.tsx`
2. Use the `<Modal>` shell and `<ModalActions>` footer
3. Call your API endpoint via the `endpoints` helper
4. Toast success with `useFlash()`

## Troubleshooting

### Functions App Won't Start

```bash
npm run build  # Compile TS to JS
npm run dev    # Start locally
```

Check that MySQL is running and `DATABASE_URL` is correct in `local.settings.json`.

### Frontend Can't Call API

Ensure the Vite dev server proxy is configured in `vite.config.ts`:

```typescript
proxy: {
  "/api": { target: "http://localhost:7071", changeOrigin: true }
}
```

### Prisma Client Not Found

```bash
DATABASE_URL="mysql://..." npx prisma generate
```

### "Permission denied" on Actions

- Server re-checks authorization on every write — UI permission checks are display-only
- Verify the user has the required role in the target committee via `/api/me`
- Check `AuditEvent` logs to see if the operation was `DENIED`

## License

This project is provided as-is for educational and governance purposes.

## Support & Contribution

This is a reference implementation. For production use:

1. Customize the email templates and notification dispatch (section 7 of the system documentation)
2. Wire Microsoft Teams integration (see "Deployment Guide" above)
3. Configure Azure Blob Storage for evidence files
4. Add your Bank's branding and styling
5. Implement any additional compliance or audit requirements
6. Set up monitoring and alerting via Application Insights

---

**Built with**: Azure Functions · Prisma · MySQL · React · Vite · Tailwind CSS

**For the original prototype documentation**, see the included `Committee_Action_Monitor_System_Documentation.docx`.
