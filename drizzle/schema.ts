import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "executive", "company", "qa", "sales_marketing", "csm"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mfaSecret: varchar("mfaSecret", { length: 255 }),
  mfaEnabled: boolean("mfaEnabled").default(false).notNull(),
  mfaVerified: boolean("mfaVerified").default(false).notNull(),
  // Entra ID (Azure AD) SSO fields
  entraOid: varchar("entraOid", { length: 128 }),        // Entra object ID (immutable)
  entraUpn: varchar("entraUpn", { length: 320 }),        // user@company.com
  entraTenantId: varchar("entraTenantId", { length: 128 }), // Entra tenant GUID
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Refresh Tokens ───────────────────────────────────────────────────────────
export const refreshTokens = mysqlTable("refresh_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userEmail: varchar("userEmail", { length: 320 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 255 }).notNull(),
  resourceId: varchar("resourceId", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Dashboard Snapshots ──────────────────────────────────────────────────────
export const dashboardSnapshots = mysqlTable("dashboard_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  tabName: varchar("tabName", { length: 100 }).notNull(),
  data: json("data").notNull(),
  source: varchar("source", { length: 100 }).default("mock").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type DashboardSnapshot = typeof dashboardSnapshots.$inferSelect;

// ─── Connector Configs ────────────────────────────────────────────────────────
export const connectorConfigs = mysqlTable("connector_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  connectorType: varchar("connectorType", { length: 50 }).notNull(),
  config: json("config").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  lastSync: timestamp("lastSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConnectorConfig = typeof connectorConfigs.$inferSelect;

// ─── Computed KPIs (Jira pipeline output) ─────────────────────────────────────
// Stores ONLY pre-aggregated KPI values — never raw issue data.
// The dashboard reads from this table; Jira API is never called on page load.
export const computedKpis = mysqlTable("computed_kpis", {
  id: int("id").autoincrement().primaryKey(),
  boardId: varchar("boardId", { length: 64 }).notNull(),
  kpiType: varchar("kpiType", { length: 64 }).notNull(), // "delivery" | "development"
  data: json("data").notNull(),                          // ComputedDeliveryKPIs JSON
  source: varchar("source", { length: 32 }).default("jira").notNull(),
  computedAt: timestamp("computedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ComputedKpi = typeof computedKpis.$inferSelect;
export type InsertComputedKpi = typeof computedKpis.$inferInsert;

// ─── Duo State Store ──────────────────────────────────────────────────────────
// Short-lived CSRF state tokens for the Duo Universal Prompt OIDC flow.
// Each row is created when the user is redirected to Duo and consumed on callback.
export const duoStateStore = mysqlTable("duo_state_store", {
  id: int("id").autoincrement().primaryKey(),
  state: varchar("state", { length: 128 }).notNull().unique(),
  username: varchar("username", { length: 320 }).notNull(), // email used as Duo username
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DuoState = typeof duoStateStore.$inferSelect;

// ─── Pending Auth Store ───────────────────────────────────────────────────────
// Holds the Entra-authenticated user identity between Entra callback and Duo
// callback. Consumed once Duo verification succeeds.
export const pendingAuthStore = mysqlTable("pending_auth_store", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(), // random CSRF token
  userId: int("userId").notNull(),
  username: varchar("username", { length: 320 }).notNull(),   // UPN / email for Duo
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PendingAuth = typeof pendingAuthStore.$inferSelect;
