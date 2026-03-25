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
--   The application login CAN:
--     SELECT, INSERT, UPDATE, DELETE on all application tables
--     EXECUTE on the three maintenance stored procedures
--   The application login CANNOT:
--     CREATE / ALTER / DROP any object
--     Access any other database
--     Read sys.* or INFORMATION_SCHEMA beyond what public allows
--     Act as a sysadmin or db_owner
--
-- ─── PASSWORD MANAGEMENT — READ BEFORE RUNNING ───────────────────────────────
--
-- NEVER hardcode a password in this file and commit it to source control.
-- Choose one of the three retrieval patterns below based on your environment,
-- then substitute the retrieved value into the @password variable in Section 1.
--
-- PATTERN A — Azure Key Vault (recommended for Azure SQL / Azure-hosted servers)
-- ─────────────────────────────────────────────────────────────────────────────
-- Store the password as a secret before running this script:
--
--   az keyvault secret set \
--     --vault-name "wheelhouse-kv" \
--     --name "wheelhouse-app-db-password" \
--     --value "$(openssl rand -base64 32)"
--
-- Retrieve it at script execution time and pass it as a sqlcmd variable:
--
--   DB_PASS=$(az keyvault secret show \
--     --vault-name "wheelhouse-kv" \
--     --name "wheelhouse-app-db-password" \
--     --query "value" -o tsv)
--
--   sqlcmd -S your-server.database.windows.net \
--          -U sa -P "$SA_PASS" \
--          -d master \
--          -v APP_PASSWORD="$DB_PASS" \
--          -i sql/create-app-login.sql
--
--   Then reference it in the script as: $(APP_PASSWORD)
--
-- PATTERN B — HashiCorp Vault (recommended for on-premises servers)
-- ─────────────────────────────────────────────────────────────────────────────
-- Store the password in Vault:
--
--   vault kv put secret/wheelhouse/db \
--     app_password="$(openssl rand -base64 32)"
--
-- Retrieve at execution time:
--
--   DB_PASS=$(vault kv get -field=app_password secret/wheelhouse/db)
--
--   sqlcmd -S your-server\INSTANCE \
--          -U sa -P "$SA_PASS" \
--          -d master \
--          -v APP_PASSWORD="$DB_PASS" \
--          -i sql/create-app-login.sql
--
-- PATTERN C — Environment variable (CI/CD pipelines: GitHub Actions, Azure DevOps)
-- ─────────────────────────────────────────────────────────────────────────────
-- In GitHub Actions, store the password as a repository secret
-- (Settings → Secrets → Actions → New repository secret):
--   Name:  WHEELHOUSE_APP_DB_PASSWORD
--   Value: <generated strong password>
--
-- In your workflow step:
--   - name: Create app login
--     run: |
--       sqlcmd -S ${{ secrets.SQL_SERVER }} \
--              -U sa -P "${{ secrets.SA_PASSWORD }}" \
--              -d master \
--              -v APP_PASSWORD="${{ secrets.WHEELHOUSE_APP_DB_PASSWORD }}" \
--              -i sql/create-app-login.sql
--
-- In Azure DevOps, use a Variable Group linked to Azure Key Vault:
--   Library → Variable Groups → Link secrets from Azure Key Vault
--   Reference in pipeline: $(WHEELHOUSE_APP_DB_PASSWORD)
--
-- ─────────────────────────────────────────────────────────────────────────────
--
-- COMPATIBILITY
--   SQL Server 2019+ (on-premises)
--   Azure SQL Database  — Section 1 must be run from the master database.
--   Azure SQL Managed Instance — fully supported.
--
-- ============================================================

-- ============================================================
-- SECTION 1 — SERVER-LEVEL LOGIN  (run connected to master)
-- ============================================================
-- Replace $(APP_PASSWORD) with the value retrieved from your
-- secrets manager using one of the patterns above.
-- ============================================================

USE master;
GO

DECLARE @loginName  NVARCHAR(128) = N'wheelhouse_app';
-- Substitute $(APP_PASSWORD) with the value from your secrets manager.
-- If running interactively, replace this with the actual password string.
DECLARE @password   NVARCHAR(128) = N'$(APP_PASSWORD)';

IF @password IN (N'$(APP_PASSWORD)', N'', N'CHANGE_ME')
BEGIN
  RAISERROR(
    'ERROR: Password placeholder not replaced. ' +
    'Retrieve the password from your secrets manager and pass it ' +
    'via the -v APP_PASSWORD="..." sqlcmd argument.',
    16, 1
  );
  RETURN;
END

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @loginName)
BEGIN
  DECLARE @sql NVARCHAR(MAX) =
    N'CREATE LOGIN ' + QUOTENAME(@loginName) +
    N' WITH PASSWORD = ' + QUOTENAME(@password, '''') +
    N', DEFAULT_DATABASE = Wheelhouse' +
    N', CHECK_EXPIRATION = OFF' +   -- disable expiry for service accounts
    N', CHECK_POLICY = ON;';        -- enforce OS password complexity policy
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
-- Explicit per-table grants are used intentionally — do NOT use
-- db_datareader / db_datawriter roles as they grant access to ALL
-- current and future tables, including any added by future migrations.

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.users               TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.refresh_tokens      TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.audit_logs          TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.dashboard_snapshots TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.connector_configs   TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.computed_kpis       TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.duo_state_store     TO wheelhouse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.pending_auth_store  TO wheelhouse_app;
GO

-- Grant EXECUTE on maintenance stored procedures
GRANT EXECUTE ON dbo.usp_PurgeExpiredTokens    TO wheelhouse_app;
GRANT EXECUTE ON dbo.usp_PurgeOldAuditLogs     TO wheelhouse_app;
GRANT EXECUTE ON dbo.usp_PurgeExpiredSnapshots TO wheelhouse_app;
GO

PRINT 'Permissions granted to wheelhouse_app.';
GO

-- ============================================================
-- SECTION 3 — AZURE MANAGED IDENTITY ALTERNATIVE
-- ============================================================
-- If your application server uses an Azure Managed Identity
-- (system-assigned or user-assigned), you can eliminate the
-- password entirely.  Run this block instead of Sections 1–2.
--
-- Prerequisites:
--   1. Enable Managed Identity on your App Service / VM / AKS pod.
--   2. Connect to the Wheelhouse database as an Entra admin.
--   3. Replace <managed-identity-name> with the identity's display name.
--
-- EXEC sp_executesql N'
--   CREATE USER [<managed-identity-name>] FROM EXTERNAL PROVIDER
--     WITH DEFAULT_SCHEMA = dbo;
-- ';
-- GO
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.users               TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.refresh_tokens      TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.audit_logs          TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.dashboard_snapshots TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.connector_configs   TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.computed_kpis       TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.duo_state_store     TO [<managed-identity-name>];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.pending_auth_store  TO [<managed-identity-name>];
-- GRANT EXECUTE ON dbo.usp_PurgeExpiredTokens    TO [<managed-identity-name>];
-- GRANT EXECUTE ON dbo.usp_PurgeOldAuditLogs     TO [<managed-identity-name>];
-- GRANT EXECUTE ON dbo.usp_PurgeExpiredSnapshots TO [<managed-identity-name>];
-- GO
--
-- Connection string for Managed Identity (no User Id / Password needed):
--   Server=your-server.database.windows.net,1433;
--   Database=Wheelhouse;
--   Authentication=Active Directory Managed Identity;
--   Encrypt=true;
--   TrustServerCertificate=false;
-- ============================================================

-- ============================================================
-- SECTION 4 — VERIFICATION
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
-- SECTION 5 — CONNECTION STRING REFERENCE
-- ============================================================
--
-- SQL auth (on-premises or Azure SQL):
--   Server=your-server.database.windows.net,1433;
--   Database=Wheelhouse;
--   User Id=wheelhouse_app;
--   Password=<retrieved-from-secrets-manager>;
--   Encrypt=true;
--   TrustServerCertificate=false;
--
-- Managed Identity (Azure — no password):
--   Server=your-server.database.windows.net,1433;
--   Database=Wheelhouse;
--   Authentication=Active Directory Managed Identity;
--   Encrypt=true;
--   TrustServerCertificate=false;
--
-- Named instance with Windows Auth (on-premises):
--   Server=your-server\INSTANCE,1433;
--   Database=Wheelhouse;
--   Integrated Security=true;
--   TrustServerCertificate=true;
-- ============================================================
