-- =============================================================================
-- Migration: Add ai_adoption_scores table
-- Date:      2026-04-02
-- Author:    Engineering
-- Purpose:   Stores per-employee AI tool adoption scores and dimension breakdowns
--            used by the HR → AI Adoption Rankings page.
-- Run order: After create-database.sql and migrate-20260401-*.sql
-- =============================================================================

USE ProjectManagement;
GO

-- ---------------------------------------------------------------------------
-- 1. Guard: skip if already applied
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.ai_adoption_scores', 'U') IS NOT NULL
BEGIN
  PRINT 'Migration already applied — ai_adoption_scores table exists. Skipping.';
  RETURN;
END
GO

-- ---------------------------------------------------------------------------
-- 2. Create ai_adoption_scores table
-- ---------------------------------------------------------------------------
CREATE TABLE dbo.ai_adoption_scores (
  id                  INT             NOT NULL IDENTITY(1,1),
  -- Employee identity (mirrors users table; FK added below)
  userId              INT             NULL,           -- NULL = external/non-app employee
  employeeName        NVARCHAR(200)   NOT NULL,
  department          NVARCHAR(100)   NOT NULL,
  jobTitle            NVARCHAR(200)   NOT NULL,

  -- Overall composite score (0–100)
  overallScore        TINYINT         NOT NULL CONSTRAINT CK_ai_adoption_overallScore CHECK (overallScore BETWEEN 0 AND 100),

  -- Month-over-month trend: +N = improving, -N = declining, 0 = flat
  trendDelta          SMALLINT        NOT NULL DEFAULT 0,

  -- Activity counters (rolling 30-day window)
  toolsUsed           TINYINT         NOT NULL DEFAULT 0,
  promptsPerWeek      SMALLINT        NOT NULL DEFAULT 0,
  automationsCreated  SMALLINT        NOT NULL DEFAULT 0,

  -- Dimension scores (0–100 each)
  dimToolUsage        TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimToolUsage        CHECK (dimToolUsage        BETWEEN 0 AND 100),
  dimPromptQuality    TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimPromptQuality    CHECK (dimPromptQuality    BETWEEN 0 AND 100),
  dimAutomation       TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimAutomation       CHECK (dimAutomation       BETWEEN 0 AND 100),
  dimTraining         TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimTraining         CHECK (dimTraining         BETWEEN 0 AND 100),
  dimCollaboration    TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimCollaboration    CHECK (dimCollaboration    BETWEEN 0 AND 100),
  dimInnovation       TINYINT         NOT NULL DEFAULT 0 CONSTRAINT CK_ai_dimInnovation       CHECK (dimInnovation       BETWEEN 0 AND 100),

  -- Computed tier: Pioneer ≥80, Adopter 65–79, Learner 50–64, Laggard <50
  tier                NVARCHAR(20)    NOT NULL DEFAULT 'Learner'
                      CONSTRAINT CK_ai_tier CHECK (tier IN ('Pioneer', 'Adopter', 'Learner', 'Laggard')),

  -- Timestamps
  lastActiveAt        DATETIME2(3)    NULL,
  scoreDate           DATE            NOT NULL DEFAULT CAST(GETUTCDATE() AS DATE),
  createdAt           DATETIME2(3)    NOT NULL DEFAULT SYSUTCDATETIME(),
  updatedAt           DATETIME2(3)    NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_ai_adoption_scores PRIMARY KEY CLUSTERED (id)
);
GO

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Fast lookup by department for the department-avg bar chart
CREATE NONCLUSTERED INDEX IX_ai_adoption_scores_department
  ON dbo.ai_adoption_scores (department)
  INCLUDE (overallScore, tier);
GO

-- Fast lookup by userId for per-user history
CREATE NONCLUSTERED INDEX IX_ai_adoption_scores_userId
  ON dbo.ai_adoption_scores (userId)
  WHERE userId IS NOT NULL;
GO

-- Covering index for the ranked list (sorted by score desc)
CREATE NONCLUSTERED INDEX IX_ai_adoption_scores_overallScore
  ON dbo.ai_adoption_scores (overallScore DESC)
  INCLUDE (employeeName, department, jobTitle, tier, trendDelta, lastActiveAt);
GO

-- ---------------------------------------------------------------------------
-- 4. Foreign key to users table (nullable — supports non-app employees)
-- ---------------------------------------------------------------------------
ALTER TABLE dbo.ai_adoption_scores
  ADD CONSTRAINT FK_ai_adoption_scores_userId
  FOREIGN KEY (userId) REFERENCES dbo.users (id)
  ON DELETE SET NULL;
GO

-- ---------------------------------------------------------------------------
-- 5. updatedAt trigger
-- ---------------------------------------------------------------------------
CREATE OR ALTER TRIGGER trg_ai_adoption_scores_updatedAt
ON dbo.ai_adoption_scores
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.ai_adoption_scores
  SET updatedAt = SYSUTCDATETIME()
  FROM dbo.ai_adoption_scores s
  INNER JOIN inserted i ON s.id = i.id;
END;
GO

-- ---------------------------------------------------------------------------
-- 6. Grant permissions to application login
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'pm_app')
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.ai_adoption_scores TO pm_app;
  PRINT 'Permissions granted to pm_app.';
END
ELSE
  PRINT 'pm_app login not found — run create-app-login.sql first.';
GO

-- ---------------------------------------------------------------------------
-- 7. Seed demo data (15 employees matching the frontend demo store)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.ai_adoption_scores)
BEGIN
  INSERT INTO dbo.ai_adoption_scores
    (employeeName, department, jobTitle, overallScore, trendDelta, toolsUsed, promptsPerWeek, automationsCreated,
     dimToolUsage, dimPromptQuality, dimAutomation, dimTraining, dimCollaboration, dimInnovation, tier, lastActiveAt)
  VALUES
    ('Sarah Chen',      'Development', 'Sr. Engineer',          94,  6, 12, 87, 14, 96, 92, 95, 100, 88, 93, 'Pioneer', SYSUTCDATETIME()),
    ('Marcus Williams', 'Development', 'Tech Lead',             91,  4, 11, 74, 11, 93, 90, 88,  95, 91, 89, 'Pioneer', SYSUTCDATETIME()),
    ('Priya Patel',     'QA',          'QA Lead',               88,  9, 10, 65,  9, 88, 85, 91,  90, 86, 88, 'Pioneer', DATEADD(DAY,-1,SYSUTCDATETIME())),
    ('James O''Brien',  'Sales',       'Account Executive',     85, 12,  9, 58,  6, 84, 88, 79,  85, 87, 87, 'Pioneer', SYSUTCDATETIME()),
    ('Lisa Nakamura',   'Marketing',   'Content Strategist',    83,  0, 10, 72,  5, 85, 90, 72,  80, 83, 88, 'Adopter', SYSUTCDATETIME()),
    ('David Kim',       'IT/Ops',      'DevOps Engineer',       80,  5,  8, 45, 10, 80, 74, 90,  75, 78, 83, 'Adopter', SYSUTCDATETIME()),
    ('Rachel Torres',   'CSM',         'Customer Success Mgr',  77,  8,  8, 52,  4, 78, 80, 70,  80, 82, 72, 'Adopter', DATEADD(DAY,-1,SYSUTCDATETIME())),
    ('Tom Bradley',     'Development', 'Backend Engineer',      74, -3,  7, 38,  5, 74, 72, 76,  70, 73, 79, 'Adopter', DATEADD(DAY,-3,SYSUTCDATETIME())),
    ('Angela Foster',   'Sales',       'Sales Manager',         68,  7,  7, 33,  3, 68, 72, 60,  65, 74, 69, 'Learner', SYSUTCDATETIME()),
    ('Chris Nguyen',    'QA',          'QA Engineer',           65,  1,  6, 28,  3, 65, 63, 67,  60, 68, 67, 'Learner', DATEADD(DAY,-2,SYSUTCDATETIME())),
    ('Nina Okafor',     'Marketing',   'Brand Manager',         61,  4,  6, 22,  2, 62, 65, 55,  55, 66, 63, 'Learner', SYSUTCDATETIME()),
    ('Robert Haines',   'IT/Ops',      'Sys Admin',             55, -5,  5, 14,  2, 55, 52, 58,  50, 57, 58, 'Learner', DATEADD(DAY,-7,SYSUTCDATETIME())),
    ('Karen Simmons',   'CSM',         'Support Specialist',    42, -8,  3,  8,  0, 42, 40, 35,  35, 50, 50, 'Laggard', DATEADD(DAY,-14,SYSUTCDATETIME())),
    ('Frank Deluca',    'Sales',       'Sales Rep',             38, -1,  3,  6,  0, 38, 36, 32,  30, 44, 48, 'Laggard', DATEADD(DAY,-10,SYSUTCDATETIME())),
    ('Michelle Park',   'Development', 'Jr. Engineer',          35,  3,  4, 12,  1, 36, 34, 30,  40, 38, 32, 'Laggard', DATEADD(DAY,-3,SYSUTCDATETIME()));

  PRINT 'Seeded 15 demo AI adoption score rows.';
END
ELSE
  PRINT 'ai_adoption_scores already has data — seed skipped.';
GO

-- ---------------------------------------------------------------------------
-- 8. Verification
-- ---------------------------------------------------------------------------
SELECT
  tier,
  COUNT(*)                                AS employees,
  AVG(CAST(overallScore AS FLOAT))        AS avgScore,
  MIN(overallScore)                       AS minScore,
  MAX(overallScore)                       AS maxScore
FROM dbo.ai_adoption_scores
GROUP BY tier
ORDER BY avgScore DESC;
GO

PRINT 'Migration migrate-20260402-add-ai-adoption-scores-table.sql completed successfully.';
GO
