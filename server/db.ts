import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  computedKpis,
  connectorConfigs,
  InsertUser,
  refreshTokens,
  users,
} from "../drizzle/schema";
import type { ComputedDeliveryKPIs } from "./connectors/jira";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserMfa(
  userId: number,
  data: { mfaSecret?: string; mfaEnabled?: boolean; mfaVerified?: boolean }
) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

export async function createDemoUser(data: {
  email: string;
  passwordHash: string;
  name: string;
  role: "executive" | "company";
}) {
  const db = await getDb();
  if (!db) return;
  const openId = `demo_${data.role}_${Date.now()}`;
  await db
    .insert(users)
    .values({
      openId,
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role,
      loginMethod: "password",
      isActive: true,
      lastSignedIn: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: { passwordHash: data.passwordHash, name: data.name, role: data.role },
    });
}

// ─── Refresh Token Helpers ────────────────────────────────────────────────────

export async function saveRefreshToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
}

export async function getRefreshToken(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.revoked, false)))
    .limit(1);
  return result[0];
}

export async function revokeRefreshToken(tokenHash: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.tokenHash, tokenHash));
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
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.error("[AuditLog] Failed to write:", e);
  }
}

export async function getAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Connector Config Helpers ─────────────────────────────────────────────────

export async function getConnectorConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(connectorConfigs);
}

// ─── Computed KPI Helpers (Jira pipeline) ────────────────────────────────────────
// Stores ONLY pre-aggregated KPI values — never raw Jira issue arrays.

export async function upsertComputedKPIs(entry: {
  boardId: string;
  kpiType: string;
  data: ComputedDeliveryKPIs;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(computedKpis)
    .values({
      boardId: entry.boardId,
      kpiType: entry.kpiType,
      data: entry.data as unknown as Record<string, unknown>,
      source: "jira",
      computedAt: new Date(entry.data.computedAt),
    })
    .onDuplicateKeyUpdate({
      set: {
        data: entry.data as unknown as Record<string, unknown>,
        computedAt: new Date(entry.data.computedAt),
        updatedAt: new Date(),
      },
    });
}

export async function getLatestComputedKPIs(
  boardId: string,
  kpiType: string
): Promise<ComputedDeliveryKPIs | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(computedKpis)
    .where(and(eq(computedKpis.boardId, boardId), eq(computedKpis.kpiType, kpiType)))
    .orderBy(desc(computedKpis.computedAt))
    .limit(1);
  if (!result[0]) return null;
  return result[0].data as unknown as ComputedDeliveryKPIs;
}

export async function seedConnectors() {
  const db = await getDb();
  if (!db) return;
  const stubs = [
    { name: "jira", connectorType: "jira_rest", config: { base_url: "", project_key: "", api_token: "" } },
    { name: "github", connectorType: "github_rest", config: { org: "", repo: "", token: "" } },
    { name: "salesforce", connectorType: "salesforce_rest", config: { instance_url: "", client_id: "", client_secret: "" } },
    { name: "csv_upload", connectorType: "file_upload", config: { allowed_types: ["csv", "json"], max_size_mb: 10 } },
    { name: "google_analytics", connectorType: "ga4_rest", config: { property_id: "", credentials_json: "" } },
  ];
  for (const stub of stubs) {
    await db
      .insert(connectorConfigs)
      .values({ ...stub, isActive: false })
      .onDuplicateKeyUpdate({ set: { connectorType: stub.connectorType } });
  }
}
