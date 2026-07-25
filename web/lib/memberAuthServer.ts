// web/lib/memberAuthServer.ts — server-side member auth against the self-hosted
// auth_user table (Cloud SQL). Verifies credentials / Google, then issues a
// memberSession JWT. All reads/writes go through the pg shim (supaAdmin); anon
// can't touch auth_user (RLS-locked), only the service role here.
//
// Security notes (post-review hardening):
//  • findByEmail escapes LIKE metacharacters so an email can't act as a wildcard.
//  • loginWithPassword runs a constant-time bcrypt on the miss path (no timing
//    oracle for account existence).
//  • loginWithGoogle treats Google as proof of email ownership: on merge-by-email
//    it CLEARS any pre-existing password + bumps token_version — this defuses the
//    classic-federated pre-hijack (an attacker who pre-created a password row for
//    someone else's email loses it the moment the real owner signs in with Google;
//    a password-reset by the real email owner likewise replaces the hash + bumps
//    the version). FOLLOW-UP: add email-confirmation on password signup.
//  • token_version: bumped on every password change → outstanding reset tokens and
//    session JWTs for that user are rejected (single-use resets + revocation).
import bcrypt from "bcryptjs";
import { supaAdmin } from "@/lib/supaAdmin";
import { issueSession, issueResetToken, verifyResetToken, type SessionUser } from "@/lib/memberSession";
import { verifyGoogleIdToken } from "@/lib/googleAuth";
import { canonicalPhone } from "@/lib/phone";

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
// Fixed hash to compare against when no account matches, so response time doesn't
// reveal whether the email exists.
const DUMMY_HASH = bcrypt.hashSync("cookie-doh-timing-guard", 10);

const toSessionUser = (row: any): SessionUser => ({
  id: String(row.id),
  email: row.email || null,
  user_metadata: { name: row.name || null, phone: row.phone || null },
});
const tvOf = (row: any): number => Number(row?.token_version ?? 0);

// Exact, case-insensitive match — escape LIKE wildcards so `%`/`_` in the input
// can't match another account.
async function findByEmail(supa: any, email: string) {
  const esc = email.trim().replace(/([%_\\])/g, "\\$1");
  const { data } = await supa.from("auth_user").select("*").ilike("email", esc).limit(1);
  return data?.[0] || null;
}

/** Email + password → session token (or error). Generic error avoids leaking which half is wrong. */
export async function loginWithPassword(email: string, password: string): Promise<{ token?: string; error?: string }> {
  if (!emailValid(email)) { await bcrypt.compare(password, DUMMY_HASH).catch(() => false); return { error: "Incorrect email or password." }; }
  const supa = supaAdmin();
  const row = await findByEmail(supa, email);
  // Always run one bcrypt compare (constant-time), against a dummy hash on a miss.
  const ok = await bcrypt.compare(password, row?.password_hash || DUMMY_HASH).catch(() => false);
  if (!row?.password_hash || !ok) return { error: "Incorrect email or password." };
  return { token: await issueSession(toSessionUser(row), tvOf(row)) };
}

/** Google ID token → session token. Links by google_sub, then email; else creates one. */
export async function loginWithGoogle(idToken: string): Promise<{ token?: string; error?: string }> {
  const g = await verifyGoogleIdToken(idToken);
  if (!g || !g.email || !g.emailVerified) return { error: "Google sign-in failed." };
  const supa = supaAdmin();
  let { data } = await supa.from("auth_user").select("*").eq("google_sub", g.sub).limit(1);
  let row = data?.[0] || null;
  if (!row) {
    row = await findByEmail(supa, g.email);
    if (row) {
      // Merge Google onto a pre-existing row. Google proved the email → make it
      // the source of truth: clear any password (defuse pre-hijack) + bump version.
      const nextTv = tvOf(row) + 1;
      await supa.from("auth_user")
        .update({ google_sub: g.sub, password_hash: null, token_version: nextTv, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      row = { ...row, google_sub: g.sub, password_hash: null, token_version: nextTv };
    }
  }
  if (!row) {
    const { randomUUID } = await import("crypto");
    const id = randomUUID();
    await supa.from("auth_user").insert({ id, email: g.email, name: g.name, google_sub: g.sub });
    row = { id, email: g.email, name: g.name, phone: null, token_version: 0 };
  }
  return { token: await issueSession(toSessionUser(row), tvOf(row)) };
}

/** Create an email+password account → session token. Phone is the membership key (verified later via OTP). */
export async function signupWithPassword(email: string, password: string, name: string, phone: string): Promise<{ token?: string; error?: string }> {
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };
  const cphone = canonicalPhone(phone);
  if (!cphone) return { error: "Enter a valid phone (08… or +628…)." };
  const supa = supaAdmin();
  if (await findByEmail(supa, email)) return { error: "An account with this email already exists — try signing in." };
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supa.from("auth_user").insert({ id, email: email.trim(), password_hash, name: name?.trim() || null, phone: cphone });
  if (error) return { error: "Couldn't create your account. Please try again." };
  return { token: await issueSession({ id, email: email.trim(), user_metadata: { name: name?.trim() || null, phone: cphone } }, 0) };
}

/** Email a reset link. Best-effort + always silent (never reveals whether the
 *  email exists); only password accounts get a link (Google-only have nothing to reset). */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!emailValid(email)) return;
  const supa = supaAdmin();
  const row = await findByEmail(supa, email);
  if (!row?.email || !row.password_hash) return;
  const token = await issueResetToken(String(row.id), tvOf(row));
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id";
  const link = `${base}/account/reset?token=${encodeURIComponent(token)}`;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Cookie Doh <onboarding@resend.dev>",
      to: row.email,
      subject: "Reset your Cookie Doh password 🍪",
      html: `<p>Tap below to set a new password (valid for 30 minutes):</p><p><a href="${link}">${link}</a></p><p>If you didn't ask for this, you can ignore this email.</p>`,
    });
  } catch { /* email is best-effort */ }
}

/** Set a new password from a valid reset token → fresh session. The token is
 *  single-use: its token_version must still match the account's (bumped on set). */
export async function setPasswordWithResetToken(token: string, password: string): Promise<{ token?: string; error?: string }> {
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };
  const r = await verifyResetToken(token);
  if (!r) return { error: "This reset link is invalid or has expired — request a new one." };
  const supa = supaAdmin();
  const { data: cur } = await supa.from("auth_user").select("*").eq("id", r.userId).limit(1);
  const row = cur?.[0];
  if (!row || tvOf(row) !== r.tv) return { error: "This reset link has already been used — request a new one." };
  const password_hash = await bcrypt.hash(password, 10);
  const nextTv = tvOf(row) + 1; // invalidates this link + any outstanding sessions
  const { error } = await supa.from("auth_user").update({ password_hash, token_version: nextTv, updated_at: new Date().toISOString() }).eq("id", r.userId);
  if (error) return { error: "Couldn't update your password. Please try again." };
  return { token: await issueSession(toSessionUser(row), nextTv) };
}
