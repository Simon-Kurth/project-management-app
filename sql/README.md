# SQL Scripts

This folder contains all hand-authored SQL scripts for the Wheelhouse database. Scripts are written for **Microsoft SQL Server 2019+** and **Azure SQL Database / Managed Instance**.

---

## Scripts

| File | Purpose | Run when | Run as |
|---|---|---|---|
| `create-database.sql` | Creates the Wheelhouse database, all 8 tables, 11 indexes, constraints, 3 triggers, 3 stored procedures, and connector seed data | Once, on a fresh SQL Server instance before first application boot | `sa` or `dbcreator` role |
| `create-app-login.sql` | Creates the `wheelhouse_app` least-privilege SQL login and grants only `SELECT/INSERT/UPDATE/DELETE` on application tables plus `EXECUTE` on maintenance procedures | Once, after `create-database.sql` | `sa` or `securityadmin` role |
| `maint-purge-agent-job.sql` | Creates 3 SQL Server Agent jobs: token purge (every 15 min), snapshot purge (hourly), audit log purge (monthly) | Once, after `create-database.sql` | `sa` or `SQLAgentOperatorRole` in msdb |
| `migrate-template.sql` | Reusable template for future schema migrations — includes pre-flight checks, forward migration, rollback, and verification sections | Copy and rename for each new migration | `wheelhouse_app` or `db_ddladmin` |

---

## Recommended Execution Order

Run the scripts in this order on a fresh server:

1. `create-database.sql` — creates the database and all objects
2. `create-app-login.sql` — provisions the least-privilege app login
3. `maint-purge-agent-job.sql` — schedules the maintenance jobs
4. Set `DATABASE_URL` in your environment to use the `wheelhouse_app` credentials

---

## How to Run

### sqlcmd (recommended for CI/CD and on-premises)

```bash
# Step 1 — Create database (connect to master)
sqlcmd -S your-server\INSTANCE -U sa -P YourPassword -d master -i sql/create-database.sql

# Step 2 — Create app login (connect to master, then Wheelhouse)
sqlcmd -S your-server\INSTANCE -U sa -P YourPassword -d master -i sql/create-app-login.sql

# Step 3 — Create Agent jobs (connect to msdb)
sqlcmd -S your-server\INSTANCE -U sa -P YourPassword -d msdb -i sql/maint-purge-agent-job.sql
```

### Azure SQL Database

Azure SQL Database does not support `CREATE DATABASE` from a user connection or SQL Server Agent. Adjust as follows:

1. Create the database through the Azure Portal or `az sql db create`.
2. Connect directly to the `Wheelhouse` database and run `create-database.sql` (Section 1 will print a skip message and the rest will execute normally).
3. Run `create-app-login.sql` Section 1 from the `master` database connection, then Section 2 from the `Wheelhouse` connection.
4. For scheduled maintenance, use **Azure Elastic Jobs** or **Azure Functions Timer Triggers** as documented in the comments at the bottom of `maint-purge-agent-job.sql`.

### SSMS

Open each script in SQL Server Management Studio and press **F5**. Ensure you are connected to the correct database as noted in the **Run as** column above.

---

## Adding New Migration Scripts

Follow this naming convention when adding scripts to this folder:

| Type | Naming pattern | Example |
|---|---|---|
| Schema migration | `migrate-YYYYMMDD-description.sql` | `migrate-20260601-add-notifications-table.sql` |
| Data backfill | `backfill-YYYYMMDD-description.sql` | `backfill-20260601-set-default-roles.sql` |
| Maintenance | `maint-description.sql` | `maint-purge-old-audit-logs.sql` |
| One-time fix | `fix-YYYYMMDD-description.sql` | `fix-20260601-correct-entra-upn.sql` |

Copy `migrate-template.sql` as the starting point for any new migration. All scripts must be **idempotent** — guard every `CREATE` and `ALTER` with an existence check so re-running after a partial failure is safe.

---

*Last updated: March 2026 · The Wheelhouse · DataOceans Internal*
