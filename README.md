# Project Management App

A self-hosted project management dashboard that pulls sprint and delivery KPIs from **Azure DevOps Boards**, persists them to a local **SQL Server** database, and serves them to a React frontend. Authentication supports local password login, Microsoft Entra ID SSO, and optional Duo Security MFA.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| pnpm | 10.4+ (`npm install -g pnpm`) |
| SQL Server | 2019+ or Azure SQL (local or remote) |

> **Local SQL Server on the same host?** The app auto-detects `localhost` / `127.0.0.1` and sets `TrustServerCertificate=true` and `Encrypt=false` automatically — no extra config needed.

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/Simon-Kurth/project-management-app.git
cd project-management-app
pnpm install
```

### 2. Create the database

Run the setup script against your SQL Server instance. From SQL Server Management Studio (SSMS) or `sqlcmd`:

```bash
sqlcmd -S localhost -U sa -P YourPassword -i sql/create-database.sql
```

This creates the `ProjectManagement` database and all required tables (users, KPI snapshots, notifications, etc.).

Then create the `pm_app` least-privilege login that the application uses at runtime:

```bash
sqlcmd -S localhost -U sa -P YourPassword -i sql/create-app-login.sql
```

If you are upgrading from a previous version, apply migrations in order:

```bash
sqlcmd -S localhost -U sa -P YourPassword -i sql/migrate-20260401-add-notifications-table.sql
sqlcmd -S localhost -U sa -P YourPassword -i sql/migrate-20260402-add-notification-preferences-table.sql
```

### 3. Configure environment variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

**Minimum required configuration** (password login only, no Azure Boards):

```env
DATABASE_URL=Server=localhost;Database=ProjectManagement;User Id=sa;Password=YourPassword;
JWT_SECRET=<64-char hex string>
```

Generate a JWT secret:

```bash
openssl rand -hex 32
```

See [Full Environment Variable Reference](#environment-variables) below for all options.

### 4. Run in development

```bash
pnpm dev
```

The server starts on `http://localhost:3000` (auto-increments if the port is busy). The frontend is served by Vite with hot module reloading.

### 5. Seed demo users (optional)

Once the server is running, call the seed endpoint to create demo accounts:

```bash
curl -X POST http://localhost:3000/api/trpc/seed.runSeed
```

Demo credentials:

| Email | Password | Role |
|---|---|---|
| `executive@demo.com` | `Executive@2024!` | executive |
| `company@demo.com` | `Company@2024!` | company |
| `qa@demo.com` | `QA@2024!` | qa |
| `salesmarketing@demo.com` | `SalesMarketing@2024!` | sales_marketing |
| `csm@demo.com` | `CSM@2024!` | csm |

---

## Environment Variables

Create a `.env` file at the project root. All variables are read at startup.

### Core (required)

| Variable | Description |
|---|---|
| `JWT_SECRET` | 64-character hex string for signing session cookies. Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | SQL Server connection string (see formats below). |

### Core (optional)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on. |
| `NODE_ENV` | `development` | Set to `production` for production deployments. |
| `APP_ID` | `project-management-app` | Application identifier used in audit logs. |

### DATABASE_URL formats

**Local SQL Server (recommended for development):**
```
Server=localhost;Database=ProjectManagement;User Id=sa;Password=YourPassword;
```
`TrustServerCertificate` and `Encrypt` are set automatically for localhost.

**Named instance or custom port:**
```
Server=myserver.company.com,1433;Database=ProjectManagement;User Id=sa;Password=YourPassword;Encrypt=true;TrustServerCertificate=true;
```

**Azure SQL:**
```
Server=myserver.database.windows.net;Database=ProjectManagement;User Id=sa;Password=YourPassword;Encrypt=true;TrustServerCertificate=false;
```

**URL format:**
```
mssql://sa:YourPassword@localhost/ProjectManagement
```

---

## Azure DevOps Boards Integration

When configured, the app syncs sprint and delivery KPIs from Azure Boards on a schedule and serves them from the local database (zero API calls on page load).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `AZURE_DEVOPS_ORG` | Yes | Your Azure DevOps organization name (e.g. `mycompany`). |
| `AZURE_DEVOPS_PROJECT` | Yes | Project name (e.g. `MyProject`). |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token with **Read** scope on Work Items. |
| `AZURE_DEVOPS_TEAM` | No | Team name. Defaults to `{project} Team`. |
| `AZURE_SYNC_ENABLED` | No | Set to `true` to enable background sync. Default: `false`. |
| `AZURE_SYNC_INTERVAL_MINUTES` | No | How often to sync. Default: `60`. |

### Creating a Personal Access Token (PAT)

1. Go to `https://dev.azure.com/{your-org}/_usersSettings/tokens`
2. Click **New Token**
3. Set scope: **Work Items → Read**
4. Copy the token into `AZURE_DEVOPS_PAT`

### Force a manual sync

```bash
curl -X POST http://localhost:3000/api/trpc/forceAzureSync \
  -H "Cookie: session=<your-session-cookie>"
```

---

## Microsoft Entra ID SSO (optional)

When all four Entra variables are set, a **Sign in with Microsoft** button appears on the login page. When any is missing, the app falls back to password login.

See [`docs/ENTRA_ACTIVATION_GUIDE.md`](docs/ENTRA_ACTIVATION_GUIDE.md) for step-by-step Azure app registration instructions.

### Environment variables

| Variable | Description |
|---|---|
| `ENTRA_TENANT_ID` | Azure AD tenant GUID. |
| `ENTRA_CLIENT_ID` | App registration Application (client) ID. |
| `ENTRA_CLIENT_SECRET` | App registration client secret value. |
| `ENTRA_REDIRECT_URI` | Must exactly match the redirect URI in your app registration (e.g. `https://your-app.company.com/api/auth/entra/callback`). |

### Entra group → role mapping (optional)

Set any of these to map Azure AD groups to dashboard roles. Users not in a configured group receive the `user` role (no dashboard access). If none are set, all Entra users default to `executive`.

| Variable | Role granted |
|---|---|
| `ENTRA_GROUP_ADMIN` | admin |
| `ENTRA_GROUP_EXECUTIVE` | executive |
| `ENTRA_GROUP_COMPANY` | company |

---

## Duo Security MFA (optional)

When all four Duo variables are set, users are redirected to the Duo Universal Prompt after successful password or Entra login. When any is missing, MFA is bypassed.

See [`docs/DUO_ACTIVATION_GUIDE.md`](docs/DUO_ACTIVATION_GUIDE.md) for setup instructions.

| Variable | Description |
|---|---|
| `DUO_CLIENT_ID` | Client ID from Duo Web SDK application. |
| `DUO_CLIENT_SECRET` | Client secret from Duo Web SDK application. |
| `DUO_API_HOST` | Duo API hostname (e.g. `api-xxxxxxxx.duosecurity.com`). |
| `DUO_REDIRECT_URL` | Callback URL (e.g. `https://your-app.company.com/duo-callback`). |

---

## Roles and Access

| Role | Access |
|---|---|
| `admin` | Full access + user management |
| `executive` | Full dashboard access |
| `company` | Full dashboard access |
| `qa` | QA tab only |
| `sales_marketing` | Sales + Marketing tabs only |
| `csm` | CSM tab only |
| `user` | No dashboard access (login only) |

Roles are assigned in the Users admin panel or via Entra group mappings.

---

## Production Build and Deployment

### Build

```bash
pnpm build
```

This runs two steps:
1. `vite build` — compiles and bundles the React frontend into `dist/`
2. `esbuild` — bundles the Express/tRPC server into `dist/index.js`

### Run

```bash
NODE_ENV=production node dist/index.js
```

### Recommended production `.env`

```env
# Core
DATABASE_URL=Server=myserver.database.windows.net;Database=ProjectManagement;User Id=sa;Password=YourPassword;Encrypt=true;TrustServerCertificate=false;
JWT_SECRET=<openssl rand -hex 32>
NODE_ENV=production
PORT=3000

# Azure Boards
AZURE_DEVOPS_ORG=mycompany
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_PAT=<pat>
AZURE_SYNC_ENABLED=true
AZURE_SYNC_INTERVAL_MINUTES=60

# Entra SSO
ENTRA_TENANT_ID=<tenant-guid>
ENTRA_CLIENT_ID=<client-guid>
ENTRA_CLIENT_SECRET=<secret>
ENTRA_REDIRECT_URI=https://your-app.company.com/api/auth/entra/callback

# Entra groups
ENTRA_GROUP_ADMIN=<group-guid>
ENTRA_GROUP_EXECUTIVE=<group-guid>

# Duo MFA
DUO_CLIENT_ID=<duo-client-id>
DUO_CLIENT_SECRET=<duo-secret>
DUO_API_HOST=api-xxxxxxxx.duosecurity.com
DUO_REDIRECT_URL=https://your-app.company.com/duo-callback
```

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build frontend and backend for production |
| `pnpm start` | Run the production build |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm check` | TypeScript type check (no emit) |
| `pnpm format` | Format all files with Prettier |
| `pnpm db:push` | Generate and apply Drizzle schema migrations |

---

## Project Structure

```
client/          React frontend (Vite, TailwindCSS, shadcn/ui)
  public/        Static assets (logo.svg)
  src/
    components/  Shared UI components (DashboardLayout, etc.)
    pages/       Route-level page components
    _core/       Auth hooks, tRPC client setup

server/          Express + tRPC backend
  _core/         App bootstrap, JWT auth, env config, context
  connectors/    External data connectors
    azureBoards.ts  Azure DevOps Boards KPI pipeline
  routers.ts     All tRPC procedures
  db.ts          Database query helpers
  sqlserver.ts   SQL Server connection pool
  scheduler.ts   Background sync (Azure Boards)

shared/          Types and constants shared between client and server
sql/             SQL Server DDL scripts and migrations
docs/            Setup guides (Entra, Duo)
drizzle/         Drizzle ORM schema and generated migrations
```

---

## Troubleshooting

**Server won't start — "missing required environment variables"**
Ensure `JWT_SECRET` is set in your `.env` file.

**Cannot connect to SQL Server**
- Confirm SQL Server is running and the port (default 1433) is reachable.
- For local instances: ensure TCP/IP is enabled in SQL Server Configuration Manager.
- For named instances: include the instance name — `Server=localhost\SQLEXPRESS`.

**Azure Boards sync not running**
Set `AZURE_SYNC_ENABLED=true` and verify all four `AZURE_DEVOPS_*` variables are set. Check server logs on startup for connector validation errors.

**Entra SSO button not appearing**
All four `ENTRA_*` variables must be set. Check that `ENTRA_REDIRECT_URI` exactly matches the redirect URI configured in your Azure app registration.
