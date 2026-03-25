-- ============================================================
-- Wheelhouse Executive Dashboard
-- SQL Server Agent — Purge Maintenance Jobs
-- ============================================================
--
-- PURPOSE
--   Creates three SQL Server Agent jobs that automatically
--   call the maintenance stored procedures on a schedule:
--
--   Job 1: Wheelhouse — Purge Expired Tokens
--     Calls dbo.usp_PurgeExpiredTokens every 15 minutes.
--     Removes expired refresh tokens, Duo state tokens, and
--     pending auth tokens to keep those tables lean.
--
--   Job 2: Wheelhouse — Purge Expired Snapshots
--     Calls dbo.usp_PurgeExpiredSnapshots every hour.
--     Removes dashboard snapshot rows past their expiresAt.
--
--   Job 3: Wheelhouse — Purge Old Audit Logs
--     Calls dbo.usp_PurgeOldAuditLogs (365-day retention)
--     at 02:00 UTC on the 1st of each month.
--
-- PREREQUISITES
--   SQL Server Agent must be running.
--   The Wheelhouse database and its stored procedures must
--   already exist (run create-database.sql first).
--   The login executing this script must be a member of
--   sysadmin or have SQLAgentOperatorRole in msdb.
--
-- COMPATIBILITY
--   SQL Server 2019+ (on-premises)
--   Azure SQL Managed Instance (Agent is supported)
--   Azure SQL Database — SQL Agent is NOT available; use
--   Azure Elastic Jobs or Azure Functions on a timer trigger
--   instead (see the Azure alternative block at the end).
--
-- EXECUTION
--   sqlcmd -S <server> -U sa -P <password> -d msdb
--          -i sql/maint-purge-agent-job.sql
-- ============================================================

USE msdb;
GO

-- ============================================================
-- JOB 1 — Purge Expired Tokens (every 15 minutes)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'Wheelhouse — Purge Expired Tokens')
BEGIN
  -- Create the job
  EXEC msdb.dbo.sp_add_job
    @job_name        = N'Wheelhouse — Purge Expired Tokens',
    @enabled         = 1,
    @description     = N'Purges expired rows from refresh_tokens, duo_state_store, and pending_auth_store.',
    @category_name   = N'[Uncategorized (Local)]',
    @notify_level_eventlog = 2;   -- log on failure

  -- Add the job step
  EXEC msdb.dbo.sp_add_jobstep
    @job_name        = N'Wheelhouse — Purge Expired Tokens',
    @step_name       = N'Execute usp_PurgeExpiredTokens',
    @step_id         = 1,
    @subsystem       = N'TSQL',
    @command         = N'EXEC dbo.usp_PurgeExpiredTokens;',
    @database_name   = N'Wheelhouse',
    @on_success_action = 1,   -- quit with success
    @on_fail_action    = 2;   -- quit with failure

  -- Schedule: every 15 minutes, all day, every day
  EXEC msdb.dbo.sp_add_schedule
    @schedule_name         = N'Every 15 Minutes',
    @freq_type             = 4,    -- daily
    @freq_interval         = 1,    -- every 1 day
    @freq_subday_type      = 4,    -- minutes
    @freq_subday_interval  = 15,   -- every 15 minutes
    @active_start_time     = 000000,
    @active_end_time       = 235959;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'Wheelhouse — Purge Expired Tokens',
    @schedule_name = N'Every 15 Minutes';

  -- Target the local server
  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'Wheelhouse — Purge Expired Tokens',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''Wheelhouse — Purge Expired Tokens'' created.';
END
ELSE
BEGIN
  PRINT 'Job ''Wheelhouse — Purge Expired Tokens'' already exists — skipping.';
END
GO

-- ============================================================
-- JOB 2 — Purge Expired Snapshots (every hour)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'Wheelhouse — Purge Expired Snapshots')
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name        = N'Wheelhouse — Purge Expired Snapshots',
    @enabled         = 1,
    @description     = N'Purges dashboard_snapshots rows past their expiresAt timestamp.',
    @category_name   = N'[Uncategorized (Local)]',
    @notify_level_eventlog = 2;

  EXEC msdb.dbo.sp_add_jobstep
    @job_name        = N'Wheelhouse — Purge Expired Snapshots',
    @step_name       = N'Execute usp_PurgeExpiredSnapshots',
    @step_id         = 1,
    @subsystem       = N'TSQL',
    @command         = N'EXEC dbo.usp_PurgeExpiredSnapshots;',
    @database_name   = N'Wheelhouse',
    @on_success_action = 1,
    @on_fail_action    = 2;

  EXEC msdb.dbo.sp_add_schedule
    @schedule_name         = N'Every Hour',
    @freq_type             = 4,    -- daily
    @freq_interval         = 1,
    @freq_subday_type      = 8,    -- hours
    @freq_subday_interval  = 1,    -- every 1 hour
    @active_start_time     = 000000,
    @active_end_time       = 235959;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'Wheelhouse — Purge Expired Snapshots',
    @schedule_name = N'Every Hour';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'Wheelhouse — Purge Expired Snapshots',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''Wheelhouse — Purge Expired Snapshots'' created.';
END
ELSE
BEGIN
  PRINT 'Job ''Wheelhouse — Purge Expired Snapshots'' already exists — skipping.';
END
GO

-- ============================================================
-- JOB 3 — Purge Old Audit Logs (monthly, 365-day retention)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'Wheelhouse — Purge Old Audit Logs')
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name        = N'Wheelhouse — Purge Old Audit Logs',
    @enabled         = 1,
    @description     = N'Purges audit_logs rows older than 365 days. Runs at 02:00 UTC on the 1st of each month.',
    @category_name   = N'[Uncategorized (Local)]',
    @notify_level_eventlog = 2;

  EXEC msdb.dbo.sp_add_jobstep
    @job_name        = N'Wheelhouse — Purge Old Audit Logs',
    @step_name       = N'Execute usp_PurgeOldAuditLogs',
    @step_id         = 1,
    @subsystem       = N'TSQL',
    @command         = N'EXEC dbo.usp_PurgeOldAuditLogs @retentionDays = 365;',
    @database_name   = N'Wheelhouse',
    @on_success_action = 1,
    @on_fail_action    = 2;

  -- Schedule: monthly on the 1st at 02:00 UTC
  EXEC msdb.dbo.sp_add_schedule
    @schedule_name         = N'Monthly 1st at 0200',
    @freq_type             = 16,   -- monthly
    @freq_interval         = 1,    -- day 1 of the month
    @freq_subday_type      = 1,    -- once per day
    @freq_subday_interval  = 0,
    @active_start_time     = 020000;   -- 02:00:00

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'Wheelhouse — Purge Old Audit Logs',
    @schedule_name = N'Monthly 1st at 0200';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'Wheelhouse — Purge Old Audit Logs',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''Wheelhouse — Purge Old Audit Logs'' created.';
END
ELSE
BEGIN
  PRINT 'Job ''Wheelhouse — Purge Old Audit Logs'' already exists — skipping.';
END
GO

-- ============================================================
-- VERIFICATION — List all three Wheelhouse jobs and their schedules
-- ============================================================

SELECT
  j.name                                          AS [Job],
  j.enabled                                       AS [Enabled],
  s.name                                          AS [Schedule],
  CASE s.freq_type
    WHEN  4 THEN 'Daily'
    WHEN 16 THEN 'Monthly'
    ELSE CAST(s.freq_type AS NVARCHAR)
  END                                             AS [Frequency],
  s.freq_subday_interval                          AS [SubdayInterval],
  CASE s.freq_subday_type
    WHEN 1 THEN 'Once'
    WHEN 4 THEN 'Minutes'
    WHEN 8 THEN 'Hours'
    ELSE CAST(s.freq_subday_type AS NVARCHAR)
  END                                             AS [SubdayUnit],
  jh.run_date                                     AS [LastRunDate],
  jh.run_time                                     AS [LastRunTime],
  CASE jh.run_status
    WHEN 0 THEN 'Failed'
    WHEN 1 THEN 'Succeeded'
    WHEN 2 THEN 'Retry'
    WHEN 3 THEN 'Cancelled'
    ELSE 'Unknown'
  END                                             AS [LastRunStatus]
FROM msdb.dbo.sysjobs          j
JOIN msdb.dbo.sysjobschedules  js ON js.job_id = j.job_id
JOIN msdb.dbo.sysschedules     s  ON s.schedule_id = js.schedule_id
LEFT JOIN (
  SELECT job_id,
         MAX(instance_id) AS last_instance_id
  FROM msdb.dbo.sysjobhistory
  WHERE step_id = 0
  GROUP BY job_id
) lh ON lh.job_id = j.job_id
LEFT JOIN msdb.dbo.sysjobhistory jh
  ON jh.job_id = lh.job_id AND jh.instance_id = lh.last_instance_id
WHERE j.name LIKE N'Wheelhouse%'
ORDER BY j.name;
GO

PRINT '=== Wheelhouse Agent jobs setup complete ===';
GO

-- ============================================================
-- AZURE SQL DATABASE ALTERNATIVE
-- ============================================================
-- Azure SQL Database does not support SQL Server Agent.
-- Use one of these alternatives instead:
--
-- Option A — Azure Elastic Jobs (managed SQL Agent equivalent)
--   https://learn.microsoft.com/azure/azure-sql/database/elastic-jobs-overview
--   Create an Elastic Job agent, then schedule T-SQL steps
--   that call the same stored procedures above.
--
-- Option B — Azure Functions (Timer Trigger)
--   Create three Azure Functions with TimerTrigger bindings:
--
--   // purgeExpiredTokens/index.ts
--   import { app } from "@azure/functions";
--   import sql from "mssql";
--
--   app.timer("purgeExpiredTokens", {
--     schedule: "0 */15 * * * *",   // every 15 minutes (cron)
--     handler: async () => {
--       const pool = await sql.connect(process.env.DATABASE_URL!);
--       await pool.request().execute("dbo.usp_PurgeExpiredTokens");
--     },
--   });
--
--   // purgeOldAuditLogs/index.ts  — schedule: "0 0 2 1 * *" (monthly)
--   // purgeExpiredSnapshots/index.ts — schedule: "0 0 * * * *" (hourly)
-- ============================================================
