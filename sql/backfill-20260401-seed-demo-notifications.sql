-- ============================================================
-- Project Management App
-- Backfill: backfill-20260401-seed-demo-notifications
-- ============================================================
--
-- METADATA
-- Backfill    : backfill-20260401-seed-demo-notifications
-- Author      : Engineering
-- Date        : 2026-04-01
-- Ticket      : WH-142 — In-app notification centre
-- Description :
--   Inserts realistic sample notifications for each demo user
--   so the notification centre has visible content during
--   stakeholder demos before real data flows in.
--
--   Notifications span all severity levels, sources, and roles
--   to exercise the full UI surface:
--     - KPI threshold breaches (kpi-monitor)
--     - Connector sync failures (system)
--     - Admin-sent alerts (admin)
--     - Success confirmations (system)
--
--   Safe to re-run: uses MERGE on (userId, title, source, createdAt)
--   to avoid duplicate rows.
-- ============================================================

USE ProjectManagement;
GO

-- ============================================================
-- SECTION 1 — PRE-FLIGHT CHECKS
-- ============================================================

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'notifications' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  RAISERROR('Pre-flight failed: dbo.notifications does not exist. Run migrate-20260401-add-notifications-table.sql first.', 16, 1);
  RETURN;
END
GO

-- ============================================================
-- SECTION 2 — SEED DATA
-- ============================================================

-- Helper: resolve demo user IDs by email into a temp table
IF OBJECT_ID('tempdb..#DemoUsers') IS NOT NULL DROP TABLE #DemoUsers;

CREATE TABLE #DemoUsers (
  role    NVARCHAR(50)  NOT NULL,
  userId  INT           NULL
);

INSERT INTO #DemoUsers (role, userId)
SELECT u.role, u.id
FROM dbo.users u
WHERE u.email IN (
  N'executive@demo.pm-app.com',
  N'qa@demo.pm-app.com',
  N'sales@demo.pm-app.com',
  N'csm@demo.pm-app.com'
)
AND u.loginMethod = N'password';

-- If no demo users exist yet, print a warning and exit gracefully
IF NOT EXISTS (SELECT 1 FROM #DemoUsers WHERE userId IS NOT NULL)
BEGIN
  PRINT 'No demo users found — skipping notification seed. Run the demo user setup first.';
  DROP TABLE #DemoUsers;
  RETURN;
END
GO

-- ── Executive notifications ───────────────────────────────────────────────────

DECLARE @execId INT = (SELECT TOP 1 userId FROM #DemoUsers WHERE role = N'executive');

IF @execId IS NOT NULL
BEGIN
  -- KPI breach — warning
  MERGE dbo.notifications AS target
  USING (SELECT @execId AS userId, N'kpi-monitor' AS source,
                DATEADD(MINUTE, -47, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Sprint Velocity Drop'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @execId,
    N'KPI Alert: Sprint Velocity Drop',
    N'Sprint velocity is currently 17.0 pts, which is below the threshold of 20 pts. The engineering team has completed 3 consecutive sprints under target. Immediate review recommended.',
    N'warning',
    N'/dashboard/delivery',
    N'kpi-monitor',
    DATEADD(MINUTE, -47, GETUTCDATE())
  );

  -- Connector sync failure — error
  MERGE dbo.notifications AS target
  USING (SELECT @execId AS userId, N'system' AS source,
                DATEADD(HOUR, -2, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Jira Sync Failed'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @execId,
    N'Jira Sync Failed',
    N'The Jira connector failed to sync at 10:15 UTC. Error: 401 Unauthorized — the API token may have expired. Dashboard delivery metrics may be stale until the next successful sync.',
    N'error',
    N'/dashboard/delivery',
    N'system',
    DATEADD(HOUR, -2, GETUTCDATE())
  );

  -- Churn rate alert — error
  MERGE dbo.notifications AS target
  USING (SELECT @execId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -5, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Churn Rate Elevated'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @execId,
    N'KPI Alert: Churn Rate Elevated',
    N'Monthly churn rate is currently 6.2%, which is above the threshold of 5%. This is the second consecutive month above target. CSM team has been notified.',
    N'error',
    N'/dashboard/csm',
    N'kpi-monitor',
    DATEADD(HOUR, -5, GETUTCDATE())
  );

  -- Admin message — info
  MERGE dbo.notifications AS target
  USING (SELECT @execId AS userId, N'admin' AS source,
                DATEADD(DAY, -1, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Q1 Board Report Ready'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @execId,
    N'Q1 Board Report Ready',
    N'The Q1 2026 board report has been finalised and is ready for review. All KPI snapshots have been captured as of 23:59 UTC on March 31.',
    N'info',
    N'/dashboard/executive-summary',
    N'admin',
    DATEADD(DAY, -1, GETUTCDATE())
  );

  -- Connector sync success — success (already read)
  MERGE dbo.notifications AS target
  USING (SELECT @execId AS userId, N'system' AS source,
                DATEADD(DAY, -2, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Salesforce Sync Completed'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, isRead, readAt, source, createdAt)
  VALUES (
    @execId,
    N'Salesforce Sync Completed',
    N'Salesforce connector successfully synced 1,247 opportunity records. Pipeline coverage and win rate metrics have been updated.',
    N'success',
    N'/dashboard/sales',
    1,
    DATEADD(DAY, -2, DATEADD(HOUR, 1, GETUTCDATE())),
    N'system',
    DATEADD(DAY, -2, GETUTCDATE())
  );

  PRINT CONCAT('Seeded notifications for executive user (id=', @execId, ')');
END
GO

-- ── QA notifications ──────────────────────────────────────────────────────────

DECLARE @qaId INT = (SELECT TOP 1 userId FROM #DemoUsers WHERE role = N'qa');

IF @qaId IS NOT NULL
BEGIN
  -- Test pass rate warning
  MERGE dbo.notifications AS target
  USING (SELECT @qaId AS userId, N'kpi-monitor' AS source,
                DATEADD(MINUTE, -30, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Test Pass Rate Below Target'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @qaId,
    N'KPI Alert: Test Pass Rate Below Target',
    N'Test pass rate is currently 81.4%, which is below the threshold of 85%. 23 new test failures were introduced in the last sprint. Regression suite review required.',
    N'warning',
    N'/dashboard/qa',
    N'kpi-monitor',
    DATEADD(MINUTE, -30, GETUTCDATE())
  );

  -- Bug escape rate critical
  MERGE dbo.notifications AS target
  USING (SELECT @qaId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -3, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Bug Escape Rate Critical'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @qaId,
    N'KPI Alert: Bug Escape Rate Critical',
    N'Bug escape rate is currently 12.3%, which is above the critical threshold of 10%. 4 P1 bugs were reported in production this week. Immediate triage required.',
    N'error',
    N'/dashboard/qa',
    N'kpi-monitor',
    DATEADD(HOUR, -3, GETUTCDATE())
  );

  -- Resolved (read) — automation suite restored
  MERGE dbo.notifications AS target
  USING (SELECT @qaId AS userId, N'system' AS source,
                DATEADD(DAY, -1, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Automation Suite Restored'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, isRead, readAt, source, createdAt)
  VALUES (
    @qaId,
    N'Automation Suite Restored',
    N'The flaky test infrastructure issue has been resolved. All 847 automated tests are now running successfully in CI.',
    N'success',
    N'/dashboard/qa',
    1,
    DATEADD(DAY, -1, DATEADD(HOUR, 2, GETUTCDATE())),
    N'system',
    DATEADD(DAY, -1, GETUTCDATE())
  );

  PRINT CONCAT('Seeded notifications for QA user (id=', @qaId, ')');
END
GO

-- ── Sales & Marketing notifications ──────────────────────────────────────────

DECLARE @salesId INT = (SELECT TOP 1 userId FROM #DemoUsers WHERE role = N'sales_marketing');

IF @salesId IS NOT NULL
BEGIN
  -- Pipeline coverage warning
  MERGE dbo.notifications AS target
  USING (SELECT @salesId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -1, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Pipeline Coverage Below 3x'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @salesId,
    N'KPI Alert: Pipeline Coverage Below 3x',
    N'Pipeline coverage is currently 2.4x, which is below the target of 3x. $1.2M in qualified opportunities needed to close the gap before end of quarter.',
    N'warning',
    N'/dashboard/sales',
    N'kpi-monitor',
    DATEADD(HOUR, -1, GETUTCDATE())
  );

  -- Win rate drop
  MERGE dbo.notifications AS target
  USING (SELECT @salesId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -6, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Win Rate Below Target'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @salesId,
    N'KPI Alert: Win Rate Below Target',
    N'Win rate is currently 21.8%, which is below the threshold of 25%. Competitive analysis suggests pricing pressure in the mid-market segment.',
    N'warning',
    N'/dashboard/sales',
    N'kpi-monitor',
    DATEADD(HOUR, -6, GETUTCDATE())
  );

  -- Salesforce sync success (read)
  MERGE dbo.notifications AS target
  USING (SELECT @salesId AS userId, N'system' AS source,
                DATEADD(DAY, -1, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Salesforce Sync Completed'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, isRead, readAt, source, createdAt)
  VALUES (
    @salesId,
    N'Salesforce Sync Completed',
    N'Salesforce connector successfully synced 1,247 opportunity records. Pipeline coverage and win rate metrics have been updated.',
    N'success',
    N'/dashboard/sales',
    1,
    DATEADD(DAY, -1, DATEADD(HOUR, 1, GETUTCDATE())),
    N'system',
    DATEADD(DAY, -1, GETUTCDATE())
  );

  PRINT CONCAT('Seeded notifications for Sales & Marketing user (id=', @salesId, ')');
END
GO

-- ── CSM notifications ─────────────────────────────────────────────────────────

DECLARE @csmId INT = (SELECT TOP 1 userId FROM #DemoUsers WHERE role = N'csm');

IF @csmId IS NOT NULL
BEGIN
  -- Churn rate elevated
  MERGE dbo.notifications AS target
  USING (SELECT @csmId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -5, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: Churn Rate Elevated'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @csmId,
    N'KPI Alert: Churn Rate Elevated',
    N'Monthly churn rate is currently 6.2%, which is above the threshold of 5%. 3 enterprise accounts are at risk. Outreach plan required within 48 hours.',
    N'error',
    N'/dashboard/csm',
    N'kpi-monitor',
    DATEADD(HOUR, -5, GETUTCDATE())
  );

  -- NPS drop warning
  MERGE dbo.notifications AS target
  USING (SELECT @csmId AS userId, N'kpi-monitor' AS source,
                DATEADD(HOUR, -12, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'KPI Alert: NPS Score Drop'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, source, createdAt)
  VALUES (
    @csmId,
    N'KPI Alert: NPS Score Drop',
    N'NPS score is currently 27 pts, which is below the threshold of 30 pts. 12 detractor responses received in the last survey cycle. Follow-up cadence recommended.',
    N'warning',
    N'/dashboard/csm',
    N'kpi-monitor',
    DATEADD(HOUR, -12, GETUTCDATE())
  );

  -- Renewal success (read)
  MERGE dbo.notifications AS target
  USING (SELECT @csmId AS userId, N'system' AS source,
                DATEADD(DAY, -2, GETUTCDATE()) AS createdAt) AS src
    ON target.userId = src.userId AND target.source = src.source
       AND target.title = N'Renewal Milestone: 94% Q1 Retention'
       AND ABS(DATEDIFF(SECOND, target.createdAt, src.createdAt)) < 120
  WHEN NOT MATCHED THEN INSERT
    (userId, title, body, severity, actionUrl, isRead, readAt, source, createdAt)
  VALUES (
    @csmId,
    N'Renewal Milestone: 94% Q1 Retention',
    N'Q1 renewal rate closed at 94%, exceeding the 90% target. 47 of 50 renewal opportunities closed successfully. Strong performance from the enterprise segment.',
    N'success',
    N'/dashboard/csm',
    1,
    DATEADD(DAY, -2, DATEADD(HOUR, 3, GETUTCDATE())),
    N'system',
    DATEADD(DAY, -2, GETUTCDATE())
  );

  PRINT CONCAT('Seeded notifications for CSM user (id=', @csmId, ')');
END
GO

-- ============================================================
-- SECTION 3 — CLEANUP
-- ============================================================

IF OBJECT_ID('tempdb..#DemoUsers') IS NOT NULL DROP TABLE #DemoUsers;
GO

-- ============================================================
-- SECTION 4 — VERIFICATION
-- ============================================================

SELECT
  u.email                                          AS [User],
  u.role                                           AS [Role],
  COUNT(n.id)                                      AS [Total Notifications],
  SUM(CASE WHEN n.isRead = 0 THEN 1 ELSE 0 END)   AS [Unread],
  SUM(CASE WHEN n.isRead = 1 THEN 1 ELSE 0 END)   AS [Read],
  SUM(CASE WHEN n.severity = N'error'   THEN 1 ELSE 0 END) AS [Errors],
  SUM(CASE WHEN n.severity = N'warning' THEN 1 ELSE 0 END) AS [Warnings],
  SUM(CASE WHEN n.severity = N'success' THEN 1 ELSE 0 END) AS [Successes],
  SUM(CASE WHEN n.severity = N'info'    THEN 1 ELSE 0 END) AS [Info]
FROM dbo.users u
LEFT JOIN dbo.notifications n ON n.userId = u.id
WHERE u.email IN (
  N'executive@demo.pm-app.com',
  N'qa@demo.pm-app.com',
  N'sales@demo.pm-app.com',
  N'csm@demo.pm-app.com'
)
GROUP BY u.email, u.role
ORDER BY u.role;
GO
