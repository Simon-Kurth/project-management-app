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
  role: mysqlEnum("role", ["user", "admin", "executive", "company"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mfaSecret: varchar("mfaSecret", { length: 255 }),
  mfaEnabled: boolean("mfaEnabled").default(false).notNull(),
  mfaVerified: boolean("mfaVerified").default(false).notNull(),
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
