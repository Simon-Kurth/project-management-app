-- ============================================================
-- Wheelhouse Executive Dashboard
-- Migration Script Template
-- ============================================================
--
-- INSTRUCTIONS
--   1. Copy this file and rename it following the convention:
--        migrate-YYYYMMDD-short-description.sql
--      Example: migrate-20260601-add-notifications-table.sql
--
--   2. Fill in the metadata block below.
--
--   3. Write your schema change in the FORWARD MIGRATION section.
--
--   4. Write the matching undo logic in the ROLLBACK section.
--      Keep both sections in the same file so they travel together
--      in source control.
--
--   5. Test the forward migration on a dev/staging database first.
--
--   6. Run against production:
--        sqlcmd -S <server> -U wheelhouse_app -P <password>
--               -d Wheelhouse -i sql/migrate-YYYYMMDD-description.sql
--
-- COMPATIBILITY
--   SQL Server 2019+, Azure SQL Database, Azure SQL Managed Instance
-- ============================================================

-- ─── METADATA ────────────────────────────────────────────────────────────────
-- Migration : migrate-YYYYMMDD-short-description
-- Author    : <your name>
-- Date      : YYYY-MM-DD
-- Ticket    : <Jira / GitHub issue reference>
-- Description:
--   <One or two sentences describing what this migration does and why.>
-- ─────────────────────────────────────────────────────────────────────────────

USE Wheelhouse;
GO

-- ============================================================
-- SECTION 1 — PRE-FLIGHT CHECKS
-- ============================================================
-- Verify prerequisites before making any changes.
-- Raise an error and abort if conditions are not met.
-- ============================================================

-- Example: confirm the table we intend to alter actually exists
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'users' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  RAISERROR('Pre-flight failed: table dbo.users does not exist.', 16, 1);
  RETURN;
END
GO

-- ============================================================
-- SECTION 2 — FORWARD MIGRATION
-- ============================================================
-- All changes must be idempotent: guard every CREATE/ADD with
-- an existence check so re-running after a partial failure is safe.
-- ============================================================

-- ── Example A: Add a nullable column ──────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users')
    AND name = N'newColumnName'
)
BEGIN
  ALTER TABLE dbo.users
    ADD newColumnName NVARCHAR(255) NULL;
  PRINT 'Column dbo.users.newColumnName added.';
END
GO

-- ── Example B: Add a new table ────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'new_table' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.new_table (
    id          INT             IDENTITY(1,1)   NOT NULL,
    userId      INT             NOT NULL,
    payload     NVARCHAR(MAX)   NOT NULL,
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_new_table_createdAt DEFAULT GETUTCDATE(),

    CONSTRAINT PK_new_table         PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_new_table_userId  FOREIGN KEY (userId) REFERENCES dbo.users (id) ON DELETE CASCADE
  );

  CREATE NONCLUSTERED INDEX IX_new_table_userId
    ON dbo.new_table (userId);

  PRINT 'Table dbo.new_table created.';
END
GO

-- ── Example C: Grant permissions on new table to app login ────────────────────
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'new_table' AND schema_id = SCHEMA_ID('dbo'))
  AND EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'wheelhouse_app')
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.new_table TO wheelhouse_app;
  PRINT 'Permissions on dbo.new_table granted to wheelhouse_app.';
END
GO

-- ── Example D: Backfill data after a schema change ────────────────────────────
-- UPDATE dbo.users
--   SET newColumnName = 'default_value'
-- WHERE newColumnName IS NULL;
-- GO

PRINT 'Forward migration complete.';
GO

-- ============================================================
-- SECTION 3 — ROLLBACK
-- ============================================================
-- Comment out this entire section before running the forward
-- migration in production.  Uncomment and run only if you need
-- to undo the migration.
-- ============================================================

/*
USE Wheelhouse;
GO

-- Undo Example B: drop the new table
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'new_table' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  DROP TABLE dbo.new_table;
  PRINT 'Table dbo.new_table dropped (rollback).';
END
GO

-- Undo Example A: drop the new column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.users')
    AND name = N'newColumnName'
)
BEGIN
  ALTER TABLE dbo.users DROP COLUMN newColumnName;
  PRINT 'Column dbo.users.newColumnName dropped (rollback).';
END
GO

PRINT 'Rollback complete.';
GO
*/

-- ============================================================
-- SECTION 4 — VERIFICATION
-- ============================================================
-- Run after the forward migration to confirm the expected
-- objects exist and row counts look correct.
-- ============================================================

-- Confirm new column exists
SELECT
  c.name          AS [Column],
  tp.name         AS [Type],
  c.max_length    AS [MaxLength],
  c.is_nullable   AS [Nullable]
FROM sys.columns c
JOIN sys.types   tp ON tp.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.users')
  AND c.name = N'newColumnName';
GO

-- Confirm new table exists with expected columns
SELECT
  t.name          AS [Table],
  c.name          AS [Column],
  tp.name         AS [Type]
FROM sys.tables  t
JOIN sys.columns c  ON c.object_id = t.object_id
JOIN sys.types   tp ON tp.user_type_id = c.user_type_id
WHERE t.name = N'new_table'
  AND t.schema_id = SCHEMA_ID('dbo')
ORDER BY c.column_id;
GO
