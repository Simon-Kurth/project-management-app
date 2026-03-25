-- ============================================================
-- Wheelhouse Executive Dashboard
-- Migration: migrate-20260402-add-notification-preferences-table
-- ============================================================
--
-- METADATA
-- Migration   : migrate-20260402-add-notification-preferences-table
-- Author      : DataOceans Engineering
-- Date        : 2026-04-02
-- Ticket      : WH-158 — Per-user notification preferences
-- Description :
--   Adds the notification_preferences table that stores each
--   user's opt-in/opt-out choice per KPI monitor rule.
--   Rows are keyed by (userId, ruleId); absence of a row means
--   the user inherits the default (enabled = true).
--
-- Safe to re-run: all DDL is guarded by existence checks.
-- ============================================================

USE Wheelhouse;
GO

-- ============================================================
-- SECTION 1 — PRE-FLIGHT CHECKS
-- ============================================================

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

-- Create notification_preferences table
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'notification_preferences' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.notification_preferences (
    id        INT           NOT NULL IDENTITY(1,1),
    userId    INT           NOT NULL,
    ruleId    NVARCHAR(100) NOT NULL,  -- matches ThresholdRule.name in kpiMonitor.ts
    enabled   BIT           NOT NULL DEFAULT 1,
    updatedAt DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_notification_preferences PRIMARY KEY (id),
    CONSTRAINT UQ_notification_preferences_user_rule UNIQUE (userId, ruleId),
    CONSTRAINT FK_notification_preferences_userId
      FOREIGN KEY (userId) REFERENCES dbo.users(id) ON DELETE CASCADE,
  );

  PRINT 'Created table: dbo.notification_preferences';
END
ELSE
BEGIN
  PRINT 'Table dbo.notification_preferences already exists — skipping CREATE';
END
GO

-- Index: look up all preferences for a user quickly
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_notification_preferences_userId'
    AND object_id = OBJECT_ID('dbo.notification_preferences')
)
BEGIN
  CREATE INDEX IX_notification_preferences_userId
    ON dbo.notification_preferences (userId)
    INCLUDE (ruleId, enabled);
  PRINT 'Created index: IX_notification_preferences_userId';
END
GO

-- Trigger: auto-update updatedAt on row change
IF NOT EXISTS (
  SELECT 1 FROM sys.triggers
  WHERE name = N'TR_notification_preferences_updatedAt'
)
BEGIN
  EXEC sp_executesql N'
    CREATE TRIGGER dbo.TR_notification_preferences_updatedAt
    ON dbo.notification_preferences
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE dbo.notification_preferences
      SET updatedAt = SYSUTCDATETIME()
      FROM dbo.notification_preferences np
      INNER JOIN inserted i ON np.id = i.id;
    END';
  PRINT 'Created trigger: TR_notification_preferences_updatedAt';
END
GO

-- Grant permissions to application login
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'wheelhouse_app')
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.notification_preferences TO wheelhouse_app;
  PRINT 'Granted permissions to wheelhouse_app';
END
GO

-- ============================================================
-- SECTION 3 — VERIFICATION
-- ============================================================

SELECT
  t.name                                                AS [Table],
  COUNT(c.column_id)                                    AS [Columns],
  (SELECT COUNT(*) FROM sys.indexes i2
   WHERE i2.object_id = t.object_id AND i2.is_primary_key = 0
     AND i2.type > 0)                                   AS [Indexes],
  (SELECT COUNT(*) FROM sys.triggers tr
   WHERE tr.parent_id = t.object_id)                    AS [Triggers]
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
WHERE t.name = N'notification_preferences'
  AND t.schema_id = SCHEMA_ID('dbo')
GROUP BY t.name, t.object_id;
GO
