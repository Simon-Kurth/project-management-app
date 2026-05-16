-- ============================================================
-- Project Management App
-- SQL Server Agent — Purge Maintenance Jobs + Email Alerts
-- ============================================================
--
-- PURPOSE
--   1. Configures Database Mail with an SMTP profile.
--   2. Creates a DBA operator to receive failure notifications.
--   3. Creates three SQL Server Agent jobs that automatically
--      call the maintenance stored procedures on a schedule,
--      each configured to email the DBA operator on failure.
--
--   Job 1: ProjectManagement — Purge Expired Tokens
--     Calls dbo.usp_PurgeExpiredTokens every 15 minutes.
--
--   Job 2: ProjectManagement — Purge Expired Snapshots
--     Calls dbo.usp_PurgeExpiredSnapshots every hour.
--
--   Job 3: ProjectManagement — Purge Old Audit Logs
--     Calls dbo.usp_PurgeOldAuditLogs (365-day retention)
--     at 02:00 UTC on the 1st of each month.
--
-- PREREQUISITES
--   SQL Server Agent must be running.
--   Project Management App database and stored procedures must exist
--   (run create-database.sql first).
--   The login executing this script must be sysadmin or hold
--   SQLAgentOperatorRole in msdb.
--   For Database Mail: the SQL Server service account must be
--   able to reach the SMTP relay on port 587 (or 25).
--
-- COMPATIBILITY
--   SQL Server 2019+ (on-premises)
--   Azure SQL Managed Instance (Agent + Database Mail supported)
--   Azure SQL Database — SQL Agent is NOT available; see the
--   Azure alternative block at the end of this script.
--
-- EXECUTION
--   Replace the four placeholder values below, then run:
--   sqlcmd -S <server> -U sa -P <password> -d msdb
--          -v SMTP_SERVER="smtp.office365.com"
--          -v SMTP_FROM="pm-alerts@company.com"
--          -v SMTP_USERNAME="pm-alerts@company.com"
--          -v SMTP_PASSWORD="<app-password-from-key-vault>"
--          -v DBA_EMAIL="dba-team@company.com"
--          -i sql/maint-purge-agent-job.sql
-- ============================================================

USE msdb;
GO

-- ============================================================
-- SECTION 1 — DATABASE MAIL CONFIGURATION
-- ============================================================
-- Enables Database Mail and creates a named SMTP account and
-- profile used by all Agent job failure notifications.
-- ============================================================

-- Enable Database Mail XPs if not already enabled
IF NOT EXISTS (
  SELECT 1 FROM sys.configurations
  WHERE name = N'Database Mail XPs' AND value_in_use = 1
)
BEGIN
  EXEC sp_configure 'show advanced options', 1;
  RECONFIGURE;
  EXEC sp_configure 'Database Mail XPs', 1;
  RECONFIGURE;
  PRINT 'Database Mail XPs enabled.';
END
GO

-- Create the mail account (idempotent)
IF NOT EXISTS (
  SELECT 1 FROM msdb.dbo.sysmail_account
  WHERE name = N'ProjectManagement SMTP Account'
)
BEGIN
  EXEC msdb.dbo.sysmail_add_account_sp
    @account_name            = N'ProjectManagement SMTP Account',
    @description             = N'SMTP account for ProjectManagement Agent job alerts',
    -- Replace with your SMTP relay (Office 365, SendGrid, on-prem Exchange, etc.)
    @email_address           = N'$(SMTP_FROM)',
    @display_name            = N'ProjectManagement Alerts',
    @replyto_address         = N'$(SMTP_FROM)',
    @mailserver_name         = N'$(SMTP_SERVER)',
    @port                    = 587,
    @enable_ssl              = 1,
    @username                = N'$(SMTP_USERNAME)',
    @password                = N'$(SMTP_PASSWORD)';
  PRINT 'Database Mail account ''ProjectManagement SMTP Account'' created.';
END
ELSE
BEGIN
  PRINT 'Database Mail account already exists — skipping.';
END
GO

-- Create the mail profile (idempotent)
IF NOT EXISTS (
  SELECT 1 FROM msdb.dbo.sysmail_profile
  WHERE name = N'ProjectManagement Alerts Profile'
)
BEGIN
  EXEC msdb.dbo.sysmail_add_profile_sp
    @profile_name = N'ProjectManagement Alerts Profile',
    @description  = N'Default profile for ProjectManagement Agent job failure alerts';

  EXEC msdb.dbo.sysmail_add_profileaccount_sp
    @profile_name   = N'ProjectManagement Alerts Profile',
    @account_name   = N'ProjectManagement SMTP Account',
    @sequence_number = 1;

  -- Make this the default public profile so Agent can use it
  EXEC msdb.dbo.sysmail_add_principalprofile_sp
    @profile_name   = N'ProjectManagement Alerts Profile',
    @principal_name = N'public',
    @is_default     = 1;

  PRINT 'Database Mail profile ''ProjectManagement Alerts Profile'' created.';
END
ELSE
BEGIN
  PRINT 'Database Mail profile already exists — skipping.';
END
GO

-- ============================================================
-- SECTION 2 — DBA OPERATOR
-- ============================================================
-- Creates a named operator that receives email on job failure.
-- Replace $(DBA_EMAIL) with your team's distribution list or
-- on-call email address.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysoperators WHERE name = N'ProjectManagement DBA')
BEGIN
  EXEC msdb.dbo.sp_add_operator
    @name                         = N'ProjectManagement DBA',
    @enabled                      = 1,
    @email_address                = N'$(DBA_EMAIL)',
    @weekday_pager_start_time     = 090000,
    @weekday_pager_end_time       = 180000,
    @saturday_pager_start_time    = 090000,
    @saturday_pager_end_time      = 120000,
    @pager_days                   = 62;    -- Mon–Sat
  PRINT 'Operator ''ProjectManagement DBA'' created with email $(DBA_EMAIL).';
END
ELSE
BEGIN
  PRINT 'Operator ''ProjectManagement DBA'' already exists — skipping.';
END
GO

-- ============================================================
-- SECTION 3 — JOB 1: Purge Expired Tokens (every 15 minutes)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'ProjectManagement — Purge Expired Tokens')
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name                = N'ProjectManagement — Purge Expired Tokens',
    @enabled                 = 1,
    @description             = N'Purges expired rows from refresh_tokens, duo_state_store, and pending_auth_store.',
    @category_name           = N'[Uncategorized (Local)]',
    @notify_level_eventlog   = 2,   -- log on failure
    @notify_level_email      = 2,   -- email on failure
    @notify_email_operator_name = N'ProjectManagement DBA';

  EXEC msdb.dbo.sp_add_jobstep
    @job_name          = N'ProjectManagement — Purge Expired Tokens',
    @step_name         = N'Execute usp_PurgeExpiredTokens',
    @step_id           = 1,
    @subsystem         = N'TSQL',
    @command           = N'EXEC dbo.usp_PurgeExpiredTokens;',
    @database_name     = N'ProjectManagement',
    @on_success_action = 1,
    @on_fail_action    = 2;

  EXEC msdb.dbo.sp_add_schedule
    @schedule_name        = N'Every 15 Minutes',
    @freq_type            = 4,
    @freq_interval        = 1,
    @freq_subday_type     = 4,
    @freq_subday_interval = 15,
    @active_start_time    = 000000,
    @active_end_time      = 235959;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'ProjectManagement — Purge Expired Tokens',
    @schedule_name = N'Every 15 Minutes';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'ProjectManagement — Purge Expired Tokens',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''ProjectManagement — Purge Expired Tokens'' created.';
END
ELSE
BEGIN
  -- If the job already exists, ensure the email alert is wired up
  EXEC msdb.dbo.sp_update_job
    @job_name                    = N'ProjectManagement — Purge Expired Tokens',
    @notify_level_email          = 2,
    @notify_email_operator_name  = N'ProjectManagement DBA';
  PRINT 'Job ''ProjectManagement — Purge Expired Tokens'' updated with email alert.';
END
GO

-- ============================================================
-- SECTION 4 — JOB 2: Purge Expired Snapshots (every hour)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'ProjectManagement — Purge Expired Snapshots')
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name                = N'ProjectManagement — Purge Expired Snapshots',
    @enabled                 = 1,
    @description             = N'Purges dashboard_snapshots rows past their expiresAt timestamp.',
    @category_name           = N'[Uncategorized (Local)]',
    @notify_level_eventlog   = 2,
    @notify_level_email      = 2,
    @notify_email_operator_name = N'ProjectManagement DBA';

  EXEC msdb.dbo.sp_add_jobstep
    @job_name          = N'ProjectManagement — Purge Expired Snapshots',
    @step_name         = N'Execute usp_PurgeExpiredSnapshots',
    @step_id           = 1,
    @subsystem         = N'TSQL',
    @command           = N'EXEC dbo.usp_PurgeExpiredSnapshots;',
    @database_name     = N'ProjectManagement',
    @on_success_action = 1,
    @on_fail_action    = 2;

  EXEC msdb.dbo.sp_add_schedule
    @schedule_name        = N'Every Hour',
    @freq_type            = 4,
    @freq_interval        = 1,
    @freq_subday_type     = 8,
    @freq_subday_interval = 1,
    @active_start_time    = 000000,
    @active_end_time      = 235959;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'ProjectManagement — Purge Expired Snapshots',
    @schedule_name = N'Every Hour';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'ProjectManagement — Purge Expired Snapshots',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''ProjectManagement — Purge Expired Snapshots'' created.';
END
ELSE
BEGIN
  EXEC msdb.dbo.sp_update_job
    @job_name                    = N'ProjectManagement — Purge Expired Snapshots',
    @notify_level_email          = 2,
    @notify_email_operator_name  = N'ProjectManagement DBA';
  PRINT 'Job ''ProjectManagement — Purge Expired Snapshots'' updated with email alert.';
END
GO

-- ============================================================
-- SECTION 5 — JOB 3: Purge Old Audit Logs (monthly)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'ProjectManagement — Purge Old Audit Logs')
BEGIN
  EXEC msdb.dbo.sp_add_job
    @job_name                = N'ProjectManagement — Purge Old Audit Logs',
    @enabled                 = 1,
    @description             = N'Purges audit_logs rows older than 365 days. Runs at 02:00 UTC on the 1st of each month.',
    @category_name           = N'[Uncategorized (Local)]',
    @notify_level_eventlog   = 2,
    @notify_level_email      = 2,
    @notify_email_operator_name = N'ProjectManagement DBA';

  EXEC msdb.dbo.sp_add_jobstep
    @job_name          = N'ProjectManagement — Purge Old Audit Logs',
    @step_name         = N'Execute usp_PurgeOldAuditLogs',
    @step_id           = 1,
    @subsystem         = N'TSQL',
    @command           = N'EXEC dbo.usp_PurgeOldAuditLogs @retentionDays = 365;',
    @database_name     = N'ProjectManagement',
    @on_success_action = 1,
    @on_fail_action    = 2;

  EXEC msdb.dbo.sp_add_schedule
    @schedule_name        = N'Monthly 1st at 0200',
    @freq_type            = 16,
    @freq_interval        = 1,
    @freq_subday_type     = 1,
    @freq_subday_interval = 0,
    @active_start_time    = 020000;

  EXEC msdb.dbo.sp_attach_schedule
    @job_name      = N'ProjectManagement — Purge Old Audit Logs',
    @schedule_name = N'Monthly 1st at 0200';

  EXEC msdb.dbo.sp_add_jobserver
    @job_name    = N'ProjectManagement — Purge Old Audit Logs',
    @server_name = N'(LOCAL)';

  PRINT 'Job ''ProjectManagement — Purge Old Audit Logs'' created.';
END
ELSE
BEGIN
  EXEC msdb.dbo.sp_update_job
    @job_name                    = N'ProjectManagement — Purge Old Audit Logs',
    @notify_level_email          = 2,
    @notify_email_operator_name  = N'ProjectManagement DBA';
  PRINT 'Job ''ProjectManagement — Purge Old Audit Logs'' updated with email alert.';
END
GO

-- ============================================================
-- SECTION 6 — TEST DATABASE MAIL
-- ============================================================
-- Sends a test email to confirm Database Mail is working.
-- Comment this out after confirming delivery.
-- ============================================================

EXEC msdb.dbo.sp_send_dbmail
  @profile_name  = N'ProjectManagement Alerts Profile',
  @recipients    = N'$(DBA_EMAIL)',
  @subject       = N'[ProjectManagement] Database Mail test — setup complete',
  @body          = N'Database Mail is configured and SQL Server Agent jobs are active. This is a test message sent during initial setup.';
GO

PRINT 'Test email queued. Check msdb.dbo.sysmail_log for delivery status.';
GO

-- ============================================================
-- SECTION 7 — VERIFICATION
-- ============================================================

-- List all three ProjectManagement jobs with schedule and last run status
SELECT
  j.name                                          AS [Job],
  j.enabled                                       AS [Enabled],
  op.name                                         AS [NotifyOperator],
  op.email_address                                AS [OperatorEmail],
  s.name                                          AS [Schedule],
  CASE s.freq_subday_type
    WHEN 1 THEN 'Once'
    WHEN 4 THEN CONCAT('Every ', s.freq_subday_interval, ' min')
    WHEN 8 THEN CONCAT('Every ', s.freq_subday_interval, ' hr')
    ELSE 'Monthly'
  END                                             AS [Frequency],
  CASE jh.run_status
    WHEN 0 THEN 'Failed'
    WHEN 1 THEN 'Succeeded'
    WHEN 2 THEN 'Retry'
    WHEN 3 THEN 'Cancelled'
    ELSE 'Never run'
  END                                             AS [LastRunStatus]
FROM msdb.dbo.sysjobs          j
JOIN msdb.dbo.sysjobschedules  js ON js.job_id = j.job_id
JOIN msdb.dbo.sysschedules     s  ON s.schedule_id = js.schedule_id
LEFT JOIN msdb.dbo.sysoperators op ON op.name = j.notify_email_operator_name
LEFT JOIN (
  SELECT job_id, MAX(instance_id) AS last_id
  FROM msdb.dbo.sysjobhistory WHERE step_id = 0
  GROUP BY job_id
) lh ON lh.job_id = j.job_id
LEFT JOIN msdb.dbo.sysjobhistory jh
  ON jh.job_id = lh.job_id AND jh.instance_id = lh.last_id
WHERE j.name LIKE N'ProjectManagement%'
ORDER BY j.name;
GO

-- Check Database Mail queue status
SELECT TOP 10
  sent_date,
  recipients,
  subject,
  sent_status
FROM msdb.dbo.sysmail_sentitems
ORDER BY sent_date DESC;
GO

PRINT '=== ProjectManagement Agent jobs + email alerts setup complete ===';
GO

-- ============================================================
-- AZURE SQL DATABASE ALTERNATIVE
-- ============================================================
-- Azure SQL Database does not support SQL Server Agent or
-- Database Mail.  Use these alternatives instead:
--
-- Option A — Azure Elastic Jobs + SendGrid / Logic Apps
--   Create an Elastic Job agent to run the T-SQL procedures.
--   Wire failure notifications via Azure Monitor Alerts →
--   Action Group → Email/SMS/Push/Voice.
--
-- Option B — Azure Functions (Timer Trigger + SendGrid)
--
--   // purgeExpiredTokens/index.ts
--   import { app } from "@azure/functions";
--   import sql from "mssql";
--   import sgMail from "@sendgrid/mail";
--
--   app.timer("purgeExpiredTokens", {
--     schedule: "0 */15 * * * *",
--     handler: async () => {
--       try {
--         const pool = await sql.connect(process.env.DATABASE_URL!);
--         await pool.request().execute("dbo.usp_PurgeExpiredTokens");
--       } catch (err) {
--         sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
--         await sgMail.send({
--           to: process.env.DBA_EMAIL!,
--           from: process.env.ALERT_FROM_EMAIL!,
--           subject: "[ProjectManagement] Purge Expired Tokens FAILED",
--           text: String(err),
--         });
--         throw err;
--       }
--     },
--   });
--
-- Option C — Azure Monitor Alert Rule
--   In the Azure Portal, create an alert rule on the Function App
--   resource targeting the "Exceptions" metric, and route it to
--   an Action Group that sends email to the DBA distribution list.
--   This requires no code changes and catches all unhandled errors.
-- ============================================================
