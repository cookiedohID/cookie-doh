# cookiedoh.co.id → Cloud SQL — execution plan

**Status:** STARTED 2026-07-07 (G said "do it now", during the holiday break).
**Schema:** `docs/cloud-migration/cookiedoh-schema.sql` (28 tables, dumped from Supabase).

## Reality check (measured 2026-07-07)
- **Data is tiny:** 41 orders, 8 customers, 0 subscriptions → data move is trivial, and
  migrating existing member logins is only **8 users** (near-zero risk — the scariest part
  of the original estimate basically evaporates).
- **Site is on holiday** (catalog mode, no ordering) → migrate with ~zero customer impact.
- Local `DATABASE_URL` gives direct Supabase Postgres access → can dump + test against the
  real DB, repoint to Cloud SQL at the end.

**Revised effort: ~1.5–2.5 weeks focused** (was 2–4; the tiny data + 8 users lower it).

## Phases

**P0 — Provision (infra, gating). ✅ DONE 2026-07-07.** `cookiedoh` database created on
`tbs-retail-db` (separate DB, not a schema), owner = least-privilege role `cookiedoh_app`,
password in Secret Manager (`cookiedoh-db-password`, proj tbs-group-500303 — NEVER paste in
chat/commits). Schema loaded — verified 28 public tables present, role connects end-to-end
via cloud-sql-proxy (`tbs-group-500303:asia-southeast2:tbs-retail-db`).

**P1 — Data layer foundation (me, no collision).** Add `pg` driver + `lib/db.ts` (pooled
`query()` helper + a thin `sb`-compatible shim so the 305 call sites convert mechanically).
Prove the pattern on 2–3 read routes against the live DB.

> **Approach DECIDED: compatibility shim (not 305 hand-rewrites).** The used Supabase query
> surface is a bounded subset — measured across the app: `select insert update upsert delete`
> + filters `eq neq gt gte lt lte in is like ilike or not match` + `order limit range` +
> `single maybeSingle` + `rpc` (2 uses). A `pg`-backed query builder that reproduces this
> chain lets each route keep `.from(t).select().eq()…` almost verbatim — swap only the client
> factory (`supaAdmin()`/`getSupabaseBrowser()`), not the 305 call sites. One well-tested shim
> beats 305 error-prone hand conversions. Server-side first (service-role routes); the browser
> client is auth-only and goes with P3.

**P2 — Convert the service routes → pg. ✅ DONE 2026-07-07.** All 64/64 API routes swapped
from a local Supabase service client to the shared `supaAdmin()` (data → pg shim, .auth →
Supabase until P3), via an 8-way fan-out. Shim extended with the `.select(cols,{count,head})`
count option. Verified: full typecheck clean; count + JSON-arrow (`meta->` `.not`/`.is`)
filters return correct rows against the live DB. (One dead `/*…*/` block in lalamove still
name-drops createClient — harmless, commented out.) Only supabase-js left: auth (P3) + the
keep-awake ping. NOTE: not yet cut over — DATABASE_URL still points at Supabase Postgres for
differential testing; P4 repoints it to Cloud SQL.

**P3 — Replace Supabase Auth.** 🔨 IN PROGRESS.
- ✅ FOUNDATION (tested): `lib/memberSession` — jose HS256 JWT issue/verify returning the
  EXACT Supabase user shape `{id,email,user_metadata:{name,phone}}`, so memberServer + the 12
  `supaAdmin().auth.getUser` sites stay unchanged when the hybrid `.auth` is repointed here.
  jose + bcryptjs installed. AUTH_SESSION_SECRET (≥32 chars) — dev one in .env.local; PROD one
  must be set as a Vercel env var at cutover (route via infra).
- MEASURED auth reality (8 users): **7 use Google**, 2 have bcrypt passwords, 4 have phone in
  metadata, 4 customers carry auth_user_id. So Google is the primary path.
- TODO: (a) `auth_user` table (id=SAME uuid as Supabase so customers.auth_user_id / phone_otps
  links survive; email, password_hash, name, phone, google_sub); (b) migrate the 8 users
  (export auth.users hashes + auth.identities google subs — verified readable via DATABASE_URL);
  (c) login API routes — email/pw (bcrypt) + Google (verify Google ID token via Google JWKS with
  jose) + reset; (d) repoint hybrid `.auth` → memberSession; (e) client: session store + swap the
  8 browser-auth files + login/reset pages + Google Identity Services button. Per G's 2026-07-04
  ruling, key the member to `tbs_retail.member` via the partner API.

**P4 — Cutover** (during holiday). Freeze → final `pg_dump` of data → load into Cloud SQL →
flip env (`DATABASE_URL` + drop Supabase keys) → deploy → smoke-test. ~1–2h window.

## Coordination
- **Infra (local_38b533b9):** owns Cloud SQL provisioning + the cutover data load.
- **Security session (local_09f15c03):** actively hardening Supabase RLS/proxy on
  `security/leak-rls-and-hardening` — this migration *supersedes* the Supabase-RLS parts, so
  we must sequence (their branch vs the migration branch) to avoid duplicated/conflicting
  work. Messaged.
- Work lands on a dedicated `cloud-migration` branch; main stays live (holiday mode).

## Hard rules (from the ERP/security session — tbs-retail is their prod money data)
- **Isolation:** storefront lives in its OWN `cookiedoh` db with its OWN role. `cookiedoh_app`
  must NEVER reach `inv_ledger`/`gl_journal`/ERP tables. (Verified: role owns only its db.)
- **Least-privilege is the DB belt:** on Cloud SQL there is no Supabase RLS, and 64/71 routes
  gate in code. So grant `cookiedoh_app` least-privilege on its own tables only — NO god-role.
  That least-privilege grant is the only DB-side defense left; keep it tight.
- **Cutover timing:** a one-time instance RESTART for pg_cron is pending G's window. Cut over
  (the ~1–2h data load) AFTER that restart, coordinated via the Kurly switchboard, so we don't
  get bounced. Provisioning is already done and is not restart-sensitive.

## Merge reconcile (at the end)
- c8ccf0a (#46 hold) + 9e7019b (promotion-expense) are ALREADY on main (54f4dd3, efae902) — safe.
- 6e5ebc3 (only commit still off main): its Supabase-RLS hunks DIE (correct supersede); its
  app-level route-gate / attack-surface closures CARRY — fold into the migration.

