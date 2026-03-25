-- ============================================================
-- Wheelhouse Executive Dashboard — SQL Server Schema
-- ============================================================
-- Run this script once against your SQL Server database to
-- create all required tables.  The script is idempotent:
-- every CREATE TABLE is guarded by IF NOT EXISTS logic so it
-- is safe to re-run after partial failures.
--
-- Tested on: SQL Server 2019+, Azure SQL Database (S0+)
-- ============================================================

-- ─── Users ────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users')
BEGIN
  CREATE TABLE users (
    id            INT            IDENTITY(1,1) PRIMARY KEY,
    openId        NVARCHAR(255)  NOT NULL UNIQUE,
    name          NVARCHAR(255)  NULL,
    email         NVARCHAR(320)  NULL,
    loginMethod   NVARCHAR(64)   NULL,
    -- Allowed roles: user | admin | executive | company | qa | sales_marketing | csm
    role          NVARCHAR(50)   NOT NULL DEFAULT 'user'
                    CONSTRAINT CK_users_role CHECK (
                      role IN ('user','admin','executive','company','qa','sales_marketing','csm')
                    ),
    passwordHash  NVARCHAR(255)  NULL,
    mfaSecret     NVARCHAR(255)  NULL,
    mfaEnabled    BIT            NOT NULL DEFAULT 0,
    mfaVerified   BIT            NOT NULL DEFAULT 0,
    -- Entra ID (Azure AD) SSO fields
    entraOid      NVARCHAR(128)  NULL,   -- Entra Object ID (immutable GUID)
    entraUpn      NVARCHAR(320)  NULL,   -- user@company.com
    entraTenantId NVARCHAR(128)  NULL,   -- Entra tenant GUID
    isActive      BIT            NOT NULL DEFAULT 1,
    createdAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    lastSignedIn  DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  -- Index for Entra SSO lookups
  CREATE INDEX IX_users_entraOid ON users (entraOid) WHERE entraOid IS NOT NULL;
  CREATE INDEX IX_users_email    ON users (email)    WHERE email    IS NOT NULL;
END;
GO

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'refresh_tokens')
BEGIN
  CREATE TABLE refresh_tokens (
    id         INT            IDENTITY(1,1) PRIMARY KEY,
    userId     INT            NOT NULL,
    tokenHash  NVARCHAR(255)  NOT NULL,
    expiresAt  DATETIME2      NOT NULL,
    revoked    BIT            NOT NULL DEFAULT 0,
    createdAt  DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_refresh_tokens_userId FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE INDEX IX_refresh_tokens_tokenHash ON refresh_tokens (tokenHash);
  CREATE INDEX IX_refresh_tokens_userId    ON refresh_tokens (userId);
END;
GO

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'audit_logs')
BEGIN
  CREATE TABLE audit_logs (
    id          INT              IDENTITY(1,1) PRIMARY KEY,
    userId      INT              NULL,
    userEmail   NVARCHAR(320)    NULL,
    action      NVARCHAR(100)    NOT NULL,
    resource    NVARCHAR(255)    NOT NULL,
    resourceId  NVARCHAR(255)    NULL,
    ipAddress   NVARCHAR(45)     NULL,
    userAgent   NVARCHAR(MAX)    NULL,
    -- JSON stored as NVARCHAR(MAX); parse in application layer
    metadata    NVARCHAR(MAX)    NULL,
    createdAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_audit_logs_userId    ON audit_logs (userId);
  CREATE INDEX IX_audit_logs_createdAt ON audit_logs (createdAt DESC);
END;
GO

-- ─── Dashboard Snapshots ──────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dashboard_snapshots')
BEGIN
  CREATE TABLE dashboard_snapshots (
    id        INT            IDENTITY(1,1) PRIMARY KEY,
    tabName   NVARCHAR(100)  NOT NULL,
    -- JSON payload stored as NVARCHAR(MAX)
    data      NVARCHAR(MAX)  NOT NULL,
    source    NVARCHAR(100)  NOT NULL DEFAULT 'mock',
    createdAt DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    expiresAt DATETIME2      NULL
  );

  CREATE INDEX IX_dashboard_snapshots_tabName   ON dashboard_snapshots (tabName);
  CREATE INDEX IX_dashboard_snapshots_expiresAt ON dashboard_snapshots (expiresAt) WHERE expiresAt IS NOT NULL;
END;
GO

-- ─── Connector Configs ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'connector_configs')
BEGIN
  CREATE TABLE connector_configs (
    id            INT            IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(100)  NOT NULL UNIQUE,
    connectorType NVARCHAR(50)   NOT NULL,
    -- JSON config stored as NVARCHAR(MAX)
    config        NVARCHAR(MAX)  NOT NULL,
    isActive      BIT            NOT NULL DEFAULT 0,
    lastSync      DATETIME2      NULL,
    createdAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );
END;
GO

-- ─── Computed KPIs ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'computed_kpis')
BEGIN
  CREATE TABLE computed_kpis (
    id          INT            IDENTITY(1,1) PRIMARY KEY,
    boardId     NVARCHAR(64)   NOT NULL,
    kpiType     NVARCHAR(64)   NOT NULL,   -- 'delivery' | 'development'
    -- JSON payload stored as NVARCHAR(MAX)
    data        NVARCHAR(MAX)  NOT NULL,
    source      NVARCHAR(32)   NOT NULL DEFAULT 'jira',
    computedAt  DATETIME2      NOT NULL,
    createdAt   DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updatedAt   DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_computed_kpis_board_type UNIQUE (boardId, kpiType)
  );

  CREATE INDEX IX_computed_kpis_computedAt ON computed_kpis (computedAt DESC);
END;
GO

-- ─── Duo State Store ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'duo_state_store')
BEGIN
  CREATE TABLE duo_state_store (
    id        INT            IDENTITY(1,1) PRIMARY KEY,
    state     NVARCHAR(128)  NOT NULL UNIQUE,
    username  NVARCHAR(320)  NOT NULL,   -- email used as Duo username
    userId    INT            NOT NULL,
    expiresAt DATETIME2      NOT NULL,
    used      BIT            NOT NULL DEFAULT 0,
    createdAt DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_duo_state_store_expiresAt ON duo_state_store (expiresAt);
END;
GO

-- ─── Pending Auth Store ───────────────────────────────────────────────────────
-- Holds the Entra-authenticated user identity between Entra callback and Duo
-- callback.  Each token is consumed once Duo verification succeeds.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pending_auth_store')
BEGIN
  CREATE TABLE pending_auth_store (
    id        INT            IDENTITY(1,1) PRIMARY KEY,
    token     NVARCHAR(128)  NOT NULL UNIQUE,   -- random CSRF token
    userId    INT            NOT NULL,
    username  NVARCHAR(320)  NOT NULL,           -- UPN / email for Duo
    expiresAt DATETIME2      NOT NULL,
    used      BIT            NOT NULL DEFAULT 0,
    createdAt DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_pending_auth_store_expiresAt ON pending_auth_store (expiresAt);
END;
GO

-- ─── Trigger: auto-update updatedAt on users ─────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_users_updatedAt')
BEGIN
  EXEC('
    CREATE TRIGGER TR_users_updatedAt
    ON users
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE users
        SET updatedAt = GETUTCDATE()
      FROM users u
      INNER JOIN inserted i ON u.id = i.id;
    END
  ');
END;
GO

-- ─── Trigger: auto-update updatedAt on connector_configs ─────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_connector_configs_updatedAt')
BEGIN
  EXEC('
    CREATE TRIGGER TR_connector_configs_updatedAt
    ON connector_configs
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE connector_configs
        SET updatedAt = GETUTCDATE()
      FROM connector_configs c
      INNER JOIN inserted i ON c.id = i.id;
    END
  ');
END;
GO

-- ─── Trigger: auto-update updatedAt on computed_kpis ─────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_computed_kpis_updatedAt')
BEGIN
  EXEC('
    CREATE TRIGGER TR_computed_kpis_updatedAt
    ON computed_kpis
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE computed_kpis
        SET updatedAt = GETUTCDATE()
      FROM computed_kpis k
      INNER JOIN inserted i ON k.id = i.id;
    END
  ');
END;
GO
