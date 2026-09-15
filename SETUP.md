# Quick Start

## Prerequisites

- Node.js 18+
- MySQL 8.0+ (running locally or via Docker)
- Azure Functions Core Tools 4.x (optional, for local debugging)

## Local Development (5 minutes)

### 1. Start MySQL (if not running)

```bash
docker run -d \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=committee_actions \
  -e MYSQL_USER=cam_app \
  -e MYSQL_PASSWORD=changeme \
  -p 3306:3306 \
  mysql:8.0
```

### 2. Backend

```bash
cd backend

# Install & setup
npm install
npm run prisma:migrate
npm run prisma:seed

# Start (listens on localhost:7071)
npm run dev
```

Test: `curl -H "x-dev-user-id: 1" http://localhost:7071/api/me`

### 3. Frontend

```bash
cd frontend

# Install & start (listens on localhost:5173, proxies /api to backend)
npm install
npm run dev
```

Visit `http://localhost:5173/signin` and pick a user.

---

Done! You now have:
- ✅ API running at http://localhost:7071/api
- ✅ Frontend running at http://localhost:5173
- ✅ Sample data: 5 committees, 14 users, 6 actions
- ✅ Dev sign-in: 14 pre-seeded users to test roles

Next:
- Explore the committee workspace at `/committees/1`
- Try creating a new action point
- Test the global register at `/actions`
- Check notifications

See [README.md](./README.md) for full documentation, deployment, and extension guides.
