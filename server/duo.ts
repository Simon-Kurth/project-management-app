/**
 * Duo Universal Prompt OIDC Integration
 * ─────────────────────────────────────
 * Uses the official @duosecurity/duo_universal SDK (v3).
 *
 * Flow:
 *  1. User submits email + password → server validates credentials
 *  2. Server creates a Duo state token, stores it in duo_state_store, returns the Duo auth URL
 *  3. Frontend redirects the browser to the Duo Universal Prompt hosted URL
 *  4. Duo authenticates the user (push / passcode / biometric) and redirects back to
 *     {APP_URL}/duo-callback?state=...&duo_code=...
 *  5. Frontend calls trpc.auth.duoCallback with { state, duoCode }
 *  6. Server exchanges the code for a Duo token, validates state, creates a session cookie
 *
 * All computation (state generation, token exchange, validation) happens locally on the
 * server — zero LLM tokens are consumed at any point in this flow.
 */

import { Client } from "@duosecurity/duo_universal";
import sql from "mssql";
import { execute, query, getPool } from "./sqlserver";

// ─── Environment ─────────────────────────────────────────────────────────────

export function getDuoConfig() {
  return {
    clientId:    process.env.DUO_CLIENT_ID     ?? "",
    clientSecret: process.env.DUO_CLIENT_SECRET ?? "",
    apiHost:     process.env.DUO_API_HOST       ?? "",
    redirectUrl: process.env.DUO_REDIRECT_URL   ?? `${process.env.APP_URL ?? "http://localhost:3000"}/duo-callback`,
  };
}

export function isDuoConfigured(): boolean {
  const { clientId, clientSecret, apiHost } = getDuoConfig();
  return !!(clientId && clientSecret && apiHost);
}

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createDuoClient(): Client {
  const config = getDuoConfig();
  return new Client({
    clientId:    config.clientId,
    clientSecret: config.clientSecret,
    apiHost:     config.apiHost,
    redirectUrl: config.redirectUrl,
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function duoHealthCheck(): Promise<{ ok: boolean; message: string }> {
  if (!isDuoConfigured()) {
    return { ok: false, message: "Duo is not configured — set DUO_CLIENT_ID, DUO_CLIENT_SECRET, DUO_API_HOST" };
  }
  try {
    const client = createDuoClient();
    await client.healthCheck();
    return { ok: true, message: "Duo servers reachable" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Duo health check failed: ${msg}` };
  }
}

// ─── Initiate Duo Auth ────────────────────────────────────────────────────────

/**
 * Generates a Duo auth URL for the given user.
 * Stores the state token in the database for CSRF validation on callback.
 * Returns the URL to redirect the browser to.
 */
export async function initiateDuoAuth(userId: number, username: string): Promise<string> {
  const pool = await getPool();
  if (!pool) throw new Error("Database unavailable");

  const client = createDuoClient();
  const state = client.generateState();

  // Store state in DB — expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await execute(
    `INSERT INTO duo_state_store (state, username, userId, expiresAt, used)
     VALUES (@state, @username, @userId, @expiresAt, 0)`,
    {
      state:     { type: sql.NVarChar(128), value: state },
      username:  { type: sql.NVarChar(320), value: username },
      userId:    { type: sql.Int,           value: userId },
      expiresAt: { type: sql.DateTime2,     value: expiresAt },
    },
  );

  const authUrl = await client.createAuthUrl(username, state);
  return authUrl;
}

// ─── Complete Duo Callback ────────────────────────────────────────────────────

export interface DuoCallbackResult {
  userId: number;
  username: string;
}

/**
 * Validates the Duo callback:
 *  1. Looks up the state token in the DB (must exist, not expired, not used)
 *  2. Marks the state as used (one-time use)
 *  3. Exchanges the duo_code for a Duo token via the SDK
 *  4. Returns the userId and username for session creation
 */
export async function completeDuoCallback(
  state: string,
  duoCode: string
): Promise<DuoCallbackResult> {
  const pool = await getPool();
  if (!pool) throw new Error("Database unavailable");

  // 1. Look up state — must exist, not expired, not used
  const rows = await query<{ id: number; userId: number; username: string; expiresAt: Date; used: boolean }>(
    `SELECT TOP 1 id, userId, username, expiresAt, used
     FROM duo_state_store
     WHERE state = @state AND used = 0 AND expiresAt > GETUTCDATE()`,
    { state: { type: sql.NVarChar(128), value: state } },
  );

  if (rows.length === 0) {
    throw new Error("Invalid or expired Duo state token. Please log in again.");
  }

  const stateRow = rows[0];

  // 2. Mark state as used immediately (one-time use, prevents replay)
  await execute(
    "UPDATE duo_state_store SET used = 1 WHERE id = @id",
    { id: { type: sql.Int, value: stateRow.id } },
  );

  // 3. Exchange duo_code for token via SDK
  const client = createDuoClient();
  await client.exchangeAuthorizationCodeFor2FAResult(duoCode, stateRow.username);
  // SDK throws if the exchange fails or the token is invalid — no further validation needed

  return {
    userId:   stateRow.userId,
    username: stateRow.username,
  };
}

// ─── Cleanup Expired States ───────────────────────────────────────────────────

/**
 * Deletes expired state tokens from the DB.
 * Called periodically by the scheduler to keep the table clean.
 */
export async function cleanupExpiredDuoStates(): Promise<number> {
  const pool = await getPool();
  if (!pool) return 0;

  return execute(
    "DELETE FROM duo_state_store WHERE expiresAt <= GETUTCDATE()",
  );
}
