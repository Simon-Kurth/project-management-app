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
