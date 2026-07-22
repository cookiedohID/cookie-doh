# cookiedoh.co.id → Cloud SQL — CUTOVER RUNBOOK

All code is built + tested + committed on branch `cloud-migration` (off `main`).
Everything is flag-gated: with the flags OFF the live site is 100% Supabase (today).
Cutover = load data + set env/flags + deploy + test, in one off-peak window (~1–2h)
during the holiday break. Data is tiny (100 KB), so the copy is minutes.

## Prerequisites (do BEFORE the window — no downtime)
- [ ] **A. Google OAuth client** (owner/infra — needs the Google account). In Google
      Cloud Console → Credentials → Create OAuth client ID → **Web application**.
      Authorized JavaScript origins: `https://www.cookiedoh.co.id`, `https://cookiedoh.co.id`.
      → yields a **Client ID** (public; goes in env as GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_CLIENT_ID).
- [ ] **B. AUTH_SESSION_SECRET** — generate ≥32 random chars (e.g. `openssl rand -base64 36`).
      Set as a Vercel encrypted env var (never in chat/commits).
- [ ] **C. Cloud SQL `cookiedoh` db** — schema of the 28 tables already loaded (infra ✅).
      Apply the `auth_user` TABLE DDL (the CREATE TABLE + indexes + RLS block of
      `002-auth_user.sql`; SKIP the `insert … from auth.users` — that ran on Supabase;
      Cloud SQL gets the rows from the data dump in step 2).
- [ ] **D. pg_cron instance restart** — provision/cutover AFTER it (per ERP room), so a
      restart doesn't bounce the load. Confirm with the Kurly switchboard.

## Window (off-peak, infra on standby)
1. **Freeze writes.** Storefront is already holiday/catalog (no orders). Confirm no
   in-flight admin writes. (Optional: brief maintenance flag.)
2. **Final data dump** from Supabase — ALL public tables incl auth_user + wa_messages:
   `pg_dump "$SUPABASE_DATABASE_URL" --data-only --schema=public --no-owner --no-privileges -f cd-data.sql`
3. **Load into Cloud SQL** as `cookiedoh_app` (infra runs / supervises, off-peak):
   `psql "cookiedoh_app@…/cookiedoh" -f cd-data.sql`  → verify counts (orders 41, customers 8, auth_user 8).
4. **Set Vercel env** (infra, encrypted):
   - `DATABASE_URL = postgresql://cookiedoh_app:<secret>@34.101.241.32:5432/cookiedoh?sslmode=require`
   - `AUTH_SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `AUTH_SELFHOSTED=1`, `NEXT_PUBLIC_AUTH_SELFHOSTED=1`
5. **Infra: enforce SSL** server-side on the instance (public-facing app password).
6. **Deploy** — merge `cloud-migration` → `main` (or deploy the branch). Note: main
   already carries the security hardening (c478055) + keep-awake; the merge is clean.
7. **E2E test** (staff first, then a real member):
   - browse catalog · member sign-in (Google **and** password) · /account loads · My Orders
     loads · checkout shows holiday splash · admin loads + an order edit writes to Cloud SQL.
   - Confirm reads/writes hit Cloud SQL (not Supabase). Confirm a login issues a memberSession
     token (not a Supabase token).
8. **Post-cutover:** remove the `keep-awake` cron (Cloud SQL never pauses); leave Supabase
   read-only for a few days as a safety net, then decommission. Reconcile: cherry-pick any
   remaining app-gate bits already handled; branch `security/leak-rls-and-hardening` is merged.

## Rollback (if step 7 fails)
Flip the 3 env groups back — `DATABASE_URL` → Supabase, `AUTH_SELFHOSTED` +
`NEXT_PUBLIC_AUTH_SELFHOSTED` unset — and redeploy. Because writes were frozen, no data
diverged; the site returns to exactly today's state.

## What's already DONE (code)
Data layer: 64 routes on the pg shim (P2) · Auth: auth_user + 8-user migration (UUIDs
preserved), memberSession JWT, login/signup/google/reset routes, GIS button, 7 client files
swapped — all flag-gated, full app typechecks, server auth roundtrip tested.
