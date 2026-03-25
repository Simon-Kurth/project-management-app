-- ============================================================
-- Wheelhouse Executive Dashboard
-- Least-Privilege Application Login Script
-- ============================================================
--
-- PURPOSE
--   Creates a dedicated SQL Server login and database user for
--   the Wheelhouse Node.js application.  The login is granted
--   only the permissions required at runtime — no DDL, no
--   schema changes, no access to system tables.
--
-- PRINCIPLE OF LEAST PRIVILEGE
--   The application login can:
--     SELECT, INSERT, UPDATE, DELETE on all application tables
--     EXECUTE on the three maintenance stored procedures
--   The application login cannot:
--     CREATE / ALTER / DROP any object
--     Access any other database
--     Read sys.* or INFORMATION_SCHEMA beyond what public allows
--     Act as a sysadmin or db_owner
--
-- COMPATIBILITY
--   SQL Server 2019+ (on-premises)
--   Azure SQL Database  — Section 1 (USE master / CREATE LOGIN)
--   must be run from the master database connection.
--   Azure SQL Managed Instance — fully supported.
--
-- EXECUTION
--   1. Replace the placeholder password below with a strong
--      randomly generated value (minimum 16 characters,
--      mixed case, digits, symbols).
--   2. Run Section 1 connected to master.
--   3. Run Section 2 connected to the Wheelhouse database.
--
--   sqlcmd -S <server> -U sa -P <sa-password> -d master
--          -v APP_PASSWORD="<strong-password>"
--          -i sql/create-app-login.sql
-- ============================================================

-- ============================================================
-- SECTION 1 — SERVER-LEVEL LOGIN  (run connected to master)
-- ============================================================

USE master;
GO

-- Replace 'CHANGE_ME_StrongPassword123!' with your actual password.
-- Use a secrets manager (Azure Key Vault, HashiCorp Vault) to
-- generate and store this value — never commit it to source control.
DECLARE @loginName  NVARCHAR(128) = N'wheelhouse_app';
DECLARE @password   NVARCHAR(128) = N'CHANGE_ME_StrongPassword123!';

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @loginName)
BEGIN
  DECLARE @sql NVARCHAR(MAX) =
    N'CREATE LOGIN ' + QUOTENAME(@loginName) +
    N' WITH PASSWORD = ' + QUOTENAME(@password, '''') +
    N', DEFAULT_DATABASE = Wheelhouse' +
    N', CHECK_EXPIRATION = OFF' +   -- disable for service accounts
    N', CHECK_POLICY = ON;';        -- enforce password complexity
  EXEC sp_executesql @sql;
  PRINT 'Login wheelhouse_app created.';
END
ELSE
BEGIN
  PRINT 'Login wheelhouse_app already exists — skipping creation.';
END
GO

-- ============================================================
-- SECTION 2 — DATABASE USER & PERMISSIONS  (run connected to Wheelhouse)
-- ============================================================

USE Wheelhouse;
GO

-- Create the database user mapped to the server login
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'wheelhouse_app')
BEGIN
  CREATE USER wheelhouse_app FOR LOGIN wheelhouse_app
    WITH DEFAULT_SCHEMA = dbo;
  PRINT 'Database user wheelhouse_app created.';
END
ELSE
BEGIN
  PRINT 'Database user wheelhouse_app already exists — skipping creation.';
END
GO

-- Grant DML permissions on each application table individually.
-- This is intentionally explicit — do NOT use db_datareader/db_datawriter
-- roles as they grant access to ALL current and future tables.

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.users               TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.refresh_tokens      TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.audit_logs          TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.dashboard_snapshots TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.connector_configs   TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.computed_kpis       TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.duo_state_store     TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.pending_auth_store  TO wheelhouse_app;
GO

-- Grant EXECUTE on maintenance stored procedures so the app can
-- call them from scheduled jobs or health-check endpoints if needed.
GRANT EXECUTE ON dbo.usp_PurgeExpiredTokens   TO wheelhouse_app;
GRANT EXECUTE ON dbo.usp_PurgeOldAuditLogs    TO wheelhouse_app;
GRANT EXECUTE ON dbo.usp_PurgeExpiredSnapshots TO wheelhouse_app;
GO

PRINT 'Permissions granted to wheelhouse_app.';
GO

-- ============================================================
-- SECTION 3 — VERIFICATION
-- ============================================================
-- Lists all permissions held by wheelhouse_app.
-- Expected output: SELECT/INSERT/UPDATE/DELETE on 8 tables
--                  EXECUTE on 3 stored procedures.
-- ============================================================

SELECT
  dp.class_desc                           AS [ObjectType],
  OBJECT_NAME(dp.major_id)                AS [ObjectName],
  dp.permission_name                      AS [Permission],
  dp.state_desc                           AS [State]
FROM sys.database_permissions dp
JOIN sys.database_principals  pr
  ON pr.principal_id = dp.grantee_principal_id
WHERE pr.name = N'wheelhouse_app'
ORDER BY dp.class_desc, OBJECT_NAME(dp.major_id), dp.permission_name;
GO

-- ============================================================
-- SECTION 4 — CONNECTION STRING REFERENCE
-- ============================================================
-- Use this login in your DATABASE_URL environment variable.
--
-- ADO.NET format (recommended):
--   Server=your-server.database.windows.net,1433;
--   Database=Wheelhouse;
--   User Id=wheelhouse_app;
--   Password=<your-password>;
--   Encrypt=true;
--   TrustServerCertificate=false;
--
-- URL format:
--   mssql://wheelhouse_app:<password>@your-server.database.windows.net/Wheelhouse
--
-- Azure SQL with Managed Identity (no password needed):
--   Server=your-server.database.windows.net,1433;
--   Database=Wheelhouse;
--   Authentication=Active Directory Managed Identity;
--   Encrypt=true;
--   TrustServerCertificate=false;
--   (Requires the managed identity to be added as a database user
--    via: CREATE USER [<managed-identity-name>] FROM EXTERNAL PROVIDER)
-- ============================================================
