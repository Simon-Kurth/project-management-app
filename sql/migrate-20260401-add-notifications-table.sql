-- ============================================================
-- Wheelhouse Executive Dashboard
-- Migration: migrate-20260401-add-notifications-table
-- ============================================================
--
-- METADATA
-- Migration : migrate-20260401-add-notifications-table
-- Author    : DataOceans Engineering
-- Date      : 2026-04-01
-- Ticket    : WH-142 — In-app notification centre
-- Description:
--   Adds the dbo.notifications table to support the in-app
--   notification centre feature.  Each row represents a single
--   notification delivered to one user.  Notifications can be
--   system-generated (e.g. KPI threshold breach, connector
--   sync failure) or manually sent by an admin.
--
--   Also grants SELECT/INSERT/UPDATE/DELETE on the new table
--   to the wheelhouse_app least-privilege login, and adds a
--   purge stored procedure for notifications older than the
--   configured retention window.
-- ============================================================

USE Wheelhouse;
GO

-- ============================================================
-- SECTION 1 — PRE-FLIGHT CHECKS
-- ============================================================

-- Confirm the users table exists (dependency)
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'users' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  RAISERROR('Pre-flight failed: dbo.users does not exist. Run create-database.sql first.', 16, 1);
  RETURN;
END
GO

-- ============================================================
-- SECTION 2 — FORWARD MIGRATION
-- ============================================================

-- ── 2a. Create dbo.notifications table ───────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'notifications' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.notifications (
    -- Primary key
    id            INT               IDENTITY(1,1)   NOT NULL,

    -- Recipient
    userId        INT               NOT NULL,

    -- Content
    title         NVARCHAR(255)     NOT NULL,
    body          NVARCHAR(MAX)     NOT NULL,

    -- Classification
    -- 'info' | 'warning' | 'error' | 'success'
    severity      NVARCHAR(20)      NOT NULL
                  CONSTRAINT DF_notifications_severity  DEFAULT N'info',

    -- Optional deep-link so the frontend can route to the relevant page
    -- e.g. '/dashboard/kpis?highlight=revenue'
    actionUrl     NVARCHAR(1024)    NULL,

    -- Read state
    isRead        BIT               NOT NULL
                  CONSTRAINT DF_notifications_isRead    DEFAULT 0,
    readAt        DATETIME2(3)      NULL,

    -- Source system that generated this notification
    -- e.g. 'system', 'admin', 'connector:jira', 'kpi-monitor'
    source        NVARCHAR(100)     NOT NULL
                  CONSTRAINT DF_notifications_source    DEFAULT N'system',

    -- Lifecycle
    createdAt     DATETIME2(3)      NOT NULL
                  CONSTRAINT DF_notifications_createdAt DEFAULT GETUTCDATE(),

    -- Constraints
    CONSTRAINT PK_notifications
      PRIMARY KEY CLUSTERED (id),

    CONSTRAINT FK_notifications_userId
      FOREIGN KEY (userId) REFERENCES dbo.users (id)
      ON DELETE CASCADE,

    CONSTRAINT CK_notifications_severity
      CHECK (severity IN (N'info', N'warning', N'error', N'success')),

    CONSTRAINT CK_notifications_readAt
      CHECK (readAt IS NULL OR isRead = 1)
  );

  PRINT 'Table dbo.notifications created.';
END
ELSE
BEGIN
  PRINT 'Table dbo.notifications already exists — skipping creation.';
END
GO

-- ── 2b. Indexes ───────────────────────────────────────────────────────────────

-- Primary access pattern: unread notifications for a user, newest first
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.notifications')
    AND name = N'IX_notifications_userId_isRead_createdAt'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_notifications_userId_isRead_createdAt
    ON dbo.notifications (userId, isRead, createdAt DESC)
    INCLUDE (title, severity, actionUrl);
  PRINT 'Index IX_notifications_userId_isRead_createdAt created.';
END
GO

-- Secondary access pattern: all notifications for a user, newest first
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.notifications')
    AND name = N'IX_notifications_userId_createdAt'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_notifications_userId_createdAt
    ON dbo.notifications (userId, createdAt DESC);
  PRINT 'Index IX_notifications_userId_createdAt created.';
END
GO

-- Filtered index for bulk "mark all as read" operations
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.notifications')
    AND name = N'IX_notifications_userId_unread'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_notifications_userId_unread
    ON dbo.notifications (userId)
    WHERE isRead = 0;
  PRINT 'Filtered index IX_notifications_userId_unread created.';
END
GO

-- ── 2c. Grant permissions to the application login ────────────────────────────
IF EXISTS (
  SELECT 1 FROM sys.database_principals WHERE name = N'wheelhouse_app'
)
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.notifications TO wheelhouse_app;
  PRINT 'Permissions on dbo.notifications granted to wheelhouse_app.';
END
ELSE
BEGIN
  PRINT 'Login wheelhouse_app not found — skipping permission grant. Run create-app-login.sql first.';
END
GO

-- ── 2d. Purge stored procedure ────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.procedures
  WHERE name = N'usp_PurgeOldNotifications'
    AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  EXEC sp_executesql N'
    CREATE PROCEDURE dbo.usp_PurgeOldNotifications
      @retentionDays INT = 90
    AS
    BEGIN
      SET NOCOUNT ON;

      DECLARE @cutoff DATETIME2(3) = DATEADD(DAY, -@retentionDays, GETUTCDATE());

      DELETE FROM dbo.notifications
      WHERE createdAt < @cutoff;

      PRINT CONCAT(''Purged notifications older than '', @retentionDays, '' days.'');
    END;
  ';
  PRINT 'Stored procedure dbo.usp_PurgeOldNotifications created.';
END
ELSE
BEGIN
  PRINT 'Stored procedure dbo.usp_PurgeOldNotifications already exists — skipping.';
END
GO

-- Grant EXECUTE on the new purge procedure to the app login
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'wheelhouse_app')
BEGIN
  GRANT EXECUTE ON dbo.usp_PurgeOldNotifications TO wheelhouse_app;
  PRINT 'EXECUTE on dbo.usp_PurgeOldNotifications granted to wheelhouse_app.';
END
GO

-- ── 2e. Add Agent job for notification purge ──────────────────────────────────
-- Adds a fourth Agent job that purges notifications older than 90 days,
-- running weekly on Sunday at 03:00 UTC.
-- This block targets msdb, so it is wrapped in a dynamic cross-database call.

DECLARE @jobExists BIT = 0;
SELECT @jobExists = 1
FROM msdb.dbo.sysjobs
WHERE name = N'Wheelhouse — Purge Old Notifications';

IF @jobExists = 0
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name                    = N'Wheelhouse — Purge Old Notifications',
    @enabled                     = 1,
    @description                 = N'Purges notifications older than 90 days. Runs weekly on Sunday at 03:00 UTC.',
    @category_name               = N'[Uncategorized (Local)]',
    @notify_level_eventlog       = 2,
    @notify_level_email          = 2,
    @notify_email_operator_name  = N'Wheelhouse DBA';

  EXEC msdb.dbo.sp_add_jobstep
    @job_name          = N'Wheelhouse — Purge Old Notifications',
    @step_name         = N'Execute usp_PurgeOldNotifications',
    @step_id           = 1,
    @subsystem         = N'TSQL',
    @command           = N'EXEC dbo.usp_PurgeOldNotifications @retentionDays = 90;',
    @database_name     = N'Wheelhouse',
    @on_success_action = 1,
    @on_fail_action    = 2;

  EXEC msdb.dbo.sp_add_schedule
    @schedule_name        = N'Weekly Sunday at 0300',
    @freq_type            = 8,     -- weekly
    @freq_interval        = 1,     -- Sunday
    @freq_subday_type     = 1,     -- once
    @freq_subday_interval = 0,
    @active_start_time    = 030000;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'Wheelhouse — Purge Old Notifications',
    @schedule_name = N'Weekly Sunday at 0300';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'Wheelhouse — Purge Old Notifications',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''Wheelhouse — Purge Old Notifications'' created.';
END
ELSE
BEGIN
  PRINT 'Job ''Wheelhouse — Purge Old Notifications'' already exists — skipping.';
END
GO

PRINT 'Forward migration complete: dbo.notifications table, indexes, permissions, and purge job added.';
GO

-- ============================================================
-- SECTION 3 — ROLLBACK
-- ============================================================
-- Uncomment this section ONLY if you need to undo this migration.
-- ============================================================

/*
USE Wheelhouse;
GO

-- Remove Agent job
DECLARE @jobId UNIQUEIDENTIFIER;
SELECT @jobId = job_id FROM msdb.dbo.sysjobs
WHERE name = N'Wheelhouse — Purge Old Notifications';
IF @jobId IS NOT NULL
  EXEC msdb.dbo.sp_delete_job @job_id = @jobId;
GO

-- Drop purge procedure
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = N'usp_PurgeOldNotifications')
  DROP PROCEDURE dbo.usp_PurgeOldNotifications;
GO

-- Drop table (cascades FK from users)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'notifications')
  DROP TABLE dbo.notifications;
GO

PRINT 'Rollback complete: dbo.notifications and related objects removed.';
GO
*/

-- ============================================================
-- SECTION 4 — VERIFICATION
-- ============================================================

-- Confirm table exists with expected columns
SELECT
  c.column_id                             AS [Pos],
  c.name                                  AS [Column],
  tp.name                                 AS [Type],
  c.max_length                            AS [MaxLen],
  c.is_nullable                           AS [Nullable],
  OBJECT_NAME(dc.object_id)               AS [Default]
FROM sys.columns      c
JOIN sys.types        tp ON tp.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc
  ON dc.parent_object_id = c.object_id
 AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('dbo.notifications')
ORDER BY c.column_id;
GO

-- Confirm indexes
SELECT
  i.name          AS [Index],
  i.type_desc     AS [Type],
  i.filter_definition AS [Filter]
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.notifications')
  AND i.type > 0
ORDER BY i.index_id;
GO

-- Confirm permissions for wheelhouse_app
SELECT
  OBJECT_NAME(dp.major_id)  AS [Object],
  dp.permission_name        AS [Permission],
  dp.state_desc             AS [State]
FROM sys.database_permissions dp
JOIN sys.database_principals  pr ON pr.principal_id = dp.grantee_principal_id
WHERE pr.name = N'wheelhouse_app'
  AND OBJECT_NAME(dp.major_id) IN (N'notifications', N'usp_PurgeOldNotifications')
ORDER BY OBJECT_NAME(dp.major_id), dp.permission_name;
GO
