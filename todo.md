# Executive Dashboard — TODO

## Authentication & Security
- [x] JWT session management with access + refresh tokens (via tRPC)
- [x] MFA/TOTP setup and verification (Google Authenticator compatible)
- [x] Secure password hashing (bcrypt)
- [x] Rate limiting on auth endpoints
- [x] Audit logging (login, tab views, API calls, IP, user agent, timestamps)

## RBAC
- [x] Executive role: 5 tabs (Executive Summary, Financials, Delivery, Development, IT/Ops)
- [x] Company role: all 9 tabs (+ QA, CSM, Sales, Marketing)
- [x] Frontend route guards enforcing role visibility
- [x] Backend tRPC procedure guards enforcing role permissions

## Database Schema
- [x] Users table with role enum (executive | company | admin)
- [x] Refresh tokens table
- [x] Audit logs table
- [x] Dashboard snapshots table
- [x] Connector configs table
- [x] MFA secrets table

## Dashboard UI
- [x] Dark-themed dashboard layout with collapsible sidebar
- [x] User profile display in sidebar (name, role badge)
- [x] Role-based tab visibility in sidebar nav
- [x] Responsive layout (mobile sidebar drawer)

## Department Tabs (9 total)
- [x] Executive Summary tab (KPIs, alerts, headcount, top metrics)
- [x] Financials tab (ARR, MRR, revenue charts, expense breakdown, cash flow)
- [x] Delivery tab (project tracker, velocity, on-time delivery)
- [x] Development tab (burndown, deployments, PRs, contributors)
- [x] IT/Ops tab (service status, incidents, resource utilization)
- [x] QA tab (Company only — test results, defect tracking, coverage)
- [x] CSM tab (Company only — customer health, ticket volume, account table)
- [x] Sales tab (Company only — pipeline, rep performance, forecast)
- [x] Marketing tab (Company only — channel performance, campaigns, traffic)

## Mock Data Service
- [x] Realistic placeholder data for all 9 tabs
- [x] KPI cards with trend indicators
- [x] Chart data (line, bar, pie, area)
- [x] Data tables with sortable rows

## Connector Framework
- [x] Jira REST API stub
- [x] GitHub REST API stub
- [x] Salesforce REST API stub
- [x] CSV/JSON file upload stub
- [x] Google Analytics GA4 stub

## Demo Users
- [x] executive@demo.com / Executive@2024! (executive role)
- [x] company@demo.com / Company@2024! (company role)

## Auth Pages
- [x] Login page (email + password)
- [x] MFA verification page (TOTP input)
- [x] MFA setup page (QR code enrollment)

## Tests & Deployment
- [x] Vitest unit tests for auth procedures (21 tests passing)
- [x] Vitest tests for RBAC enforcement
- [x] Database migration applied
- [x] Demo users seeded
- [x] Checkpoint saved and published

## Jira Local-First Data Pipeline

- [x] DB schema: jira_snapshots table (raw paginated cache with ETag)
- [x] DB schema: computed_kpis table (pre-aggregated metrics, keyed by board+type+period)
- [x] JiraConnector: paginated issue fetcher with ETag/Last-Modified HTTP caching
- [x] Local aggregation: sprint velocity (story points completed per sprint)
- [x] Local aggregation: burndown (remaining points per day in sprint)
- [x] Local aggregation: cycle time (created→done, median/p75/p95)
- [x] Local aggregation: deployment frequency (releases per week)
- [x] Local aggregation: bug density and throughput (rolling 8-week window)
- [x] KPI diff engine: only persist changed fields to DB
- [x] Scheduler: node-cron job wired into Express server startup
- [x] Dashboard procedures: delivery + development read from computed_kpis with mock fallback
- [x] Tests: aggregation engine unit tests with fixture data (18 tests)
- [x] Checkpoint saved

## RBAC Redesign & Horizontal Layout

- [ ] Update role enum: executive, qa, sales_marketing, csm, admin
- [ ] Update RBAC tab visibility map per new tiers
- [ ] Update DB schema migration for new roles
- [ ] Update seed demo users (one per role)
- [ ] Update backend RBAC middleware per new roles
- [ ] Redesign DashboardLayout: replace sidebar with horizontal top tab bar
- [ ] Top bar: logo + app name left, user profile + logout right
- [ ] Tab strip: scrollable horizontal, role-filtered, active indicator
- [ ] Update App.tsx route guards for new roles
- [ ] Run tests and save checkpoint

## Duo Universal Prompt MFA Integration
- [ ] Install @duosecurity/duo_universal package
- [ ] Add duo_state_store table to DB schema (state + username + expiry for CSRF protection)
- [ ] Build server-side Duo OIDC flow: initiateDuo, duoCallback procedures
- [ ] Remove old TOTP setupMfa/confirmMfa procedures
- [ ] Update loginWithPassword to redirect to Duo instead of TOTP
- [ ] Build DuoCallbackPage frontend component to handle the redirect back
- [ ] Update MfaPage to show "Redirecting to Duo..." loading state
- [ ] Update App.tsx with /duo-callback route
- [ ] Add DUO_CLIENT_ID, DUO_CLIENT_SECRET, DUO_API_HOST secrets
- [ ] Update tests for new Duo flow
- [ ] Checkpoint saved

## User Management Page

- [ ] Backend: listUsers procedure (Executive-only) — id, name, email, role, lastSignedIn, createdAt, mfaStatus
- [ ] Backend: updateUserRole mutation (Executive-only) — change role with audit log entry
- [ ] Backend: getUserAuditLog procedure (Executive-only) — last 20 actions for a user
- [ ] Frontend: UserManagementPage with full-width account table
- [ ] Frontend: Role badge + inline role change dropdown per row
- [ ] Frontend: MFA/Duo status column (Active / Bypassed)
- [ ] Frontend: Last login timestamp column
- [ ] Frontend: User detail drawer — audit trail for selected user
- [ ] Route: /dashboard/users (Executive + admin only)
- [ ] DashboardLayout: Users tab added for executive/admin roles
- [ ] Tests: user management RBAC tests
- [ ] Checkpoint saved

## Entra ID (Azure AD) + Duo MFA Integration

- [x] Research Entra OIDC + Duo chained auth pattern
- [x] Install @azure/msal-node
- [x] DB schema: add entra_oid, entra_upn, entra_tenant_id columns to users table
- [x] DB schema: add pending_auth_store table for Entra→Duo state handoff
- [x] Server: EntraOIDC module (authorization URL, PKCE, token exchange, id_token validation)
- [x] Server: /api/auth/entra/login route (redirect to Entra with CSRF state)
- [x] Server: /api/auth/entra/callback route (exchange code, validate id_token, upsert user)
- [x] Server: chain Duo after Entra callback (pending_auth_store, redirect to Duo)
- [x] Server: map Entra groups/roles to dashboard RBAC roles (ENTRA_GROUP_* env vars)
- [x] Server: tRPC auth.entraStatus query (exposes configured flag + loginUrl to frontend)
- [x] Frontend: login page shows SSO button when Entra is configured, password form as fallback
- [x] Frontend: error banner reads ?error= query param from Entra/Duo callback failures
- [x] Docs: docs/ENTRA_ACTIVATION_GUIDE.md (app registration, groups, troubleshooting)
- [x] Docs: docs/ENV_REFERENCE.md (all environment variables documented)
- [x] Tests: 13 unit tests for isEntraConfigured and mapEntraGroupsToRole (65 total passing)
- [x] Checkpoint saved

## SQL Server Migration (MySQL → Microsoft SQL Server)

- [x] Install mssql (tedious) driver, remove mysql2
- [x] Create server/sqlserver.ts: typed connection pool helper (ADO.NET + URL format parsing)
- [x] Rewrite server/db.ts: all helpers rewritten as parameterised mssql queries (MERGE, SELECT TOP, etc.)
- [x] Fix server/duo.ts: all Drizzle calls replaced with mssql execute/query helpers
- [x] Update server/_core/sdk.ts: import User from server/db instead of drizzle/schema
- [x] Update server/_core/context.ts: import User from server/db instead of drizzle/schema
- [x] Update shared/types.ts: re-export User/InsertUser/UserRole from server/db
- [x] Create drizzle/sqlserver-init.sql: idempotent CREATE TABLE DDL for all 7 tables + triggers
- [x] Update docs/ENV_REFERENCE.md: DATABASE_URL section updated for SQL Server connection strings
- [x] TypeScript clean (0 errors) + all 65 tests pass
- [x] Checkpoint saved

## SQL Scripts Folder

- [x] Create sql/ folder at project root
- [x] Move drizzle/create-database.sql → sql/create-database.sql
- [x] Add sql/README.md with naming conventions and run instructions
- [ ] Checkpoint saved

## SQL Scripts — Additional Scripts

- [x] Create sql/create-app-login.sql (least-privilege app login)
- [x] Create sql/migrate-template.sql (migration script template)
- [x] Create sql/maint-purge-agent-job.sql (SQL Agent job for purge procedures)
- [x] Update sql/README.md with new script entries
- [ ] Checkpoint saved

## SQL Scripts — Security & Migration Hardening

- [x] Update create-app-login.sql with Azure Key Vault / secrets manager pattern
- [x] Update maint-purge-agent-job.sql with email alert operator and DBA notification
- [x] Create migrate-20260401-add-notifications-table.sql (first real migration)
- [x] Update sql/README.md with new migration script entry
- [x] Checkpoint saved

## Notifications Feature + KPI Monitor

- [x] Add notifications DB helpers to server/db.ts (getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, createNotification)
- [x] Add tRPC notifications router (list, unreadCount, markRead, markAllRead, create)
- [x] Build NotificationBell component (unread badge, dropdown panel, mark-read actions)
- [x] Wire NotificationBell into DashboardLayout header
- [x] Add KPI threshold monitor using node-cron (server/kpiMonitor.ts, 8 threshold rules, startKpiMonitor called at server startup)
- [x] Create sql/backfill-20260401-seed-demo-notifications.sql (4 demo users, 16 notifications across all severity levels)
- [x] Write vitest tests for notifications helpers (server/notifications.test.ts — 13 tests, 78 total passing)
- [x] Checkpoint saved

## Notification Preferences + SSE Push + Admin Broadcast

- [x] DB schema: notification_preferences table (userId, ruleId, enabled)
- [x] DB helpers: getNotificationPreferences, upsertNotificationPreference
- [x] tRPC: notifications.getPreferences query, notifications.setPreference mutation
- [x] Frontend: NotificationPreferencesPage (/dashboard/notification-preferences)
- [x] NotificationBell: preferences link in dropdown footer
- [x] SSE: GET /api/events/notifications endpoint (per-user stream, registered in server entry point)
- [x] SSE: server-side emitter helper (emitToUser, emitToRole) in server/sseEmitter.ts
- [x] NotificationBell: replaced 60s poll with SSE connection + exponential backoff + live indicator dot
- [x] Admin broadcast: trpc.notifications.broadcast mutation (admin-only, role-targeted, emits SSE)
- [x] User Management page: "Send Announcement" form (title, body, severity, target role)
- [x] SQL: migrate-20260402-add-notification-preferences-table.sql
- [x] 78 tests passing (0 TypeScript errors)
- [x] Checkpoint saved

## DB Connection Error Handling Fix

- [x] Add withDbError() helper in server/sqlserver.ts — catches tedious ConnectionError and re-throws as TRPCError SERVICE_UNAVAILABLE
- [x] Wrap getUserByEmail and writeAuditLog calls in loginWithPassword with withDbError()
- [x] Update LoginPage onError to detect SERVICE_UNAVAILABLE and show clear admin-facing banner
- [x] 78 tests passing, 0 TypeScript errors
- [x] Checkpoint saved

## Demo Login Fix (DB-free fallback)

- [x] Add in-memory DEMO_USERS store in server/demoUsers.ts (pre-hashed passwords, all 4 demo roles)
- [x] Update loginWithPassword to catch SERVICE_UNAVAILABLE and fall back to demo user store
- [x] Demo sessions use same JWT cookie flow — no DB writes needed; Duo and audit log writes skipped for demo users
- [x] Checkpoint saved

## Duo MFA Link Fix

- [x] Audited LoginPage: "Sign in with Duo MFA" was a misleading label — Duo is a server-side second step, not a standalone link
- [x] Fixed button label to plain "Sign in"; removed false "Protected by Duo MFA" subtitle and footer when Duo is not configured
- [x] Confirmed demo fallback working: loginWithPassword returns HTTP 200 with valid user when DB is down
- [x] Checkpoint saved

## Demo Sign-In Fix

- [x] Diagnosed: demo cards only filled fields, did not submit; onSuccess also guarded on data.user which could silently skip navigation
- [x] Fixed: demo cards now call handleDemoLogin() which fills fields AND immediately fires loginMutation; cards disabled while loading
- [x] Fixed: onSuccess no longer gates on data.user — session cookie is always set by server so navigate always fires
- [x] Added onSettled to always clear loading state even on error
- [x] Checkpoint saved

## Login Redirect Fix (stuck on login screen)

- [x] Traced: loginWithPassword sets cookie with demo openId (e.g. demo-executive), but auth.me called db.getUserByOpenId which threw DB connection error → returned null → navigate never fired
- [x] Fixed: sdk.ts authenticateRequest now has a demo fast-path — if openId starts with "demo-" it resolves from in-memory demoUsers store, bypassing the DB entirely
- [x] 78 tests passing, 0 TypeScript errors
- [x] Checkpoint saved

## Navigation Revamp

- [x] Audit current nav structure and existing page components
- [x] Rewrite DashboardLayout with two-tier nav: primary bar (6 sections) + contextual sub-tab bar
- [x] Update App.tsx routes for all new paths (18 total routes)
- [x] Create stub pages: ProjectManagementTab, UCPTab, SSOCTab, EnterpriseTab, ProdSupportTab, SettingsTab
- [x] Settings section consolidates User Management + Notification Preferences with role-gated links
- [x] 78 tests passing, 0 TypeScript errors
- [x] Checkpoint saved

## Executive Overview — Profitability Forecast Chart

- [x] Replace Headcount by Department chart with Profitability Forecast chart (LineChart, 9 actuals + 3 forecast months, gross/net profit + dashed forecast line, ReferenceLine divider)
- [x] Checkpoint saved

## HR Tab + AI Adoption Ranking Page

- [x] Add HR as sub-tab under Executive Summary in DashboardLayout nav
- [x] Add /dashboard/hr route in App.tsx
- [x] Create HRTab.tsx with AI Adoption ranking page (employee table, scores, rank badges, charts)
- [x] Add ai_adoption_scores DB table and SQL migration script (sql/migrate-20260402-add-ai-adoption-scores-table.sql)
- [x] Add tRPC procedure: hr.aiAdoption query with DB + mock fallback
- [x] Wire HRTab to tRPC hr.aiAdoption query (falls back to DEMO_EMPLOYEES when DB unavailable)
- [x] 78 tests passing, 0 TypeScript errors
- [x] Checkpoint saved
