# cookiedoh.co.id → Google Cloud (Cloud SQL) — migration scope

**Question (G, via POS room):** can we merge cookiedoh.co.id's database into Google
Cloud like the back-office + TBS webcommerce, off Supabase?

**Answer:** Yes — it's possible, but it's a *real project*, not a config flip. Honest
sizing below. Verified against the live code on 2026-07-07.

---

## What cookiedoh.co.id uses Supabase for (measured)

| Layer | Usage | Migration difficulty |
|---|---|---|
| **Database** (Postgres) | ~25 tables (orders, customers, subscriptions, location_stock, promos, VIP, OTPs, …). Small data. | 🟢 Easy — hours |
| **Data access** | **305 `supabase-js` query call sites** across **69 files / 71 API routes** | 🟡 Bulk work — ~1 week |
| **Auth** (login) | **Supabase Auth**: email+password, **Google sign-in**, sessions/JWT, password reset (43 auth call sites) | 🔴 The crux — ~1–2 weeks + user migration |
| **Storage / Realtime** | **None** — nothing to migrate ✅ | — |
| **RLS** (row security) | **64 of 71 routes use the service-role key** → app gates in code, doesn't rely on RLS for the hot path | 🟢 Little to port |

## The three pieces of work

**1. Move the data — easy (hours).**
`pg_dump` the ~25 tables → restore into a new `cookiedoh` database on the existing
`tbs-retail` Cloud SQL instance (same instance the back-office/TBS use). Data is small.

**2. Swap the data layer — the bulk (~1 week).**
Rewrite 305 `supabase-js` queries (`.from().select().eq()…`) to raw `pg` SQL,
route-by-route, each re-tested. Mechanical but voluminous. Helped by the fact that
64/71 routes already use the service role — straight table access, no RLS policies to
re-create.

**3. Replace Supabase Auth — the real risk (~1–2 weeks + user migration).**
Supabase Auth is a *managed service* (Google OAuth, password hashing, JWT sessions,
password-reset emails). Cloud SQL is just Postgres — it has none of that. We'd stand up
our own auth (Auth.js/NextAuth or Lucia) on Cloud SQL, then **migrate existing members
so nobody loses their login**:
- Password users: Supabase bcrypt hashes are exportable → importable (no forced reset).
- Google users: re-link by email on first sign-in.
- Phone OTP: already ours (`phone_otps` table) — no change.

> **Ties into G's 2026-07-04 ruling:** `tbs_retail.member` is the single source of truth
> for membership (points/tier), via the TBS partner API. So the new login layer should
> *authenticate*, then key the member to `tbs_retail.member` — not re-implement membership
> standalone. This migration and that ruling are the same project. (POS room is right.)

## Timing & downtime

- Cutover = freeze writes → final dump → restore → flip env → redeploy = a **short
  maintenance window (~1–2h)**.
- 🎯 **Best-possible timing: the site is ALREADY on holiday (catalog mode, no ordering)
  until September 2026.** Doing the migration *now, during the break* means near-zero
  customer impact — no live orders to interrupt, browsing can tolerate a brief blip. This
  de-risks the whole thing.

## Rough total effort

**~2–4 weeks of focused work** (data: hours · data-layer swap: ~1wk · auth + user
migration: ~1–2wk · testing). Main risk = the auth/user-migration (existing member
logins). Everything else is low-risk.

## Recommendation

If the goal is "one Cloud SQL instance for everything," it's worth doing — and the holiday
break is the ideal window. But it's a 2–4 week project with a real auth-migration risk, so
it shouldn't jump ahead of the POS go-live unless G wants it to. **Her call on priority.**
