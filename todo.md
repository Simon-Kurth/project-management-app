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
