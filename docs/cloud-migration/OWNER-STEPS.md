# Go-live: your 2 setup steps (≈15 minutes, one time)

The whole Google Cloud migration is built and tested. These are the only 2 steps
that a **person** must do, because they involve your **passwords / accounts** — for
security, the assistants (me + infra) are not allowed to enter credentials or create
accounts. You can do this yourself following the clicks below, or hand this page to a
developer you trust. When both are done, message **"staged"** and I do the rest
(copy the data → go live → test every login).

> 🔒 Do NOT paste any of these values into chat. Type them straight into the websites below.

---

## STEP 1 — Turn on "Sign in with Google" for the new system  (~7 min)

1. Open **https://console.cloud.google.com/apis/credentials** and sign in with the
   **Cookie Doh Google account**.
2. Top bar: make sure the **project** is the Cloud project for the site
   (if unsure, ask infra — it's `tbs-group-500303`).
3. If it says you must configure a **consent screen** first: choose **External**,
   app name **Cookie Doh**, put your email in the required fields, **Save and continue**
   through to the end.
4. Click **+ CREATE CREDENTIALS → OAuth client ID**.
5. **Application type:** *Web application*. **Name:** `Cookie Doh web`.
6. Under **Authorized JavaScript origins**, click **+ ADD URI** twice and add BOTH:
   - `https://www.cookiedoh.co.id`
   - `https://cookiedoh.co.id`
7. Click **Create**. A box shows a **Client ID** — a long string ending in
   `.apps.googleusercontent.com`. **Copy it** and keep it for Step 2.
   *(You do NOT need the "client secret".)*

---

## STEP 2 — Add the settings to the hosting dashboard (Vercel)  (~8 min)

1. Open **https://vercel.com** → the **Cookie Doh** project → **Settings → Environment
   Variables**.
2. Add each of these for **Production** (left = the Name, right = the Value):

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | `postgresql://cookiedoh_app:‹DB-PASSWORD›@34.101.241.32:5432/cookiedoh?sslmode=require` |
   | `AUTH_SESSION_SECRET` | ‹the value from Secret Manager `cookiedoh-auth-session-secret`› |
   | `GOOGLE_CLIENT_ID` | ‹the Client ID from Step 1› |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ‹the SAME Client ID from Step 1› |
   | `AUTH_SELFHOSTED` | `1` |
   | `NEXT_PUBLIC_AUTH_SELFHOSTED` | `1` |

   - For **‹DB-PASSWORD›**: replace it with the value in Google **Secret Manager**
     `cookiedoh-db-password` (infra can read it to you, or run
     `gcloud secrets versions access latest --secret=cookiedoh-db-password`).
   - For **‹the value from Secret Manager cookiedoh-auth-session-secret›**: same idea,
     `gcloud secrets versions access latest --secret=cookiedoh-auth-session-secret`.

3. **Save.** ⚠️ **Do NOT click "Redeploy" yet** — message me **"staged"** first. I copy
   the live data across, deploy in the right order, and test every login before it goes
   public. (If anything's off, we flip these back and nothing is lost.)

---

That's it. Everything else — copying your data, the go-live, and testing — is on me + infra.
