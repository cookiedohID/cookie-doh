// web/lib/db.ts — Postgres pool for the storefront's own data.
//
// TWO connection paths, picked by env:
//  • PROD (Cloud SQL): when INSTANCE_CONNECTION_NAME is set, dial via the Cloud SQL
//    Language Connector — IAM + a short-lived client cert on port 3307. No IP
//    allowlist, no firewall rule, no authorized-network, no SSL config needed (the
//    connector owns TLS). This is what removes the July public-IP blocker.
//  • DEV / differential-testing: otherwise fall back to DATABASE_URL (Supabase).
//
// Node.js runtime ONLY (the connector needs net/tls — never Edge).
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Match supabase-js / PostgREST serialization so lib/pgClient is a true drop-in:
// return date/time columns as ISO-8601 STRINGS, not JS Date objects.
const isoTs = (v: string | null) => (v == null ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
types.setTypeParser(1184, isoTs as any); // timestamptz
types.setTypeParser(1114, isoTs as any); // timestamp (no tz)
types.setTypeParser(1082, (v) => v);     // date → keep "YYYY-MM-DD" string
types.setTypeParser(20, (v) => (v == null ? v : Number(v))); // int8/bigint → number

// Pin session GUCs on every connection so behavior is byte-identical to the old
// Supabase host and independent of either instance's server/role config:
//   • TimeZone=UTC       — orders.order_no bakes to_char(now(),'YYYYMMDD') server-side;
//                          Supabase runs UTC, so pinning UTC keeps order-number dates
//                          unchanged (Asia/Jakarta would shift early-morning orders a day).
//   • DateStyle=ISO,MDY  — the wire text form db.ts's type parsers expect.
//   • statement_timeout  — 120000ms = 2min, matching live Supabase exactly.
// Verified against live Supabase 2026-10-27 (TimeZone=UTC, DateStyle="ISO, MDY",
// statement_timeout=2min). This also closes the only PG17→18 cutover exposures the
// version-sweep surfaced (all config-parity, not code/semantic).
const SESSION_OPTIONS = "-c TimeZone=UTC -c DateStyle=ISO,MDY -c statement_timeout=120000";

let _poolPromise: Promise<Pool> | null = null;

async function createPool(): Promise<Pool> {
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;

  // ── Cloud SQL connector path (production) ────────────────────────────────
  if (instanceConnectionName) {
    const { Connector, IpAddressTypes } = await import("@google-cloud/cloud-sql-connector");
    const { GoogleAuth } = await import("google-auth-library");
    const saKeyB64 = process.env.GCP_SA_KEY;
    if (!saKeyB64) throw new Error("GCP_SA_KEY not set (base64 service-account key for the Cloud SQL connector)");
    const credentials = JSON.parse(Buffer.from(saKeyB64, "base64").toString("utf8"));
    const connector = new Connector({
      auth: new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/sqlservice.admin"] }),
    });
    const clientOpts = await connector.getOptions({ instanceConnectionName, ipType: IpAddressTypes.PUBLIC });
    // IMPORTANT: clientOpts supplies the stream — do NOT add connectionString or an
    // ssl object (that double-wraps TLS and hangs instead of erroring cleanly).
    const p = new Pool({
      ...clientOpts,
      user: process.env.DB_USER || "cookiedoh_app",
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "cookiedoh",
      options: SESSION_OPTIONS,
      max: Number(process.env.PG_POOL_MAX || 5),
      connectionTimeoutMillis: 5000,
    });
    p.on("error", (e) => console.error("pg pool error:", e?.message || e));
    return p;
  }

  // ── DATABASE_URL path (local dev / differential testing vs Supabase) ─────
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Neither INSTANCE_CONNECTION_NAME nor DATABASE_URL is set");
  const needsSsl = /sslmode=require/.test(connectionString) || /supabase\.|\.cloudsql\./.test(connectionString);
  const p = new Pool({
    connectionString,
    options: SESSION_OPTIONS,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  p.on("error", (e) => console.error("pg pool error:", e?.message || e));
  return p;
}

/** The shared pool (lazily created; async because the connector resolves options). */
export function pool(): Promise<Pool> {
  if (!_poolPromise) _poolPromise = createPool().catch((e) => { _poolPromise = null; throw e; });
  return _poolPromise;
}

/** Run a parameterized query. Params use $1,$2,… placeholders. */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return (await pool()).query<T>(text, params as any[]);
}

/** Run a set of statements inside a single transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await pool()).connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
