# SQL Scripts

This folder contains all hand-authored SQL scripts for the Wheelhouse database. Scripts are written for **Microsoft SQL Server 2019+** and **Azure SQL Database / Managed Instance**.

---

## Scripts

| File | Purpose | Run when | Run as |
|---|---|---|---|
| `create-database.sql` | Creates the Wheelhouse database, all 8 tables, 11 indexes, constraints, 3 triggers, 3 stored procedures, and connector seed data | Once, on a fresh SQL Server instance before first application boot | `sa` or `dbcreator` role |
| `create-app-login.sql` | Creates the `wheelhouse_app` least-privilege SQL login and grants only `SELECT/INSERT/UPDATE/DELETE` on application tables plus `EXECUTE` on maintenance procedures. Includes Azure Key Vault, HashiCorp Vault, and CI/CD pipeline retrieval patterns for the password. | Once, after `create-database.sql` | `sa` or `securityadmin` role |
| `maint-purge-agent-job.sql` | Configures Database Mail (SMTP), creates the `Wheelhouse DBA` email operator, and creates 3 SQL Server Agent jobs with failure email alerts: token purge (every 15 min), snapshot purge (hourly), audit log purge (monthly) | Once, after `create-database.sql` | `sa` or `SQLAgentOperatorRole` in msdb |
| `migrate-template.sql` | Reusable template for future schema migrations — includes pre-flight checks, forward migration, rollback, and verification sections | Copy and rename for each new migration | `wheelhouse_app` or `db_ddladmin` |
| `migrate-20260401-add-notifications-table.sql` | **First real migration.** Adds `dbo.notifications` table (9 columns, 3 indexes, FK to users), grants permissions to `wheelhouse_app`, creates `usp_PurgeOldNotifications` stored procedure, and adds a weekly Agent job for 90-day retention | When deploying the in-app notification centre feature (WH-142) | `wheelhouse_app` or `db_ddladmin` |

---

## Recommended Execution Order

Run the scripts in this order on a fresh server:

1. `create-database.sql` — creates the database and all base objects
2. `create-app-login.sql` — provisions the least-privilege app login (retrieve password from secrets manager first)
3. `maint-purge-agent-job.sql` — configures Database Mail, DBA operator, and Agent jobs
4. Set `DATABASE_URL` in your environment to use the `wheelhouse_app` credentials
5. Run any `migrate-*.sql` scripts in chronological order for features being deployed

---

## How to Run

### sqlcmd (recommended for CI/CD and on-premises)

```bash
# Step 1 — Create database (connect to master)
sqlcmd -S your-server\INSTANCE -U sa -P "$SA_PASS" -d master \
       -i sql/create-database.sql

# Step 2 — Create app login (retrieve password from secrets manager first)
DB_PASS=$(az keyvault secret show --vault-name "wheelhouse-kv" \
          --name "wheelhouse-app-db-password" --query "value" -o tsv)

sqlcmd -S your-server\INSTANCE -U sa -P "$SA_PASS" -d master \
       -v APP_PASSWORD="$DB_PASS" \
       -i sql/create-app-login.sql

# Step 3 — Create Agent jobs and email alerts (connect to msdb)
sqlcmd -S your-server\INSTANCE -U sa -P "$SA_PASS" -d msdb \
       -v SMTP_SERVER="smtp.office365.com" \
       -v SMTP_FROM="wheelhouse-alerts@company.com" \
       -v SMTP_USERNAME="wheelhouse-alerts@company.com" \
       -v SMTP_PASSWORD="$SMTP_PASS" \
       -v DBA_EMAIL="dba-team@company.com" \
       -i sql/maint-purge-agent-job.sql

# Step 4 — Run migrations (connect to Wheelhouse)
sqlcmd -S your-server\INSTANCE -U wheelhouse_app -P "$DB_PASS" -d Wheelhouse \
       -i sql/migrate-20260401-add-notifications-table.sql
```

### Azure SQL Database

Azure SQL Database does not support `CREATE DATABASE` from a user connection or SQL Server Agent. Adjust as follows:

1. Create the database through the Azure Portal or `az sql db create`.
2. Connect directly to the `Wheelhouse` database and run `create-database.sql`.
3. Run `create-app-login.sql` Section 1 from the `master` connection, then Section 2 from the `Wheelhouse` connection.
4. For scheduled maintenance, use **Azure Elastic Jobs** or **Azure Functions Timer Triggers** as documented in the comments at the bottom of `maint-purge-agent-job.sql`.

### SSMS

Open each script in SQL Server Management Studio and press **F5**. Ensure you are connected to the correct database as noted in the **Run as** column above.

---

## Adding New Migration Scripts

Follow this naming convention when adding scripts to this folder:

| Type | Naming pattern | Example |
|---|---|---|
| Schema migration | `migrate-YYYYMMDD-description.sql` | `migrate-20260601-add-webhooks-table.sql` |
| Data backfill | `backfill-YYYYMMDD-description.sql` | `backfill-20260601-set-default-roles.sql` |
| Maintenance | `maint-description.sql` | `maint-purge-old-audit-logs.sql` |
| One-time fix | `fix-YYYYMMDD-description.sql` | `fix-20260601-correct-entra-upn.sql` |

Copy `migrate-template.sql` as the starting point for any new migration. All scripts must be **idempotent** — guard every `CREATE` and `ALTER` with an existence check so re-running after a partial failure is safe.

---

*Last updated: April 2026 · The Wheelhouse · DataOceans Internal*
