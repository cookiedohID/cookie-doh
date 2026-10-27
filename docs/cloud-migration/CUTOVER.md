# cookiedoh.co.id → Cloud SQL — CUTOVER RUNBOOK

All code is built + tested + committed on branch `cloud-migration-v2` (off `main`).
Everything is flag-gated: with the flags OFF the live site is 100% Supabase (today).
Cutover = load data + set env/flags + deploy + test, in one off-peak window (~1h)
during the holiday break. Data is tiny (~230 KB), so the copy is minutes.

## Architecture (as of 2026-10-27 — supersedes the July direct-IP plan)
- The webstore gets its **OWN** Cloud SQL instance: `cookiedoh-db`
  (`tbs-group-500303:asia-southeast2:cookiedoh-db`, db-g1-small, PG18, ~$35/mo),
  credential-isolated from the ERP's `tbs-retail-db`. The `cookiedoh-web` service
  account can reach ONLY `cookiedoh-db` (403 on `tbs-retail-db` — verified).
- The app connects through the **Cloud SQL Language Connector** (IAM + a short-lived
  client cert on :3307). **No public IP, no authorized-network, no firewall rule, no
  PG_CA_CERT, no server-side SSL config** — the connector owns TLS. This is what
  removes the July blocker (serverless could not reach the public IP).
- Membership stays in `tbs_retail.member` (SSOT); the webstore reads it only via the
  token-gated partner API, never a direct cross-DB read.

## Prerequisites (do BEFORE the window — no downtime)
- [ ] **A. Google OAuth client** (owner/infra — needs the Google account). Google Cloud
      Console → Credentials → Create OAuth client ID → **Web application**.
      Authorized JS origins: `https://www.cookiedoh.co.id`, `https://cookiedoh.co.id`.
      → **Client ID** (public; env GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_CLIENT_ID).
- [ ] **B. AUTH_SESSION_SECRET** — ≥32 random chars (`openssl rand -base64 36`), set as
      a Vercel encrypted env var (never in chat/commits).
- [ ] **C. `cookiedoh-db` ready** (infra ✅ 2026-10-27): instance RUNNABLE; `cookiedoh`
      db + all 30 tables loaded from the ONE authoritative `cookiedoh-schema.sql`
      (regenerated from live — includes auth_user + auth_throttle with RLS; do NOT
      re-run `002-auth_user.sql`'s DDL). App role `cookiedoh_app` owns every table.
      Backups ON (30 retained, 01:00 WIB) + PITR ON (7 days). `connectorEnforcement
      =REQUIRED` + `sslMode=ENCRYPTED_ONLY` + `cloudsql.iam_authentication=on` live —
      so a plain connection string is refused; the connector is the only way in.
- [ ] **D. Secrets staged in Secret Manager** (infra ✅): `cookiedoh-web-sa-key-b64`
      (base64 SA key), `cookiedoh-db-app-password` (32-char app password),
      `cookiedoh-db-postgres-password` (admin). Owner copies the first two into Vercel.

## Window (off-peak, infra on standby)
1. **Freeze writes.** Storefront is already holiday/catalog (no orders). Confirm no
   in-flight admin writes. (Optional: brief maintenance flag.)
2. **Final data dump** from Supabase — all public tables incl auth_user, auth_throttle
   excluded:
   `pg_dump "$SUPABASE_DATABASE_URL" --data-only --schema=public --no-owner --no-privileges --exclude-table=auth_throttle -f cd-data.sql`
   (Last dump 2026-10-27: 47 orders / 13 customers / 8 auth_user; both sequences
   `orders_order_no_seq` + `stock_movements_id_seq` carry a setval.)
3. **Load into `cookiedoh-db`** as `cookiedoh_app` (infra runs/supervises, off-peak).
   Verify: counts match the dump AND each sequence `last_value` ≥ max(id). NOTE the
   `orders_order_no_seq` trap: `order_no` is TEXT (`CD-20261015-0148`) and the sequence
   feeds only the trailing 4 digits — compare `right(order_no,4)::int`, NOT a naive
   all-digits strip (that reads `202610150148` and cries false collision).
4. **Set Vercel env** (owner, pasting Secret Manager values — infra does NOT paste):
   - `INSTANCE_CONNECTION_NAME = tbs-group-500303:asia-southeast2:cookiedoh-db`
   - `GCP_SA_KEY` = base64 SA key (Sensitive) — from `cookiedoh-web-sa-key-b64`
   - `DB_USER = cookiedoh_app`
   - `DB_PASSWORD` = from `cookiedoh-db-app-password` (Sensitive)
   - `DB_NAME = cookiedoh`
   - `AUTH_SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `AUTH_SELFHOSTED=1`, `NEXT_PUBLIC_AUTH_SELFHOSTED=1`
   - (NO DATABASE_URL, NO PG_CA_CERT — the connector path does not use them in prod.)
5. **Deploy** — merge `cloud-migration-v2` → `main`. `vercel.json` pins functions to
   `sin1` (Singapore, nearest to asia-southeast2). Main already carries the security
   hardening + the holiday/catalog state; the merge is clean.
6. **E2E test** (staff first, then a real member):
   - browse catalog · member sign-in (Google **and** password) · /account loads ·
     My Orders loads · checkout shows holiday splash · admin loads + an order edit
     writes to Cloud SQL.
   - Confirm reads/writes hit `cookiedoh-db` (not Supabase). Confirm a login issues a
     memberSession JWT (not a Supabase token).
7. **Post-cutover:** remove the `keep-awake` cron (Cloud SQL never pauses); leave
   Supabase read-only for a few days as a safety net, then decommission.

## Rollback (if step 6 fails)
Unset `INSTANCE_CONNECTION_NAME` (code falls back to `DATABASE_URL` → Supabase) and
unset `AUTH_SELFHOSTED` + `NEXT_PUBLIC_AUTH_SELFHOSTED`, then redeploy. Because writes
were frozen, no data diverged; the site returns to exactly today's state.

## Durable watch-items (do not let these silently drift)
- **IAM scope** — `cookiedoh-web`'s grant must stay pinned to `cookiedoh-db` only.
  If it ever widens to a project-level Cloud SQL role, the credential isolation from
  `tbs-retail-db` is gone. Re-verify after any IAM change.
- **Backups + PITR** — must stay ON per-instance on `cookiedoh-db` (it is in infra's
  create command). This is the owner's "backup database also" requirement.
- **SA key rotation** — two never-rotated keys to track with an owner + rotation date:
  `tbs-till` and `cookiedoh-web`.

## What's already DONE (code)
Data layer: 64 routes on the pg shim · Cloud SQL Connector path in `lib/db.ts`
(+ DATABASE_URL dev fallback) · `vercel.json` sin1 pin · Auth: auth_user + 8-user
migration (UUIDs preserved), memberSession JWT (token_version revocation),
login/signup/google/reset routes hardened (9 vulns fixed), GIS button, client files
swapped — all flag-gated, full app typechecks (0 errors) + production build passes.
