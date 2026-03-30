/**
 * server/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Database query helpers for Microsoft SQL Server.
 * Uses the `mssql` (tedious) driver via the connection pool in server/sqlserver.ts.
 *
 * All helpers return plain objects / arrays — no ORM abstractions.
 * Dates are stored as DATETIME2 and returned as JavaScript Date objects.
 * JSON columns are stored as NVARCHAR(MAX) and serialised/deserialised here.
 */

import sql from "mssql";
import { execute, insertGetId, query, getPool } from "./sqlserver";
import type { ComputedDeliveryKPIs } from "./connectors/jira";
import { ENV } from "./_core/env";

// ─── Types (mirror the schema) ────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "executive" | "company" | "qa" | "sales_marketing" | "csm";

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  passwordHash: string | null;
  role: UserRole;
  loginMethod: string | null;
  isActive: boolean;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  entraOid: string | null;
  entraUpn: string | null;
  entraTenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface InsertUser {
  openId: string;
  name?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  role?: UserRole;
  loginMethod?: string | null;
  isActive?: boolean;
  mfaSecret?: string | null;
  mfaEnabled?: boolean;
  mfaVerified?: boolean;
  entraOid?: string | null;
  entraUpn?: string | null;
  entraTenantId?: string | null;
  lastSignedIn?: Date;
}

// Keep getDb for backward compat with tests that check for a truthy db
export async function getDb() {
  return getPool();
}

// ─── User Helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const pool = await getPool();
  if (!pool) return;

  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : undefined);
  const lastSignedIn = user.lastSignedIn ?? new Date();

  // MERGE (upsert) on openId
  await execute(
    `MERGE users AS target
     USING (SELECT @openId AS openId) AS source ON target.openId = source.openId
     WHEN MATCHED THEN UPDATE SET
       name         = COALESCE(@name, target.name),
       email        = COALESCE(@email, target.email),
       loginMethod  = COALESCE(@loginMethod, target.loginMethod),
       lastSignedIn = @lastSignedIn
       ${role ? ", role = @role" : ""}
     WHEN NOT MATCHED THEN INSERT
       (openId, name, email, loginMethod, role, isActive, lastSignedIn)
     VALUES
       (@openId, @name, @email, @loginMethod, @role2, 1, @lastSignedIn);`,
    {
      openId:      { type: sql.NVarChar(255),  value: user.openId },
      name:        { type: sql.NVarChar(255),  value: user.name ?? null },
      email:       { type: sql.NVarChar(320),  value: user.email ?? null },
      loginMethod: { type: sql.NVarChar(50),   value: user.loginMethod ?? null },
      lastSignedIn:{ type: sql.DateTime2,      value: lastSignedIn },
      role:        { type: sql.NVarChar(50),   value: role ?? "user" },
      role2:       { type: sql.NVarChar(50),   value: role ?? "user" },
    },
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const rows = await query<User>(
    "SELECT TOP 1 * FROM users WHERE openId = @openId",
    { openId: { type: sql.NVarChar(255), value: openId } },
  );
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await query<User>(
    "SELECT TOP 1 * FROM users WHERE email = @email",
    { email: { type: sql.NVarChar(320), value: email.toLowerCase() } },
  );
  return rows[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const rows = await query<User>(
    "SELECT TOP 1 * FROM users WHERE id = @id",
    { id: { type: sql.Int, value: id } },
  );
  return rows[0];
}

export async function updateUserMfa(
  userId: number,
  data: { mfaSecret?: string; mfaEnabled?: boolean; mfaVerified?: boolean }
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, { type: sql.ISqlTypeFactory | sql.ISqlType; value: unknown }> = {
    userId: { type: sql.Int, value: userId },
  };
  if (data.mfaSecret !== undefined) {
    setClauses.push("mfaSecret = @mfaSecret");
    params.mfaSecret = { type: sql.NVarChar(255), value: data.mfaSecret };
  }
  if (data.mfaEnabled !== undefined) {
    setClauses.push("mfaEnabled = @mfaEnabled");
    params.mfaEnabled = { type: sql.Bit, value: data.mfaEnabled ? 1 : 0 };
  }
  if (data.mfaVerified !== undefined) {
    setClauses.push("mfaVerified = @mfaVerified");
    params.mfaVerified = { type: sql.Bit, value: data.mfaVerified ? 1 : 0 };
  }
  if (setClauses.length === 0) return;
  await execute(
    `UPDATE users SET ${setClauses.join(", ")} WHERE id = @userId`,
    params,
  );
}

export async function createDemoUser(data: {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
}): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const openId = `demo_${data.role}_${Date.now()}`;
  await execute(
    `MERGE users AS target
     USING (SELECT @email AS email) AS source ON target.email = source.email
     WHEN MATCHED THEN UPDATE SET
       passwordHash = @passwordHash, name = @name, role = @role
     WHEN NOT MATCHED THEN INSERT
       (openId, email, passwordHash, name, role, loginMethod, isActive, lastSignedIn)
     VALUES
       (@openId, @email, @passwordHash, @name, @role, 'password', 1, GETUTCDATE());`,
    {
      openId:       { type: sql.NVarChar(255), value: openId },
      email:        { type: sql.NVarChar(320), value: data.email },
      passwordHash: { type: sql.NVarChar(255), value: data.passwordHash },
      name:         { type: sql.NVarChar(255), value: data.name },
      role:         { type: sql.NVarChar(50),  value: data.role },
    },
  );
}

// ─── Refresh Token Helpers ────────────────────────────────────────────────────

export async function saveRefreshToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  await execute(
    "INSERT INTO refresh_tokens (userId, tokenHash, expiresAt) VALUES (@userId, @tokenHash, @expiresAt)",
    {
      userId:    { type: sql.Int,          value: userId },
      tokenHash: { type: sql.NVarChar(255), value: tokenHash },
      expiresAt: { type: sql.DateTime2,    value: expiresAt },
    },
  );
}

export async function getRefreshToken(tokenHash: string) {
  const rows = await query<{ id: number; userId: number; tokenHash: string; expiresAt: Date; revoked: boolean; createdAt: Date }>(
    "SELECT TOP 1 * FROM refresh_tokens WHERE tokenHash = @tokenHash AND revoked = 0",
    { tokenHash: { type: sql.NVarChar(255), value: tokenHash } },
  );
  return rows[0];
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await execute(
    "UPDATE refresh_tokens SET revoked = 1 WHERE tokenHash = @tokenHash",
    { tokenHash: { type: sql.NVarChar(255), value: tokenHash } },
  );
}

// ─── Audit Log Helpers ────────────────────────────────────────────────────────

export async function writeAuditLog(entry: {
  userId?: number;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs
         (userId, userEmail, action, resource, resourceId, ipAddress, userAgent, metadata)
       VALUES
         (@userId, @userEmail, @action, @resource, @resourceId, @ipAddress, @userAgent, @metadata)`,
      {
        userId:     { type: sql.Int,           value: entry.userId ?? null },
        userEmail:  { type: sql.NVarChar(320), value: entry.userEmail ?? null },
        action:     { type: sql.NVarChar(100), value: entry.action },
        resource:   { type: sql.NVarChar(255), value: entry.resource },
        resourceId: { type: sql.NVarChar(255), value: entry.resourceId ?? null },
        ipAddress:  { type: sql.NVarChar(45),  value: entry.ipAddress ?? null },
        userAgent:  { type: sql.NVarChar(sql.MAX), value: entry.userAgent ?? null },
        metadata:   { type: sql.NVarChar(sql.MAX), value: entry.metadata ? JSON.stringify(entry.metadata) : null },
      },
    );
  } catch (e) {
    console.error("[AuditLog] Failed to write:", e);
  }
}

export async function getAuditLogs(limit = 100) {
  return query<{ id: number; userId: number | null; userEmail: string | null; action: string; resource: string; resourceId: string | null; ipAddress: string | null; userAgent: string | null; metadata: string | null; createdAt: Date }>(
    `SELECT TOP (@limit) * FROM audit_logs ORDER BY createdAt DESC`,
    { limit: { type: sql.Int, value: limit } },
  );
}

// ─── Connector Config Helpers ─────────────────────────────────────────────────

export async function getConnectorConfigs() {
  return query<{ id: number; name: string; connectorType: string; config: string; isActive: boolean; lastSync: Date | null; createdAt: Date; updatedAt: Date }>(
    "SELECT * FROM connector_configs",
  );
}

// ─── Computed KPI Helpers (Jira pipeline) ─────────────────────────────────────

export async function upsertComputedKPIs(entry: {
  boardId: string;
  kpiType: string;
  data: ComputedDeliveryKPIs;
}): Promise<void> {
  const dataJson = JSON.stringify(entry.data);
  const computedAt = new Date(entry.data.computedAt);
  await execute(
    `MERGE computed_kpis AS target
     USING (SELECT @boardId AS boardId, @kpiType AS kpiType) AS source
       ON target.boardId = source.boardId AND target.kpiType = source.kpiType
     WHEN MATCHED THEN UPDATE SET
       data = @data, computedAt = @computedAt, updatedAt = GETUTCDATE()
     WHEN NOT MATCHED THEN INSERT
       (boardId, kpiType, data, source, computedAt, createdAt, updatedAt)
     VALUES
       (@boardId, @kpiType, @data, 'jira', @computedAt, GETUTCDATE(), GETUTCDATE());`,
    {
      boardId:    { type: sql.NVarChar(64),       value: entry.boardId },
      kpiType:    { type: sql.NVarChar(64),       value: entry.kpiType },
      data:       { type: sql.NVarChar(sql.MAX),  value: dataJson },
      computedAt: { type: sql.DateTime2,          value: computedAt },
    },
  );
}

export async function getLatestComputedKPIs(
  boardId: string,
  kpiType: string
): Promise<ComputedDeliveryKPIs | null> {
  const rows = await query<{ data: string }>(
    `SELECT TOP 1 data FROM computed_kpis
     WHERE boardId = @boardId AND kpiType = @kpiType
     ORDER BY computedAt DESC`,
    {
      boardId: { type: sql.NVarChar(64), value: boardId },
      kpiType: { type: sql.NVarChar(64), value: kpiType },
    },
  );
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].data) as ComputedDeliveryKPIs;
  } catch {
    return null;
  }
}

export async function seedConnectors(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const stubs = [
    { name: "jira",             connectorType: "jira_rest",       config: { base_url: "", project_key: "", api_token: "" } },
    { name: "github",           connectorType: "github_rest",     config: { org: "", repo: "", token: "" } },
    { name: "salesforce",       connectorType: "salesforce_rest", config: { instance_url: "", client_id: "", client_secret: "" } },
    { name: "csv_upload",       connectorType: "file_upload",     config: { allowed_types: ["csv", "json"], max_size_mb: 10 } },
    { name: "google_analytics", connectorType: "ga4_rest",        config: { property_id: "", credentials_json: "" } },
  ];
  for (const stub of stubs) {
    await execute(
      `MERGE connector_configs AS target
       USING (SELECT @name AS name) AS source ON target.name = source.name
       WHEN MATCHED THEN UPDATE SET connectorType = @connectorType
       WHEN NOT MATCHED THEN INSERT (name, connectorType, config, isActive)
       VALUES (@name, @connectorType, @config, 0);`,
      {
        name:          { type: sql.NVarChar(100),      value: stub.name },
        connectorType: { type: sql.NVarChar(50),       value: stub.connectorType },
        config:        { type: sql.NVarChar(sql.MAX),  value: JSON.stringify(stub.config) },
      },
    );
  }
}

// ─── User Management Helpers (Executive-only) ────────────────────────────────

export async function listAllUsers(): Promise<User[]> {
  return query<User>(
    `SELECT id, openId, name, email, passwordHash, role, loginMethod,
            isActive, mfaSecret, mfaEnabled, mfaVerified,
            entraOid, entraUpn, entraTenantId,
            createdAt, updatedAt, lastSignedIn
     FROM users
     ORDER BY lastSignedIn DESC`,
    {},
  );
}

export async function updateUserRole(
  targetUserId: number,
  newRole: UserRole | "user"
): Promise<void> {
  await execute(
    "UPDATE users SET role = @role WHERE id = @id",
    {
      role: { type: sql.NVarChar(50), value: newRole },
      id:   { type: sql.Int,          value: targetUserId },
    },
  );
}

export async function toggleUserActive(targetUserId: number, isActive: boolean): Promise<void> {
  await execute(
    "UPDATE users SET isActive = @isActive WHERE id = @id",
    {
      isActive: { type: sql.Bit, value: isActive ? 1 : 0 },
      id:       { type: sql.Int, value: targetUserId },
    },
  );
}

export async function getAuditLogsForUser(userId: number, limit = 20) {
  return query<{ id: number; userId: number | null; userEmail: string | null; action: string; resource: string; resourceId: string | null; ipAddress: string | null; userAgent: string | null; metadata: string | null; createdAt: Date }>(
    `SELECT TOP (@limit) * FROM audit_logs WHERE userId = @userId ORDER BY createdAt DESC`,
    {
      limit:  { type: sql.Int, value: limit },
      userId: { type: sql.Int, value: userId },
    },
  );
}

// ─── Entra ID User Helpers ────────────────────────────────────────────────────

export async function getUserByEntraOid(entraOid: string): Promise<User | undefined> {
  const rows = await query<User>(
    "SELECT TOP 1 * FROM users WHERE entraOid = @entraOid",
    { entraOid: { type: sql.NVarChar(128), value: entraOid } },
  );
  return rows[0];
}

export async function upsertEntraUser(params: {
  entraOid: string;
  entraUpn: string;
  entraTenantId: string;
  name: string;
  email: string;
  role: string;
}): Promise<{ id: number; openId: string; role: string; name: string | null; email: string | null; isActive: boolean }> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not available");

  const openId = `entra_${params.entraOid}`;

  await execute(
    `MERGE users AS target
     USING (SELECT @openId AS openId) AS source ON target.openId = source.openId
     WHEN MATCHED THEN UPDATE SET
       entraUpn      = @entraUpn,
       name          = @name,
       email         = @email,
       loginMethod   = 'entra',
       lastSignedIn  = GETUTCDATE()
     WHEN NOT MATCHED THEN INSERT
       (openId, entraOid, entraUpn, entraTenantId, name, email, role, loginMethod, isActive, lastSignedIn)
     VALUES
       (@openId, @entraOid, @entraUpn, @entraTenantId, @name, @email, @role, 'entra', 1, GETUTCDATE());`,
    {
      openId:        { type: sql.NVarChar(255), value: openId },
      entraOid:      { type: sql.NVarChar(128), value: params.entraOid },
      entraUpn:      { type: sql.NVarChar(320), value: params.entraUpn },
      entraTenantId: { type: sql.NVarChar(128), value: params.entraTenantId },
      name:          { type: sql.NVarChar(255), value: params.name },
      email:         { type: sql.NVarChar(320), value: params.email.toLowerCase() },
      role:          { type: sql.NVarChar(50),  value: params.role },
    },
  );

  const rows = await query<{ id: number; openId: string; role: string; name: string | null; email: string | null; isActive: boolean }>(
    "SELECT TOP 1 id, openId, role, name, email, isActive FROM users WHERE openId = @openId",
    { openId: { type: sql.NVarChar(255), value: openId } },
  );
  if (!rows[0]) throw new Error("Failed to upsert Entra user");
  return rows[0];
}

// ─── Pending Auth Store Helpers ───────────────────────────────────────────────

export async function createPendingAuth(params: {
  token: string;
  userId: number;
  username: string;
  expiresAt: Date;
}): Promise<void> {
  await execute(
    "INSERT INTO pending_auth_store (token, userId, username, expiresAt) VALUES (@token, @userId, @username, @expiresAt)",
    {
      token:     { type: sql.NVarChar(128), value: params.token },
      userId:    { type: sql.Int,           value: params.userId },
      username:  { type: sql.NVarChar(320), value: params.username },
      expiresAt: { type: sql.DateTime2,     value: params.expiresAt },
    },
  );
}

export async function consumePendingAuth(token: string): Promise<{ userId: number; username: string } | null> {
  const rows = await query<{ id: number; userId: number; username: string; expiresAt: Date; used: boolean }>(
    "SELECT TOP 1 id, userId, username, expiresAt, used FROM pending_auth_store WHERE token = @token AND used = 0",
    { token: { type: sql.NVarChar(128), value: token } },
  );
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < new Date()) return null;

  await execute(
    "UPDATE pending_auth_store SET used = 1 WHERE id = @id",
    { id: { type: sql.Int, value: row.id } },
  );
  return { userId: row.userId, username: row.username };
}

// ─── Notification Helpers ─────────────────────────────────────────────────────

export type NotificationSeverity = "info" | "warning" | "error" | "success";

export interface Notification {
  id: number;
  userId: number;
  title: string;
  body: string;
  severity: NotificationSeverity;
  actionUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  source: string;
  createdAt: Date;
}

export interface CreateNotificationParams {
  userId: number;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  actionUrl?: string | null;
  source?: string;
}

/** Insert a new notification row. Returns the new row id. */
export async function createNotification(params: CreateNotificationParams): Promise<number> {
  const pool = await getPool();
  if (!pool) return -1;
  const id = await insertGetId(
    `INSERT INTO notifications (userId, title, body, severity, actionUrl, source)
     OUTPUT INSERTED.id
     VALUES (@userId, @title, @body, @severity, @actionUrl, @source)`,
    {
      userId:    { type: sql.Int,               value: params.userId },
      title:     { type: sql.NVarChar(255),     value: params.title },
      body:      { type: sql.NVarChar(sql.MAX), value: params.body },
      severity:  { type: sql.NVarChar(20),      value: params.severity ?? "info" },
      actionUrl: { type: sql.NVarChar(1024),    value: params.actionUrl ?? null },
      source:    { type: sql.NVarChar(100),     value: params.source ?? "system" },
    },
  );
  return id ?? -1;
}

/** Fetch the most recent notifications for a user (newest first). */
export async function getNotifications(
  userId: number,
  limit = 50,
  onlyUnread = false,
): Promise<Notification[]> {
  const filter = onlyUnread ? "AND isRead = 0" : "";
  return query<Notification>(
    `SELECT TOP (@limit) id, userId, title, body, severity, actionUrl,
            isRead, readAt, source, createdAt
     FROM notifications
     WHERE userId = @userId ${filter}
     ORDER BY createdAt DESC`,
    {
      limit:  { type: sql.Int, value: limit },
      userId: { type: sql.Int, value: userId },
    },
  );
}

/** Count unread notifications for a user. */
export async function getUnreadCount(userId: number): Promise<number> {
  const rows = await query<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM notifications WHERE userId = @userId AND isRead = 0",
    { userId: { type: sql.Int, value: userId } },
  );
  return rows[0]?.cnt ?? 0;
}

/** Mark a single notification as read. */
export async function markNotificationRead(id: number, userId: number): Promise<void> {
  await execute(
    `UPDATE notifications
     SET isRead = 1, readAt = GETUTCDATE()
     WHERE id = @id AND userId = @userId AND isRead = 0`,
    {
      id:     { type: sql.Int, value: id },
      userId: { type: sql.Int, value: userId },
    },
  );
}

/** Mark all unread notifications for a user as read. */
export async function markAllNotificationsRead(userId: number): Promise<void> {
  await execute(
    `UPDATE notifications
     SET isRead = 1, readAt = GETUTCDATE()
     WHERE userId = @userId AND isRead = 0`,
    { userId: { type: sql.Int, value: userId } },
  );
}

// ─── Notification Preferences ─────────────────────────────────────────────────

export interface NotificationPreference {
  id: number;
  userId: number;
  ruleId: string;
  enabled: boolean;
  updatedAt: Date;
}

/** Fetch all notification preferences for a user. */
export async function getNotificationPreferences(userId: number): Promise<NotificationPreference[]> {
  return query<NotificationPreference>(
    `SELECT id, userId, ruleId, enabled, updatedAt
     FROM notification_preferences
     WHERE userId = @userId
     ORDER BY ruleId`,
    { userId: { type: sql.Int, value: userId } },
  );
}

/** Upsert a single preference row (insert or update enabled flag). */
export async function upsertNotificationPreference(
  userId: number,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  await execute(
    `MERGE notification_preferences AS target
     USING (SELECT @userId AS userId, @ruleId AS ruleId) AS src
       ON target.userId = src.userId AND target.ruleId = src.ruleId
     WHEN MATCHED THEN
       UPDATE SET enabled = @enabled
     WHEN NOT MATCHED THEN
       INSERT (userId, ruleId, enabled) VALUES (@userId, @ruleId, @enabled);`,
    {
      userId:  { type: sql.Int,          value: userId },
      ruleId:  { type: sql.NVarChar(100), value: ruleId },
      enabled: { type: sql.Bit,           value: enabled ? 1 : 0 },
    },
  );
}

/** Check if a specific rule is enabled for a user (default true if no row exists). */
export async function isNotificationEnabled(userId: number, ruleId: string): Promise<boolean> {
  const rows = await query<{ enabled: boolean }>(
    `SELECT enabled FROM notification_preferences
     WHERE userId = @userId AND ruleId = @ruleId`,
    {
      userId: { type: sql.Int,          value: userId },
      ruleId: { type: sql.NVarChar(100), value: ruleId },
    },
  );
  // No row = default enabled
  return rows.length === 0 ? true : Boolean(rows[0].enabled);
}



// ─────────────────────────────────────────────────────────────────────────────
// AI Adoption Scores helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface AiAdoptionScore {
  id: number;
  userId: number | null;
  employeeName: string;
  department: string;
  jobTitle: string;
  overallScore: number;
  trendDelta: number;
  toolsUsed: number;
  promptsPerWeek: number;
  automationsCreated: number;
  dimToolUsage: number;
  dimPromptQuality: number;
  dimAutomation: number;
  dimTraining: number;
  dimCollaboration: number;
  dimInnovation: number;
  tier: "Pioneer" | "Adopter" | "Learner" | "Laggard";
  lastActiveAt: Date | null;
  scoreDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export async function getAiAdoptionScores(): Promise<AiAdoptionScore[]> {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.request().query<AiAdoptionScore>(`
    SELECT id, userId, employeeName, department, jobTitle,
           overallScore, trendDelta, toolsUsed, promptsPerWeek, automationsCreated,
           dimToolUsage, dimPromptQuality, dimAutomation, dimTraining,
           dimCollaboration, dimInnovation, tier,
           lastActiveAt, scoreDate, createdAt, updatedAt
    FROM dbo.ai_adoption_scores
    ORDER BY overallScore DESC
  `);
  return result.recordset;
}

export async function upsertAiAdoptionScore(
  data: Omit<AiAdoptionScore, "id" | "createdAt" | "updatedAt" | "scoreDate">
): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const req = pool.request();
  req.input("employeeName",       sql.NVarChar(200), data.employeeName);
  req.input("department",         sql.NVarChar(100), data.department);
  req.input("jobTitle",           sql.NVarChar(200), data.jobTitle);
  req.input("overallScore",       sql.TinyInt,       data.overallScore);
  req.input("trendDelta",         sql.SmallInt,      data.trendDelta);
  req.input("toolsUsed",          sql.TinyInt,       data.toolsUsed);
  req.input("promptsPerWeek",     sql.SmallInt,      data.promptsPerWeek);
  req.input("automationsCreated", sql.SmallInt,      data.automationsCreated);
  req.input("dimToolUsage",       sql.TinyInt,       data.dimToolUsage);
  req.input("dimPromptQuality",   sql.TinyInt,       data.dimPromptQuality);
  req.input("dimAutomation",      sql.TinyInt,       data.dimAutomation);
  req.input("dimTraining",        sql.TinyInt,       data.dimTraining);
  req.input("dimCollaboration",   sql.TinyInt,       data.dimCollaboration);
  req.input("dimInnovation",      sql.TinyInt,       data.dimInnovation);
  req.input("tier",               sql.NVarChar(20),  data.tier);
  req.input("lastActiveAt",       sql.DateTime2,     data.lastActiveAt);
  req.input("userId",             sql.Int,           data.userId ?? null);

  await req.query(`
    MERGE dbo.ai_adoption_scores AS target
    USING (SELECT @employeeName AS employeeName) AS src ON target.employeeName = src.employeeName
    WHEN MATCHED THEN
      UPDATE SET
        department = @department, jobTitle = @jobTitle,
        overallScore = @overallScore, trendDelta = @trendDelta,
        toolsUsed = @toolsUsed, promptsPerWeek = @promptsPerWeek,
        automationsCreated = @automationsCreated,
        dimToolUsage = @dimToolUsage, dimPromptQuality = @dimPromptQuality,
        dimAutomation = @dimAutomation, dimTraining = @dimTraining,
        dimCollaboration = @dimCollaboration, dimInnovation = @dimInnovation,
        tier = @tier, lastActiveAt = @lastActiveAt, userId = @userId,
        scoreDate = CAST(SYSUTCDATETIME() AS DATE)
    WHEN NOT MATCHED THEN
      INSERT (employeeName, department, jobTitle, overallScore, trendDelta,
              toolsUsed, promptsPerWeek, automationsCreated,
              dimToolUsage, dimPromptQuality, dimAutomation, dimTraining,
              dimCollaboration, dimInnovation, tier, lastActiveAt, userId)
      VALUES (@employeeName, @department, @jobTitle, @overallScore, @trendDelta,
              @toolsUsed, @promptsPerWeek, @automationsCreated,
              @dimToolUsage, @dimPromptQuality, @dimAutomation, @dimTraining,
              @dimCollaboration, @dimInnovation, @tier, @lastActiveAt, @userId);
  `);
}
