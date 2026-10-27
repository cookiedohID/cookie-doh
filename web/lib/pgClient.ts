// web/lib/pgClient.ts — a drop-in, supabase-js-COMPATIBLE data client backed by
// raw Postgres (lib/db). It reproduces the exact chainable surface the codebase
// uses — .from().select()/.insert()/.update()/.upsert()/.delete() with .eq/.neq/
// .in/.gt(e)/.lt(e)/.ilike/.is/.not/.or/.match/.order/.limit/.range/.single/
// .maybeSingle — and resolves to { data, error } (never throws), so the ~300
// existing call sites keep working when supaAdmin() returns this instead of the
// Supabase client. AUTH (auth.*) is NOT here — it migrates separately (P2).
//
// Every value is passed as a bound parameter ($1,$2,…) — no string interpolation
// of user data — so this is not an injection surface. Column names come from our
// own source, never from request input.
import { query } from "@/lib/db";

type Row = Record<string, any>;
type Result<T = any> = { data: T; error: { message: string; code?: string } | null; count?: number | null };

// Translate an identifier that may carry a JSON arrow path.
//   "id"            -> "id"
//   "meta->tbs"     -> "meta"->'tbs'          (json object)
//   "meta->>tbs"    -> "meta"->>'tbs'         (json text)
//   "meta->a->>b"   -> "meta"->'a'->>'b'
function col(name: string): string {
  if (!name.includes("->")) return q(name);
  const parts = name.split("->");
  let out = q(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    let seg = parts[i];
    const text = seg.startsWith(">"); // "->>" text extraction
    if (text) seg = seg.slice(1);
    out += (text ? "->>" : "->") + "'" + seg.replace(/'/g, "''") + "'";
  }
  return out;
}
// Quote a plain SQL identifier.
function q(id: string): string {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

type Filter = { kind: "op"; col: string; op: string; val: any } | { kind: "isRaw"; col: string; val: "null" | "true" | "false"; neg?: boolean } | { kind: "raw"; sql: string; params: any[] };

const OP_SQL: Record<string, string> = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike",
};

class Builder<T = any> implements PromiseLike<Result<T>> {
  private _table: string;
  private _action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private _cols = "*";
  private _returning = false; // whether a mutating action should RETURNING
  private _filters: Filter[] = [];
  private _order: string[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _rangeTo: number | null = null;
  private _values: Row[] = []; // insert/upsert
  private _set: Row | null = null; // update
  private _onConflict: string | null = null;
  private _single: "one" | "maybe" | null = null;
  private _count = false;   // supabase .select(cols, { count })
  private _head = false;    // supabase .select(cols, { head: true }) → count only, no rows

  constructor(table: string) { this._table = table; }

  // ── shape ───────────────────────────────────────────────────────────────
  select(cols?: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this._action === "select") this._cols = cols && cols.trim() ? cols : "*";
    else this._returning = true; // .insert(...).select() etc → RETURNING
    if (cols && /\(/.test(cols)) throw new Error(`pgClient: embedded select not supported yet ("${cols}") on ${this._table}`);
    if (opts?.count) { this._count = true; this._head = opts.head === true; }
    return this;
  }
  insert(rows: Row | Row[]) { this._action = "insert"; this._values = Array.isArray(rows) ? rows : [rows]; return this; }
  update(set: Row) { this._action = "update"; this._set = set; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this._action = "upsert"; this._values = Array.isArray(rows) ? rows : [rows];
    this._onConflict = opts?.onConflict || null; return this;
  }
  delete() { this._action = "delete"; return this; }

  // ── filters ─────────────────────────────────────────────────────────────
  eq(c: string, v: any) { return this._f("eq", c, v); }
  neq(c: string, v: any) { return this._f("neq", c, v); }
  gt(c: string, v: any) { return this._f("gt", c, v); }
  gte(c: string, v: any) { return this._f("gte", c, v); }
  lt(c: string, v: any) { return this._f("lt", c, v); }
  lte(c: string, v: any) { return this._f("lte", c, v); }
  like(c: string, v: any) { return this._f("like", c, v); }
  ilike(c: string, v: any) { return this._f("ilike", c, v); }
  in(c: string, v: any[]) { this._filters.push({ kind: "op", col: c, op: "in", val: v }); return this; }
  is(c: string, v: null | boolean) { this._filters.push({ kind: "isRaw", col: c, val: v === null ? "null" : v ? "true" : "false" }); return this; }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this._f("eq", k, v); return this; }
  not(c: string, op: string, v: any) {
    if (op === "is") { this._filters.push({ kind: "isRaw", col: c, val: v === null ? "null" : v ? "true" : "false", neg: true }); return this; }
    const sql = OP_SQL[op]; if (!sql) throw new Error(`pgClient: unsupported .not operator "${op}"`);
    this._filters.push({ kind: "op", col: c, op: "not:" + op, val: v }); return this;
  }
  or(expr: string) {
    // "col.eq.val,col2.gte.val2" -> (col = val OR col2 >= val2). Values are literals here.
    const parts = expr.split(",").map((seg) => {
      const [c, o, ...rest] = seg.split(".");
      const raw = rest.join(".");
      const sql = OP_SQL[o]; if (!sql) throw new Error(`pgClient: unsupported .or operator "${o}"`);
      return { c, sql, raw };
    });
    this._filters.push({ kind: "raw", sql: "(" + parts.map((p, i) => `${col(p.c)} ${p.sql} $OR${i}`).join(" or ") + ")", params: parts.map((p) => p.raw) });
    return this;
  }
  private _f(op: string, c: string, v: any) { this._filters.push({ kind: "op", col: c, op, val: v }); return this; }

  // ── ordering / paging ─────────────────────────────────────────────────────
  order(c: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const nulls = opts?.nullsFirst === true ? " nulls first" : opts?.nullsFirst === false ? " nulls last" : "";
    this._order.push(`${col(c)} ${dir}${nulls}`); return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(from: number, to: number) { this._offset = from; this._rangeTo = to; return this; }
  single() { this._single = "one"; return this; }
  maybeSingle() { this._single = "maybe"; return this; }

  // ── build + run ───────────────────────────────────────────────────────────
  // WHERE clause, appending bound params to the caller's array (so ordering
  // composes with any preceding SET/VALUES params). Reused by build() + count.
  private whereSql(params: any[]): string {
    const p = (v: any) => { params.push(v); return "$" + params.length; };
    if (!this._filters.length) return "";
    const clauses = this._filters.map((f) => {
      if (f.kind === "isRaw") return `${col(f.col)} is ${f.neg ? "not " : ""}${f.val}`;
      if (f.kind === "raw") { let s = f.sql; f.params.forEach((v, i) => { s = s.replace("$OR" + i, p(v)); }); return s; }
      if (f.op === "in") return `${col(f.col)} = any(${p(f.val)})`;
      if (f.op.startsWith("not:")) { const o = f.op.slice(4); return `not (${col(f.col)} ${OP_SQL[o]} ${p(f.val)})`; }
      return `${col(f.col)} ${OP_SQL[f.op]} ${p(f.val)}`;
    });
    return " where " + clauses.join(" and ");
  }

  private build(): { text: string; params: any[] } {
    const params: any[] = [];
    const p = (v: any) => { params.push(v); return "$" + params.length; };
    const where = () => this.whereSql(params);
    const T = q(this._table);
    const ret = () => (this._action !== "select" && (this._returning || this._single) ? " returning *" : "");

    if (this._action === "select") {
      let text = `select ${this._cols} from ${T}${where()}`;
      if (this._order.length) text += " order by " + this._order.join(", ");
      if (this._limit != null) text += ` limit ${Number(this._limit)}`;
      if (this._offset != null) text += ` offset ${Number(this._offset)}` + (this._rangeTo != null ? ` limit ${Number(this._rangeTo) - Number(this._offset) + 1}` : "");
      return { text, params };
    }
    if (this._action === "delete") return { text: `delete from ${T}${where()}${ret()}`, params };
    if (this._action === "update") {
      const sets = Object.entries(this._set || {}).map(([k, v]) => `${q(k)} = ${p(v)}`);
      return { text: `update ${T} set ${sets.join(", ")}${where()}${ret()}`, params };
    }
    // insert / upsert
    const cols = Array.from(new Set(this._values.flatMap((r) => Object.keys(r))));
    const valuesSql = this._values.map((r) => "(" + cols.map((c) => p(r[c] === undefined ? null : r[c])).join(", ") + ")").join(", ");
    let text = `insert into ${T} (${cols.map(q).join(", ")}) values ${valuesSql}`;
    if (this._action === "upsert") {
      const conflict = (this._onConflict || "id").split(",").map((s) => q(s.trim())).join(", ");
      const upd = cols.filter((c) => !(this._onConflict || "id").split(",").map((s) => s.trim()).includes(c)).map((c) => `${q(c)} = excluded.${q(c)}`);
      text += ` on conflict (${conflict}) do ${upd.length ? "update set " + upd.join(", ") : "nothing"}`;
    }
    text += ret();
    return { text, params };
  }

  private async run(): Promise<Result<T>> {
    // Count mode — supabase .select(cols, { count, head }). Returns { count } and,
    // unless head:true, the rows too.
    if (this._count) {
      try {
        const cparams: any[] = [];
        const w = this.whereSql(cparams);
        const cr = await query(`select count(*)::int as c from ${q(this._table)}${w}`, cparams);
        const count = (cr.rows[0] as any)?.c ?? 0;
        if (this._head) return { data: [] as any, error: null, count };
        const b = this.build();
        const rr = await query(b.text, b.params);
        return { data: rr.rows as any, error: null, count };
      } catch (e: any) {
        return { data: null as any, error: { message: e?.message || "count error", code: e?.code }, count: null };
      }
    }
    let built: { text: string; params: any[] };
    try { built = this.build(); } catch (e: any) { return { data: null as any, error: { message: e?.message || "build error" } }; }
    try {
      const r = await query(built.text, built.params);
      const rows = r.rows as Row[];
      if (this._single === "one") {
        if (rows.length !== 1) return { data: null as any, error: { message: `expected 1 row, got ${rows.length}`, code: "PGRST116" } };
        return { data: rows[0] as any, error: null };
      }
      if (this._single === "maybe") {
        if (rows.length > 1) return { data: null as any, error: { message: `expected ≤1 row, got ${rows.length}`, code: "PGRST114" } };
        return { data: (rows[0] ?? null) as any, error: null };
      }
      // mutating actions with neither .select() nor cardinality → supabase returns data:null
      if (this._action !== "select" && !this._returning) return { data: null as any, error: null };
      return { data: rows as any, error: null };
    } catch (e: any) {
      return { data: null as any, error: { message: e?.message || "query error", code: e?.code } };
    }
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export type PgClient = {
  from<T = any>(table: string): Builder<T>;
  rpc<T = any>(fn: string, args?: Record<string, any>): Promise<Result<T>>;
};

export function pgClient(): PgClient {
  return {
    from<T = any>(table: string) { return new Builder<T>(table); },
    async rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<Result<T>> {
      const keys = Object.keys(args);
      const params = keys.map((k) => args[k]);
      const call = keys.length ? `${q(fn)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})` : `${q(fn)}()`;
      try {
        const r = await query(`select * from ${call}`, params);
        return { data: r.rows as any, error: null };
      } catch (e: any) {
        return { data: null as any, error: { message: e?.message || "rpc error", code: e?.code } };
      }
    },
  };
}
