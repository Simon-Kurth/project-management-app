/**
 * server/sqlserver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Microsoft SQL Server connection pool helper using the `mssql` (tedious) driver.
 *
 * This app runs SQL Server on the same host as the application server.
 *
 * Recommended DATABASE_URL for a local SQL Server instance:
 *   Server=localhost;Database=project_management;User Id=sa;Password=YourPassword;
 *   Encrypt=false;TrustServerCertificate=true;
 *
 *   Or using a named instance:
 *   Server=localhost\SQLEXPRESS;Database=project_management;User Id=sa;
 *   Password=YourPassword;Encrypt=false;TrustServerCertificate=true;
 *
 *   Or as a URL (note: TrustServerCertificate=true query param required for local):
 *   mssql://sa:YourPassword@localhost/project_management?TrustServerCertificate=true
 *
 * When connecting to localhost/127.0.0.1, TrustServerCertificate is automatically
 * set to true and Encrypt defaults to false unless explicitly overridden.
 *
 * The pool is lazy-initialised on first use and reused across requests.
 * Call closeSqlPool() during graceful shutdown to drain the pool.
 */

import sql from "mssql";

// ─── Connection pool (singleton) ─────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;
let _connecting: Promise<sql.ConnectionPool> | null = null;

function isLocalhost(host: string): boolean {
  const h = host.toLowerCase().split("\\")[0].split(",")[0].trim();
  return h === "localhost" || h === "127.0.0.1" || h === "." || h === "(local)";
}

/**
 * Parse the DATABASE_URL into an mssql config object.
 * Supports both connection string format and URL format.
 *
 * Local connections (localhost / 127.0.0.1 / . / (local)) automatically get
 * TrustServerCertificate=true and Encrypt=false unless the connection string
 * explicitly overrides these values.
 */
function parseDatabaseUrl(url: string): sql.config {
  // Try URL format: mssql://user:pass@host:port/database
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mssql:" || parsed.protocol === "sqlserver:") {
      const local = isLocalhost(parsed.hostname);
      const trustParam = parsed.searchParams.get("TrustServerCertificate");
      const encryptParam = parsed.searchParams.get("Encrypt");

      const config: sql.config = {
        server:   parsed.hostname,
        port:     parsed.port ? parseInt(parsed.port, 10) : 1433,
        database: parsed.pathname.replace(/^\//, ""),
        user:     decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        options: {
          encrypt:                encryptParam !== null ? encryptParam !== "false" : !local,
          trustServerCertificate: trustParam !== null ? trustParam === "true" : local,
          enableArithAbort:       true,
          connectTimeout:         30000,
          requestTimeout:         30000,
        },
        pool: {
          max:               10,
          min:               0,
          idleTimeoutMillis: 30000,
        },
      };
      return config;
    }
  } catch {
    // Not a URL — fall through to connection string parsing
  }

  // ADO.NET connection string format:
  // Server=...;Database=...;User Id=...;Password=...;Encrypt=false;TrustServerCertificate=true;
  const parts: Record<string, string> = {};
  url.split(";").forEach((segment) => {
    const idx = segment.indexOf("=");
    if (idx === -1) return;
    const key   = segment.slice(0, idx).trim().toLowerCase();
    const value = segment.slice(idx + 1).trim();
    parts[key] = value;
  });

  const server = parts["server"] || parts["data source"] || "";
  // Strip tcp: prefix and port suffix
  const [hostRaw, portRaw] = server.replace(/^tcp:/i, "").split(",");
  const port = portRaw ? parseInt(portRaw, 10) : 1433;
  const host = hostRaw.trim();
  const local = isLocalhost(host);

  const encryptExplicit = "encrypt" in parts;
  const trustExplicit   = "trustservercertificate" in parts;

  return {
    server:   host,
    port:     isNaN(port) ? 1433 : port,
    database: parts["database"] || parts["initial catalog"] || "",
    user:     parts["user id"] || parts["uid"] || "",
    password: parts["password"] || parts["pwd"] || "",
    options: {
      encrypt:                encryptExplicit ? parts["encrypt"] !== "false" : !local,
      trustServerCertificate: trustExplicit   ? parts["trustservercertificate"] === "true" : local,
      enableArithAbort:       true,
      connectTimeout:         30000,
      requestTimeout:         30000,
    },
    pool: {
      max:               10,
      min:               0,
      idleTimeoutMillis: 30000,
    },
  };
}

/**
 * Returns the shared connection pool, creating it on first call.
 * Returns null if DATABASE_URL is not set (graceful degradation for tests).
 */
export async function getPool(): Promise<sql.ConnectionPool | null> {
  if (_pool?.connected) return _pool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[SQL Server] DATABASE_URL not set — database features disabled");
    return null;
  }

  if (_connecting) return _connecting;

  _connecting = (async () => {
    try {
      const config = parseDatabaseUrl(dbUrl);
      const pool = new sql.ConnectionPool(config);
      pool.on("error", (err) => {
        console.error("[SQL Server] Pool error:", err);
        _pool = null;
        _connecting = null;
      });
      await pool.connect();
      console.log("[SQL Server] Connection pool established");
      _pool = pool;
      _connecting = null;
      return pool;
    } catch (err) {
      console.error("[SQL Server] Failed to connect:", err);
      _pool = null;
      _connecting = null;
      throw err;
    }
  })();

  return _connecting;
}

/**
 * Execute a parameterised query and return all rows.
 * The `params` object maps parameter names to values.
 *
 * Example:
 *   const rows = await query<User>(
 *     "SELECT * FROM users WHERE id = @id",
 *     { id: sql.Int, values: { id: 42 } }
 *   );
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: Record<string, { type: sql.ISqlTypeFactory | sql.ISqlType; value: unknown }>,
): Promise<T[]> {
  let pool: sql.ConnectionPool | null;
  try {
    pool = await getPool();
  } catch {
    // DB not reachable — return empty result set so callers can fall back gracefully
    return [];
  }
  if (!pool) return [];

  const request = pool.request();
  if (params) {
    for (const [name, { type, value }] of Object.entries(params)) {
      request.input(name, type as sql.ISqlType, value);
    }
  }

  const result = await request.query<T>(text);
  return result.recordset;
}

/**
 * Execute a parameterised statement and return the number of rows affected.
 */
export async function execute(
  text: string,
  params?: Record<string, { type: sql.ISqlTypeFactory | sql.ISqlType; value: unknown }>,
): Promise<number> {
  let pool: sql.ConnectionPool | null;
  try {
    pool = await getPool();
  } catch {
    // DB not reachable — return 0 rows affected so callers can fall back gracefully
    return 0;
  }
  if (!pool) return 0;

  const request = pool.request();
  if (params) {
    for (const [name, { type, value }] of Object.entries(params)) {
      request.input(name, type as sql.ISqlType, value);
    }
  }

  const result = await request.query(text);
  return result.rowsAffected?.[0] ?? 0;
}

/**
 * Execute a parameterised INSERT and return the new IDENTITY value.
 */
export async function insertGetId(
  text: string,
  params?: Record<string, { type: sql.ISqlTypeFactory | sql.ISqlType; value: unknown }>,
): Promise<number | null> {
  let pool: sql.ConnectionPool | null;
  try {
    pool = await getPool();
  } catch {
    return null;
  }
  if (!pool) return null;

  const request = pool.request();
  if (params) {
    for (const [name, { type, value }] of Object.entries(params)) {
      request.input(name, type as sql.ISqlType, value);
    }
  }

  // Append OUTPUT INSERTED.id if not already present
  const queryText = text.trimEnd().endsWith(";")
    ? text.slice(0, -1)
    : text;

  const result = await request.query<{ id: number }>(
    `${queryText}; SELECT SCOPE_IDENTITY() AS id`,
  );
  return result.recordset?.[0]?.id ?? null;
}

/**
 * Drain the connection pool during graceful shutdown.
 */
export async function closeSqlPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
    _connecting = null;
    console.log("[SQL Server] Connection pool closed");
  }
}

// Re-export sql types for use in query helpers
export { sql };

/**
 * Wraps a DB call and converts connection/pool errors into a TRPCError
 * with code SERVICE_UNAVAILABLE so the client receives a clean message
 * instead of a raw tedious ConnectionError stack trace.
 *
 * Usage:
 *   const user = await withDbError(() => getUserByEmail(email));
 */
export async function withDbError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Detect tedious / mssql connection failures
    const isConnErr =
      msg.includes("Failed to connect") ||
      msg.includes("Could not connect") ||
      msg.includes("ConnectionError") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      (err as { name?: string }).name === "ConnectionError";

    if (isConnErr) {
      // Import lazily to avoid circular deps — TRPCError is tiny
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message:
          "The database is not reachable. Please check your DATABASE_URL configuration and ensure the SQL Server is running.",
        cause: err,
      });
    }
    throw err;
  }
}
