-- ============================================================
-- Project Management App
-- SQL Server Full Database Creation Script
-- ============================================================
--
-- PURPOSE
--   Creates the Project Management App database from scratch on a fresh
--   SQL Server instance.  Run this script once as a sysadmin
--   or dbcreator-role login before starting the application.
--
-- COMPATIBILITY
--   SQL Server 2019+ (on-premises)
--   Azure SQL Database (General Purpose S0 or higher)
--   Azure SQL Managed Instance
--
-- EXECUTION
--   sqlcmd -S <server> -U <login> -P <password> -i create-database.sql
--   -- or open in SSMS and execute (F5)
--
-- IDEMPOTENCY
--   Every object creation is guarded by an existence check.
--   The script is safe to re-run after a partial failure.
--
-- SECTIONS
--   1.  Database creation & options
--   2.  Schema (dbo)
--   3.  Tables
--   4.  Indexes
--   5.  Foreign key constraints
--   6.  Check constraints
--   7.  Triggers (auto-update updatedAt)
--   8.  Stored procedures (maintenance)
--   9.  Seed data (connector stubs)
--  10.  Verification query
-- ============================================================

-- ============================================================
-- SECTION 1 — DATABASE CREATION
-- ============================================================
-- NOTE: Azure SQL Database does not support USE master / CREATE DATABASE
-- from within a connection-level script.  If you are targeting Azure SQL,
-- create the database through the Azure Portal or Azure CLI first, then
-- connect directly to that database and run sections 2–10 only.
-- ============================================================

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'ProjectManagement')
BEGIN
  CREATE DATABASE ProjectManagement
    COLLATE SQL_Latin1_General_CP1_CI_AS;   -- case-insensitive, accent-sensitive
  PRINT 'Database ProjectManagement created.';
END
ELSE
BEGIN
  PRINT 'Database ProjectManagement already exists — skipping creation.';
END
GO

-- Set recommended options for a web application database
ALTER DATABASE ProjectManagement SET RECOVERY SIMPLE;          -- change to FULL for production with log backups
ALTER DATABASE ProjectManagement SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;  -- enables MVCC-style reads
ALTER DATABASE ProjectManagement SET ALLOW_SNAPSHOT_ISOLATION ON;
ALTER DATABASE ProjectManagement SET AUTO_UPDATE_STATISTICS ON;
ALTER DATABASE ProjectManagement SET AUTO_CREATE_STATISTICS ON;
GO

USE ProjectManagement;
GO

-- ============================================================
-- SECTION 2 — SCHEMA
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'dbo')
BEGIN
  EXEC('CREATE SCHEMA dbo');
END
GO

-- ============================================================
-- SECTION 3 — TABLES
-- ============================================================

-- ─── 3.1  users ──────────────────────────────────────────────────────────────
--
-- Central identity table.  Supports two login methods:
--   password  — local accounts (passwordHash set)
--   entra     — Microsoft Entra ID SSO (entraOid / entraUpn set)
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'users' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.users (
    -- Primary key
    id              INT             IDENTITY(1,1)   NOT NULL,

    -- Internal stable identifier (UUID or Entra OID)
    openId          NVARCHAR(255)   NOT NULL,

    -- Profile
    name            NVARCHAR(255)   NULL,
    email           NVARCHAR(320)   NULL,           -- RFC 5321 max length
    loginMethod     NVARCHAR(64)    NULL,           -- 'password' | 'entra'

    -- Role-based access control
    -- Roles: user | admin | executive | company | qa | sales_marketing | csm
    role            NVARCHAR(50)    NOT NULL        CONSTRAINT DF_users_role    DEFAULT 'user',

    -- Password auth (demo / fallback accounts only)
    passwordHash    NVARCHAR(255)   NULL,

    -- TOTP / software MFA (optional second factor for password accounts)
    mfaSecret       NVARCHAR(255)   NULL,
    mfaEnabled      BIT             NOT NULL        CONSTRAINT DF_users_mfaEnabled  DEFAULT 0,
    mfaVerified     BIT             NOT NULL        CONSTRAINT DF_users_mfaVerified DEFAULT 0,

    -- Microsoft Entra ID (Azure AD) SSO fields
    entraOid        NVARCHAR(128)   NULL,           -- Entra Object ID (immutable GUID)
    entraUpn        NVARCHAR(320)   NULL,           -- user@company.com
    entraTenantId   NVARCHAR(128)   NULL,           -- Entra tenant GUID

    -- Account status
    isActive        BIT             NOT NULL        CONSTRAINT DF_users_isActive    DEFAULT 1,

    -- Timestamps (all UTC)
    createdAt       DATETIME2(3)    NOT NULL        CONSTRAINT DF_users_createdAt   DEFAULT GETUTCDATE(),
    updatedAt       DATETIME2(3)    NOT NULL        CONSTRAINT DF_users_updatedAt   DEFAULT GETUTCDATE(),
    lastSignedIn    DATETIME2(3)    NOT NULL        CONSTRAINT DF_users_lastSignedIn DEFAULT GETUTCDATE(),

    -- Constraints
    CONSTRAINT PK_users             PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_users_openId      UNIQUE (openId),
    CONSTRAINT CK_users_role        CHECK (role IN ('user','admin','executive','company')),
    CONSTRAINT CK_users_loginMethod CHECK (loginMethod IN ('password','entra') OR loginMethod IS NULL)
  );

  PRINT 'Table dbo.users created.';
END
GO

-- ─── 3.2  refresh_tokens ─────────────────────────────────────────────────────
--
-- Stores hashed refresh tokens for session renewal.
-- Tokens are revoked on logout and purged on expiry.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'refresh_tokens' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.refresh_tokens (
    id          INT             IDENTITY(1,1)   NOT NULL,
    userId      INT             NOT NULL,
    tokenHash   NVARCHAR(255)   NOT NULL,       -- SHA-256 hex of the raw token
    expiresAt   DATETIME2(3)    NOT NULL,
    revoked     BIT             NOT NULL        CONSTRAINT DF_refresh_tokens_revoked    DEFAULT 0,
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_refresh_tokens_createdAt  DEFAULT GETUTCDATE(),

    CONSTRAINT PK_refresh_tokens PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_refresh_tokens_userId
      FOREIGN KEY (userId) REFERENCES dbo.users (id) ON DELETE CASCADE
  );

  PRINT 'Table dbo.refresh_tokens created.';
END
GO

-- ─── 3.3  audit_logs ─────────────────────────────────────────────────────────
--
-- Append-only log of every significant user action.
-- userId is nullable so pre-auth events (failed logins) can be recorded.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'audit_logs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.audit_logs (
    id          INT             IDENTITY(1,1)   NOT NULL,
    userId      INT             NULL,           -- FK to users; NULL for unauthenticated events
    userEmail   NVARCHAR(320)   NULL,           -- denormalised for query convenience
    action      NVARCHAR(100)   NOT NULL,       -- e.g. 'login.success', 'user.role_changed'
    resource    NVARCHAR(255)   NOT NULL,       -- e.g. 'auth', 'user_management'
    resourceId  NVARCHAR(255)   NULL,           -- e.g. target user id
    ipAddress   NVARCHAR(45)    NULL,           -- IPv4 or IPv6
    userAgent   NVARCHAR(MAX)   NULL,
    metadata    NVARCHAR(MAX)   NULL,           -- JSON blob for extra context
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_audit_logs_createdAt DEFAULT GETUTCDATE(),

    CONSTRAINT PK_audit_logs PRIMARY KEY CLUSTERED (id)
    -- No FK on userId intentionally: audit rows must survive user deletion
  );

  PRINT 'Table dbo.audit_logs created.';
END
GO

-- ─── 3.4  dashboard_snapshots ────────────────────────────────────────────────
--
-- Cached JSON payloads for each dashboard tab.
-- The application writes a new snapshot after each data sync and reads
-- the most recent non-expired row for a given tabName.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'dashboard_snapshots' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.dashboard_snapshots (
    id          INT             IDENTITY(1,1)   NOT NULL,
    tabName     NVARCHAR(100)   NOT NULL,       -- e.g. 'delivery', 'qa', 'sales'
    data        NVARCHAR(MAX)   NOT NULL,       -- JSON payload
    source      NVARCHAR(100)   NOT NULL        CONSTRAINT DF_dashboard_snapshots_source DEFAULT 'mock',
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_dashboard_snapshots_createdAt DEFAULT GETUTCDATE(),
    expiresAt   DATETIME2(3)    NULL,           -- NULL = never expires

    CONSTRAINT PK_dashboard_snapshots PRIMARY KEY CLUSTERED (id)
  );

  PRINT 'Table dbo.dashboard_snapshots created.';
END
GO

-- ─── 3.5  connector_configs ──────────────────────────────────────────────────
--
-- Configuration records for external data connectors (Jira, GitHub,
-- Salesforce, Google Analytics, CSV upload).
-- One row per connector; the JSON config column holds connector-specific keys.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'connector_configs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.connector_configs (
    id              INT             IDENTITY(1,1)   NOT NULL,
    name            NVARCHAR(100)   NOT NULL,       -- e.g. 'jira', 'github'
    connectorType   NVARCHAR(50)    NOT NULL,       -- e.g. 'jira_rest', 'github_rest'
    config          NVARCHAR(MAX)   NOT NULL,       -- JSON: connector-specific credentials/settings
    isActive        BIT             NOT NULL        CONSTRAINT DF_connector_configs_isActive  DEFAULT 0,
    lastSync        DATETIME2(3)    NULL,
    createdAt       DATETIME2(3)    NOT NULL        CONSTRAINT DF_connector_configs_createdAt DEFAULT GETUTCDATE(),
    updatedAt       DATETIME2(3)    NOT NULL        CONSTRAINT DF_connector_configs_updatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT PK_connector_configs     PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_connector_configs_name UNIQUE (name)
  );

  PRINT 'Table dbo.connector_configs created.';
END
GO

-- ─── 3.6  computed_kpis ──────────────────────────────────────────────────────
--
-- Pre-aggregated KPI results from the Jira sync pipeline.
-- The dashboard reads from this table; the Jira API is never called on page load.
-- One row per (boardId, kpiType) combination; updated in-place on each sync.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'computed_kpis' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.computed_kpis (
    id          INT             IDENTITY(1,1)   NOT NULL,
    boardId     NVARCHAR(64)    NOT NULL,       -- Jira board ID
    kpiType     NVARCHAR(64)    NOT NULL,       -- 'delivery' | 'development'
    data        NVARCHAR(MAX)   NOT NULL,       -- JSON: ComputedDeliveryKPIs payload
    source      NVARCHAR(32)    NOT NULL        CONSTRAINT DF_computed_kpis_source     DEFAULT 'jira',
    computedAt  DATETIME2(3)    NOT NULL,
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_computed_kpis_createdAt  DEFAULT GETUTCDATE(),
    updatedAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_computed_kpis_updatedAt  DEFAULT GETUTCDATE(),

    CONSTRAINT PK_computed_kpis                 PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_computed_kpis_board_type      UNIQUE (boardId, kpiType)
  );

  PRINT 'Table dbo.computed_kpis created.';
END
GO

-- ─── 3.7  duo_state_store ────────────────────────────────────────────────────
--
-- Short-lived CSRF state tokens for the Duo Universal Prompt OIDC flow.
-- Each row is created when the user is redirected to Duo and consumed on callback.
-- Rows expire after 10 minutes; a maintenance procedure purges expired rows.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'duo_state_store' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.duo_state_store (
    id          INT             IDENTITY(1,1)   NOT NULL,
    state       NVARCHAR(128)   NOT NULL,       -- random CSRF token generated by Duo SDK
    username    NVARCHAR(320)   NOT NULL,       -- email address used as Duo username
    userId      INT             NOT NULL,
    expiresAt   DATETIME2(3)    NOT NULL,
    used        BIT             NOT NULL        CONSTRAINT DF_duo_state_store_used      DEFAULT 0,
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_duo_state_store_createdAt DEFAULT GETUTCDATE(),

    CONSTRAINT PK_duo_state_store       PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_duo_state_store_state UNIQUE (state)
  );

  PRINT 'Table dbo.duo_state_store created.';
END
GO

-- ─── 3.8  pending_auth_store ─────────────────────────────────────────────────
--
-- Holds the Entra-authenticated user identity between the Entra OIDC callback
-- and the Duo Universal Prompt callback.  Each token is consumed exactly once.
-- Rows expire after 5 minutes; a maintenance procedure purges expired rows.
--
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'pending_auth_store' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.pending_auth_store (
    id          INT             IDENTITY(1,1)   NOT NULL,
    token       NVARCHAR(128)   NOT NULL,       -- random one-time CSRF token
    userId      INT             NOT NULL,
    username    NVARCHAR(320)   NOT NULL,       -- UPN / email forwarded to Duo
    expiresAt   DATETIME2(3)    NOT NULL,
    used        BIT             NOT NULL        CONSTRAINT DF_pending_auth_store_used      DEFAULT 0,
    createdAt   DATETIME2(3)    NOT NULL        CONSTRAINT DF_pending_auth_store_createdAt DEFAULT GETUTCDATE(),

    CONSTRAINT PK_pending_auth_store        PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_pending_auth_store_token  UNIQUE (token)
  );

  PRINT 'Table dbo.pending_auth_store created.';
END
GO

-- ============================================================
-- SECTION 4 — INDEXES
-- ============================================================

-- users: Entra SSO lookup (filtered — only rows with entraOid)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_entraOid' AND object_id = OBJECT_ID('dbo.users'))
  CREATE NONCLUSTERED INDEX IX_users_entraOid
    ON dbo.users (entraOid)
    WHERE entraOid IS NOT NULL;
GO

-- users: email lookup (filtered — only rows with email)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_email' AND object_id = OBJECT_ID('dbo.users'))
  CREATE NONCLUSTERED INDEX IX_users_email
    ON dbo.users (email)
    WHERE email IS NOT NULL;
GO

-- users: active users by last sign-in (used by User Management page)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_lastSignedIn' AND object_id = OBJECT_ID('dbo.users'))
  CREATE NONCLUSTERED INDEX IX_users_lastSignedIn
    ON dbo.users (lastSignedIn DESC)
    INCLUDE (id, name, email, role, isActive);
GO

-- refresh_tokens: token hash lookup (used on every authenticated request)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_refresh_tokens_tokenHash' AND object_id = OBJECT_ID('dbo.refresh_tokens'))
  CREATE NONCLUSTERED INDEX IX_refresh_tokens_tokenHash
    ON dbo.refresh_tokens (tokenHash)
    INCLUDE (userId, expiresAt, revoked);
GO

-- refresh_tokens: user lookup (used on logout to revoke all tokens)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_refresh_tokens_userId' AND object_id = OBJECT_ID('dbo.refresh_tokens'))
  CREATE NONCLUSTERED INDEX IX_refresh_tokens_userId
    ON dbo.refresh_tokens (userId);
GO

-- audit_logs: user history lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_logs_userId' AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE NONCLUSTERED INDEX IX_audit_logs_userId
    ON dbo.audit_logs (userId, createdAt DESC);
GO

-- audit_logs: chronological admin view
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_logs_createdAt' AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE NONCLUSTERED INDEX IX_audit_logs_createdAt
    ON dbo.audit_logs (createdAt DESC);
GO

-- dashboard_snapshots: tab lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_dashboard_snapshots_tabName' AND object_id = OBJECT_ID('dbo.dashboard_snapshots'))
  CREATE NONCLUSTERED INDEX IX_dashboard_snapshots_tabName
    ON dbo.dashboard_snapshots (tabName, createdAt DESC);
GO

-- dashboard_snapshots: expiry cleanup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_dashboard_snapshots_expiresAt' AND object_id = OBJECT_ID('dbo.dashboard_snapshots'))
  CREATE NONCLUSTERED INDEX IX_dashboard_snapshots_expiresAt
    ON dbo.dashboard_snapshots (expiresAt)
    WHERE expiresAt IS NOT NULL;
GO

-- computed_kpis: latest KPI lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_computed_kpis_computedAt' AND object_id = OBJECT_ID('dbo.computed_kpis'))
  CREATE NONCLUSTERED INDEX IX_computed_kpis_computedAt
    ON dbo.computed_kpis (computedAt DESC);
GO

-- duo_state_store: expiry cleanup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_duo_state_store_expiresAt' AND object_id = OBJECT_ID('dbo.duo_state_store'))
  CREATE NONCLUSTERED INDEX IX_duo_state_store_expiresAt
    ON dbo.duo_state_store (expiresAt);
GO

-- pending_auth_store: expiry cleanup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pending_auth_store_expiresAt' AND object_id = OBJECT_ID('dbo.pending_auth_store'))
  CREATE NONCLUSTERED INDEX IX_pending_auth_store_expiresAt
    ON dbo.pending_auth_store (expiresAt);
GO

-- ============================================================
-- SECTION 5 — FOREIGN KEY CONSTRAINTS
-- (Tables already created with inline FKs; this section adds
--  any cross-table FKs that could not be declared inline.)
-- ============================================================

-- audit_logs does NOT have an FK to users intentionally:
-- audit rows must survive user deletion to preserve the audit trail.

-- ============================================================
-- SECTION 6 — CHECK CONSTRAINTS
-- (Declared inline in CREATE TABLE; documented here for reference.)
-- ============================================================
--
-- CK_users_role        : role IN ('user','admin','executive','company')
-- CK_users_loginMethod : loginMethod IN ('password','entra') OR NULL
--
-- ============================================================

-- ============================================================
-- SECTION 7 — TRIGGERS (auto-update updatedAt)
-- ============================================================
-- SQL Server does not support ON UPDATE DEFAULT like MySQL.
-- These AFTER UPDATE triggers maintain the updatedAt column.
-- ============================================================

-- users.updatedAt
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = N'TR_users_updatedAt')
EXEC(N'
CREATE TRIGGER dbo.TR_users_updatedAt
ON dbo.users
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT UPDATE(updatedAt)
  BEGIN
    UPDATE dbo.users
      SET updatedAt = GETUTCDATE()
    FROM dbo.users u
    INNER JOIN inserted i ON u.id = i.id;
  END
END
');
GO

-- connector_configs.updatedAt
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = N'TR_connector_configs_updatedAt')
EXEC(N'
CREATE TRIGGER dbo.TR_connector_configs_updatedAt
ON dbo.connector_configs
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT UPDATE(updatedAt)
  BEGIN
    UPDATE dbo.connector_configs
      SET updatedAt = GETUTCDATE()
    FROM dbo.connector_configs c
    INNER JOIN inserted i ON c.id = i.id;
  END
END
');
GO

-- computed_kpis.updatedAt
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = N'TR_computed_kpis_updatedAt')
EXEC(N'
CREATE TRIGGER dbo.TR_computed_kpis_updatedAt
ON dbo.computed_kpis
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT UPDATE(updatedAt)
  BEGIN
    UPDATE dbo.computed_kpis
      SET updatedAt = GETUTCDATE()
    FROM dbo.computed_kpis k
    INNER JOIN inserted i ON k.id = i.id;
  END
END
');
GO

-- ============================================================
-- SECTION 8 — STORED PROCEDURES (maintenance)
-- ============================================================

-- ─── 8.1  usp_PurgeExpiredTokens ─────────────────────────────────────────────
-- Removes expired rows from the three short-lived token tables.
-- Schedule this via SQL Server Agent to run every 15 minutes.
--
IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = N'usp_PurgeExpiredTokens' AND schema_id = SCHEMA_ID('dbo'))
EXEC(N'
CREATE PROCEDURE dbo.usp_PurgeExpiredTokens
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @now DATETIME2 = GETUTCDATE();
  DECLARE @deleted INT;

  -- Purge expired refresh tokens
  DELETE FROM dbo.refresh_tokens WHERE expiresAt <= @now;
  SET @deleted = @@ROWCOUNT;
  IF @deleted > 0
    PRINT CONCAT(''Purged '', @deleted, '' expired refresh_tokens rows.'');

  -- Purge expired Duo state tokens
  DELETE FROM dbo.duo_state_store WHERE expiresAt <= @now;
  SET @deleted = @@ROWCOUNT;
  IF @deleted > 0
    PRINT CONCAT(''Purged '', @deleted, '' expired duo_state_store rows.'');

  -- Purge expired pending auth tokens
  DELETE FROM dbo.pending_auth_store WHERE expiresAt <= @now;
  SET @deleted = @@ROWCOUNT;
  IF @deleted > 0
    PRINT CONCAT(''Purged '', @deleted, '' expired pending_auth_store rows.'');
END
');
GO

-- ─── 8.2  usp_PurgeOldAuditLogs ──────────────────────────────────────────────
-- Removes audit log rows older than @retentionDays (default 365).
-- Schedule via SQL Server Agent monthly or as compliance requires.
--
IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = N'usp_PurgeOldAuditLogs' AND schema_id = SCHEMA_ID('dbo'))
EXEC(N'
CREATE PROCEDURE dbo.usp_PurgeOldAuditLogs
  @retentionDays INT = 365
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @cutoff DATETIME2 = DATEADD(DAY, -@retentionDays, GETUTCDATE());

  DELETE FROM dbo.audit_logs WHERE createdAt < @cutoff;
  PRINT CONCAT(''Purged audit_logs rows older than '', @retentionDays, '' days ('', CONVERT(NVARCHAR, @cutoff, 120), '').'');
END
');
GO

-- ─── 8.3  usp_PurgeExpiredSnapshots ──────────────────────────────────────────
-- Removes dashboard snapshot rows that have passed their expiresAt timestamp.
--
IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = N'usp_PurgeExpiredSnapshots' AND schema_id = SCHEMA_ID('dbo'))
EXEC(N'
CREATE PROCEDURE dbo.usp_PurgeExpiredSnapshots
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @now DATETIME2 = GETUTCDATE();
  DELETE FROM dbo.dashboard_snapshots WHERE expiresAt IS NOT NULL AND expiresAt <= @now;
  PRINT CONCAT(''Purged '', @@ROWCOUNT, '' expired dashboard_snapshots rows.'');
END
');
GO

-- ============================================================
-- SECTION 9 — SEED DATA
-- ============================================================
-- Inserts the five default connector configuration stubs.
-- Uses MERGE so re-running the script does not create duplicates.
-- ============================================================

MERGE dbo.connector_configs AS target
USING (
  VALUES
    ('jira',             'jira_rest',       '{"base_url":"","project_key":"","api_token":""}',                          0),
    ('github',           'github_rest',     '{"org":"","repo":"","token":""}',                                          0),
    ('salesforce',       'salesforce_rest', '{"instance_url":"","client_id":"","client_secret":""}',                   0),
    ('csv_upload',       'file_upload',     '{"allowed_types":["csv","json"],"max_size_mb":10}',                       0),
    ('google_analytics', 'ga4_rest',        '{"property_id":"","credentials_json":""}',                                0)
) AS source (name, connectorType, config, isActive)
ON target.name = source.name
WHEN MATCHED THEN
  UPDATE SET connectorType = source.connectorType
WHEN NOT MATCHED THEN
  INSERT (name, connectorType, config, isActive)
  VALUES (source.name, source.connectorType, source.config, source.isActive);
GO

PRINT 'Connector seed data applied.';
GO

-- ============================================================
-- SECTION 10 — VERIFICATION QUERY
-- ============================================================
-- Run this after the script completes to confirm all objects
-- were created successfully.
-- ============================================================

SELECT
  t.name                                  AS [Table],
  SUM(p.rows)                             AS [Rows],
  COUNT(DISTINCT i.index_id) - 1          AS [Indexes],   -- subtract 1 for the clustered PK
  (SELECT COUNT(*) FROM sys.triggers tr
   WHERE tr.parent_id = t.object_id)      AS [Triggers]
FROM sys.tables t
JOIN sys.partitions p
  ON p.object_id = t.object_id AND p.index_id IN (0, 1)
LEFT JOIN sys.indexes i
  ON i.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID('dbo')
  AND t.name IN (
    'users', 'refresh_tokens', 'audit_logs',
    'dashboard_snapshots', 'connector_configs',
    'computed_kpis', 'duo_state_store', 'pending_auth_store'
  )
GROUP BY t.name, t.object_id
ORDER BY t.name;
GO

SELECT
  p.name                                  AS [Procedure]
FROM sys.procedures p
WHERE p.schema_id = SCHEMA_ID('dbo')
  AND p.name IN ('usp_PurgeExpiredTokens', 'usp_PurgeOldAuditLogs', 'usp_PurgeExpiredSnapshots')
ORDER BY p.name;
GO

PRINT '=== ProjectManagement database setup complete ===';
GO
