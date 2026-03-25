# SQL Scripts

This folder contains all hand-authored SQL scripts for the Wheelhouse database.  Scripts are written for **Microsoft SQL Server 2019+** and **Azure SQL Database**.

---

## Scripts

| File | Purpose | Run when |
|---|---|---|
| `create-database.sql` | Full database creation — database, all tables, indexes, constraints, triggers, stored procedures, and connector seed data | Once, on a fresh SQL Server instance before first application boot |

---

## How to Run

### sqlcmd (recommended for CI/CD and on-premises)

```bash
# On-premises SQL Server — creates the Wheelhouse database from master
sqlcmd -S your-server\INSTANCE -U sa -P YourPassword -i sql/create-database.sql

# Azure SQL Database — database must already exist; connect directly to it
sqlcmd -S your-server.database.windows.net -U sa -P YourPassword -d Wheelhouse -i sql/create-database.sql
```

### SSMS

Open the script in SQL Server Management Studio and press **F5** (or click **Execute**).  For Azure SQL, connect directly to the `Wheelhouse` database before running.

---

## Adding New Scripts

Follow this naming convention when adding scripts to this folder:

| Type | Naming pattern | Example |
|---|---|---|
| Schema migration | `migrate-YYYYMMDD-description.sql` | `migrate-20260401-add-notifications-table.sql` |
| Data backfill | `backfill-YYYYMMDD-description.sql` | `backfill-20260401-set-default-roles.sql` |
| Maintenance | `maint-description.sql` | `maint-purge-old-audit-logs.sql` |
| One-time fix | `fix-YYYYMMDD-description.sql` | `fix-20260401-correct-entra-upn.sql` |

All scripts must be **idempotent** — guard every `CREATE` with an existence check so re-running after a partial failure is safe.

---

*Last updated: March 2026 · The Wheelhouse · DataOceans Internal*
