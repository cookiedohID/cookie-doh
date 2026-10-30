# Go-live: what YOU paste into Vercel

Everything is built, tested and verified. The only things a person must do are the ones
that touch your passwords/accounts — for security the assistants cannot enter secrets or
create accounts. Hand this page to a developer you trust if you'd rather not.

🔒 Never paste a secret value into chat. Copy it straight from Secret Manager into Vercel.

There are **8 settings**. They split into two groups:

---

## GROUP A — safe to paste ANY TIME (they do nothing until go-live)

In Vercel → the **Cookie Doh** project → **Settings → Environment Variables**, add these
for **Production**. Pasting them changes NOTHING on the live site yet.

The database connection (4):

| Name | Value | Where the value comes from |
|------|-------|----------------------------|
| `GCP_SA_KEY` | ‹secret› mark **Sensitive** | Secret Manager `cookiedoh-web-sa-key-b64` |
| `DB_USER` | `cookiedoh_app` | type it |
| `DB_PASSWORD` | ‹secret› mark **Sensitive** | Secret Manager `cookiedoh-db-app-password` |
| `DB_NAME` | `cookiedoh` | type it |

The login secret + Google sign-in (3) — the Google ones need the **Google step** below first:

| Name | Value | Where the value comes from |
|------|-------|----------------------------|
| `AUTH_SESSION_SECRET` | ‹secret› mark **Sensitive** | Secret Manager `cookiedoh-auth-session-secret` |
| `GOOGLE_CLIENT_ID` | `1013588068326-lcgj7406sp1n19fd99fc21v8354f37co.apps.googleusercontent.com` | the "Cookie Doh web" client in the **TBS-Retail** project (done ✓) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `1013588068326-lcgj7406sp1n19fd99fc21v8354f37co.apps.googleusercontent.com` (the SAME value) | the "Cookie Doh web" client in the **TBS-Retail** project (done ✓) |

---

## GROUP B — the 3 GO-LIVE SWITCHES (we flip these TOGETHER at the end)

Do NOT add these until your data is loaded into the new database and I say go. The first
one, the moment it exists, points the live shop at the new database — so it waits.

| Name | Value |
|------|-------|
| `INSTANCE_CONNECTION_NAME` | `tbs-group-500303:asia-southeast2:cookiedoh-db` |
| `AUTH_SELFHOSTED` | `1` |
| `NEXT_PUBLIC_AUTH_SELFHOSTED` | `1` |

Leave your existing `DATABASE_URL` (the current Supabase one) exactly as-is — it is the
instant rollback: if anything looks wrong, we remove the 3 switches and you're back to
today's shop with nothing lost.

---

## The Google step — ✅ DONE (2026-10-29, corrected)

The live OAuth client is **"Cookie Doh web"** in the **TBS-Retail** Google project
(Client ID `1013588068326-lcgj7406sp1n19fd99fc21v8354f37co.apps.googleusercontent.com`),
Enabled, with `https://www.cookiedoh.co.id` and `https://cookiedoh.co.id` already in its
**Authorized JavaScript origins**.

⚠️ An earlier draft baked in a *different, dead* client
(`434566381838-…` in "My First Project"), which gave Google **"invalid_client / OAuth client
was not found"** on sign-in. Corrected 2026-10-29 by pointing both Google env vars at the
TBS-Retail client above and redeploying. Verified live: the login page now serves the
`1013…` client and `verifyGoogleIdToken` checks that same audience.

Why it mattered: **6 of your 8 members sign in with Google only** — without this they'd be
locked out until a password reset.

---

## Then

The new database is already loaded and verified byte-for-byte against live (all 37 tables,
2026-10-28). Once you've pasted the vars above, tell me — I do a final data refresh to
catch anything that changed in the last few minutes, take the code live, and test every
login + data path before anything is public. If anything's off, we flip back instantly.
