// web/lib/db.ts — Postgres connection pool for the Cloud SQL migration.
//
// Reads DATABASE_URL (Supabase Postgres today for dev/differential-testing; the
// Cloud SQL `cookiedoh` db at cutover — same driver, just repoint the URL). The
// supabase-js data layer is being replaced by lib/pgClient (a supabase-compatible
// builder) sitting on top of this pool; auth is migrated separately.
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Match supabase-js / PostgREST serialization so the pgClient shim is a true
// drop-in: return date/time columns as ISO-8601 STRINGS (not JS Date objects),
// so existing string ops (.slice, .replace("T"," "), new Date(...)) behave the
// same. Postgres wire "2026-06-26 05:06:12.001+00" → "2026-06-26T05:06:12.001+00:00".
const isoTs = (v: string | null) => (v == null ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
types.setTypeParser(1184, isoTs as any); // timestamptz
types.setTypeParser(1114, isoTs as any); // timestamp (no tz)
types.setTypeParser(1082, (v) => v);     // date → keep "YYYY-MM-DD" string
types.setTypeParser(20, (v) => (v == null ? v : Number(v))); // int8/bigint → number (PostgREST does; our values are small)

let _pool: Pool | null = null;

export function pool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // SSL is required by both Supabase and Cloud SQL (public IP, sslmode=require).
  // rejectUnauthorized:false accepts the managed server cert without shipping a
  // CA bundle; TODO at cutover: pin the Cloud SQL server CA and flip this to true.
  const needsSsl = /sslmode=require/.test(connectionString) || /supabase\.|\.cloudsql\.|34\.101\./.test(connectionString);
  _pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  _pool.on("error", (e) => console.error("pg pool error:", e?.message || e));
  return _pool;
}

/** Run a parameterized query. Params use $1,$2,… placeholders. */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool().query<T>(text, params as any[]);
}

/** Run a set of statements inside a single transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
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
