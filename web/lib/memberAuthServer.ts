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
import { sendWhatsApp } from "@/lib/whatsapp";
import crypto from "crypto";

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

/** Set or change the password for an ALREADY signed-in member (identity is proven
 *  by their session, so this is how a Google-only account adds a first password —
 *  the "forgot password" flow can't, since there's nothing to reset). First-time
 *  set needs no current password; changing an existing one requires it. Bumps
 *  token_version (revoking other sessions + any outstanding reset tokens) and
 *  returns a FRESH session token so the caller stays logged in here. */
export async function setMemberPassword(userId: string, newPassword: string, currentPassword?: string): Promise<{ token?: string; error?: string }> {
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  const supa = supaAdmin();
  const { data } = await supa.from("auth_user").select("*").eq("id", userId).limit(1);
  const row = data?.[0];
  if (!row) return { error: "Account not found — please sign in again." };
  if (row.password_hash) {
    const ok = await bcrypt.compare(currentPassword || "", row.password_hash).catch(() => false);
    if (!ok) return { error: "Your current password is incorrect." };
    if (currentPassword === newPassword) return { error: "Choose a password different from your current one." };
  }
  const password_hash = await bcrypt.hash(newPassword, 10);
  const nextTv = tvOf(row) + 1; // revoke other sessions + any outstanding reset tokens
  const { error } = await supa.from("auth_user")
    .update({ password_hash, token_version: nextTv, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: "Couldn't update your password. Please try again." };
  return { token: await issueSession(toSessionUser(row), nextTv) };
}

// ── Password reset via WhatsApp OTP ──────────────────────────────────────────
// Phone is the membership key (mandatory; email is optional), so a WhatsApp code
// is the primary recovery path. Both halves reuse the signup OTP store
// (phone_otps) and end at the SAME single-use reset token the email link carries,
// so /account/reset?token=… and /api/auth/reset/set are shared unchanged.

const shaCode = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Exact match on canonical phone (the membership key). */
async function findByPhone(supa: any, phone: string) {
  const { data } = await supa.from("auth_user").select("*").eq("phone", phone).limit(1);
  return data?.[0] || null;
}

/** Send a WhatsApp OTP so a PASSWORD account can reset via phone. Silent about
 *  whether the number maps to an account (privacy); only accounts that actually
 *  have a password get a code (Google-only / unknown numbers get nothing, so this
 *  can't be used to spam an arbitrary number). Mirrors the signup OTP send's 45s
 *  throttle + 5-attempt lockout. */
export async function requestPhoneReset(phone: string): Promise<{ ok: boolean; throttled?: boolean; error?: string }> {
  const p = canonicalPhone(phone);
  if (!p) return { ok: false, error: "Enter a valid phone (08… or +628…)." };
  if (!process.env.FONNTE_TOKEN) return { ok: false, error: "WhatsApp reset isn't available right now." };
  const supa = supaAdmin();
  const row = await findByPhone(supa, p);
  if (!row?.password_hash) return { ok: true }; // no password account on this number — stay silent
  const { data: existing } = await supa.from("phone_otps").select("last_sent_at, expires_at, attempts").eq("phone", p).maybeSingle();
  if (existing?.last_sent_at && Date.now() - new Date(existing.last_sent_at).getTime() < 45_000)
    return { ok: false, throttled: true, error: "Please wait a moment before requesting another code." };
  // Don't mint a fresh code while the current one is valid and already burned its
  // 5 attempts — otherwise "5 guesses → resend → 5 guesses" brute-forces 6 digits.
  if (existing && Number(existing.attempts) >= 5 && existing.expires_at && new Date(existing.expires_at).getTime() > Date.now())
    return { ok: false, throttled: true, error: "Too many attempts on the current code. Wait a few minutes and try again." };
  const code = String(crypto.randomInt(100000, 1000000)); // CSPRNG 6-digit
  const now = new Date();
  const { error } = await supa.from("phone_otps").upsert(
    { phone: p, code_hash: shaCode(code), expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(), verified: false, attempts: 0, last_sent_at: now.toISOString() },
    { onConflict: "phone" }
  );
  if (error) return { ok: false, error: "Couldn't start the reset. Please try again." };
  const sent = await sendWhatsApp({ to: p, message: `Your Cookie Doh password reset code is ${code}. It expires in 5 minutes. If you didn't request this, ignore this message. 🍪` });
  if (!sent.ok) return { ok: false, error: "Couldn't send the WhatsApp code. Please try again." };
  return { ok: true };
}

/** Verify a WhatsApp reset code → a short-lived reset token (the same token the
 *  email link carries). The code is consumed on success so it can't mint another;
 *  the token itself is still single-use (token_version is bumped when the password
 *  is actually set). */
export async function verifyPhoneReset(phone: string, code: string): Promise<{ token?: string; error?: string }> {
  const p = canonicalPhone(phone);
  const c = String(code || "").trim();
  if (!p || !/^\d{6}$/.test(c)) return { error: "Enter the 6-digit code." };
  const supa = supaAdmin();
  const { data: otp } = await supa.from("phone_otps").select("code_hash, expires_at, attempts").eq("phone", p).maybeSingle();
  if (!otp) return { error: "Request a code first." };
  if (new Date(otp.expires_at).getTime() < Date.now()) return { error: "Code expired — request a new one." };
  if (Number(otp.attempts) >= 5) return { error: "Too many tries — request a new code." };
  if (shaCode(c) !== otp.code_hash) {
    await supa.from("phone_otps").update({ attempts: Number(otp.attempts) + 1 }).eq("phone", p);
    return { error: "Incorrect code." };
  }
  const row = await findByPhone(supa, p);
  await supa.from("phone_otps").delete().eq("phone", p); // consume on success
  if (!row?.password_hash) return { error: "This reset request is no longer valid — start again." };
  return { token: await issueResetToken(String(row.id), tvOf(row)) };
}
