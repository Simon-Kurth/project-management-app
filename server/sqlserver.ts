/**
 * server/sqlserver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Microsoft SQL Server connection pool helper using the `mssql` (tedious) driver.
 *
 * Connection string format (set DATABASE_URL env var):
 *   Server=your-server.database.windows.net;Database=wheelhouse;
 *   User Id=sa;Password=your-password;Encrypt=true;TrustServerCertificate=false;
 *
 *   Or as a URL:
 *   mssql://username:password@your-server.database.windows.net/wheelhouse
 *
 * The pool is lazy-initialised on first use and reused across requests.
 * Call closeSqlPool() during graceful shutdown to drain the pool.
 */

import sql from "mssql";

// ─── Connection pool (singleton) ─────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;
let _connecting: Promise<sql.ConnectionPool> | null = null;

/**
 * Parse the DATABASE_URL into an mssql config object.
 * Supports both connection string format and URL format.
 */
function parseDatabaseUrl(url: string): sql.config {
  // Try URL format: mssql://user:pass@host:port/database
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mssql:" || parsed.protocol === "sqlserver:") {
      const config: sql.config = {
        server:   parsed.hostname,
        port:     parsed.port ? parseInt(parsed.port, 10) : 1433,
        database: parsed.pathname.replace(/^\//, ""),
        user:     decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        options: {
          encrypt:                 true,
          trustServerCertificate:  parsed.searchParams.get("TrustServerCertificate") === "true",
          enableArithAbort:        true,
          connectTimeout:          30000,
          requestTimeout:          30000,
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
  // Server=...;Database=...;User Id=...;Password=...;Encrypt=true;...
  const parts: Record<string, string> = {};
  url.split(";").forEach((segment) => {
    const idx = segment.indexOf("=");
    if (idx === -1) return;
    const key   = segment.slice(0, idx).trim().toLowerCase();
    const value = segment.slice(idx + 1).trim();
    parts[key] = value;
  });

  const server = parts["server"] || parts["data source"] || "";
  // Strip tcp: prefix and instance name for the host
  const [host, instanceOrPort] = server.replace(/^tcp:/i, "").split(",");
  const port = instanceOrPort ? parseInt(instanceOrPort, 10) : 1433;

  return {
    server:   host.trim(),
    port:     isNaN(port) ? 1433 : port,
    database: parts["database"] || parts["initial catalog"] || "",
    user:     parts["user id"] || parts["uid"] || "",
    password: parts["password"] || parts["pwd"] || "",
    options: {
      encrypt:                parts["encrypt"] !== "false",
      trustServerCertificate: parts["trustservercertificate"] === "true",
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
  const pool = await getPool();
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
  const pool = await getPool();
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
  const pool = await getPool();
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
