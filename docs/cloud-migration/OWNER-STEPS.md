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
| `GOOGLE_CLIENT_ID` | ‹the Client ID from the Google step› | the Google step below |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ‹the SAME Client ID› | the Google step below |

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

## The Google step (REQUIRED — do not skip)

⚠️ **6 of your 8 members sign in with Google only** (they have no password). If this
step isn't done before go-live, those 6 cannot log in until they do a password reset.
So we set this up. You need the Cookie Doh Google account.

1. https://console.cloud.google.com/apis/credentials → project `tbs-group-500303`.
2. **+ CREATE CREDENTIALS → OAuth client ID** → type *Web application*, name `Cookie Doh web`.
3. **Authorized JavaScript origins** — add both: `https://www.cookiedoh.co.id` and
   `https://cookiedoh.co.id`.
4. **Create** → copy the **Client ID** (ends `.apps.googleusercontent.com`) into the two
   `GOOGLE_CLIENT_ID` rows above. (You do NOT need the client secret.)

---

## Then

Tell me when your data should be frozen for the ~20-min window. I hand infra the final
data dump → they load it → I walk you through the 3 switches + redeploy → we test every
login and data path before anything is public. If anything's off, we flip back instantly.
