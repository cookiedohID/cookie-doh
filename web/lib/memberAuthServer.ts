// web/lib/memberAuthServer.ts — server-side member auth against the self-hosted
// auth_user table (Cloud SQL). Verifies credentials / Google, then issues a
// memberSession JWT. All reads/writes go through the pg shim (supaAdmin); anon
// can't touch auth_user (RLS-locked), only the service role here.
import bcrypt from "bcryptjs";
import { supaAdmin } from "@/lib/supaAdmin";
import { issueSession, issueResetToken, verifyResetToken, type SessionUser } from "@/lib/memberSession";
import { verifyGoogleIdToken } from "@/lib/googleAuth";
import { canonicalPhone } from "@/lib/phone";

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
const toSessionUser = (row: any): SessionUser => ({
  id: String(row.id),
  email: row.email || null,
  user_metadata: { name: row.name || null, phone: row.phone || null },
});

async function findByEmail(supa: any, email: string) {
  const { data } = await supa.from("auth_user").select("*").ilike("email", email.trim()).limit(1);
  return data?.[0] || null;
}

/** Email + password → session token (or error). Generic error text avoids leaking which half is wrong. */
export async function loginWithPassword(email: string, password: string): Promise<{ token?: string; error?: string }> {
  if (!emailValid(email)) return { error: "Incorrect email or password." };
  const supa = supaAdmin();
  const row = await findByEmail(supa, email);
  if (!row?.password_hash) return { error: "Incorrect email or password." };
  const ok = await bcrypt.compare(password, row.password_hash).catch(() => false);
  if (!ok) return { error: "Incorrect email or password." };
  return { token: await issueSession(toSessionUser(row)) };
}

/** Google ID token → session token. Links to an existing account by google_sub then email; else creates one. */
export async function loginWithGoogle(idToken: string): Promise<{ token?: string; error?: string }> {
  const g = await verifyGoogleIdToken(idToken);
  if (!g || !g.email || !g.emailVerified) return { error: "Google sign-in failed." };
  const supa = supaAdmin();
  let { data } = await supa.from("auth_user").select("*").eq("google_sub", g.sub).limit(1);
  let row = data?.[0] || null;
  if (!row) {
    row = await findByEmail(supa, g.email);
    if (row) await supa.from("auth_user").update({ google_sub: g.sub, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  if (!row) {
    const { randomUUID } = await import("crypto");
    const id = randomUUID();
    await supa.from("auth_user").insert({ id, email: g.email, name: g.name, google_sub: g.sub });
    row = { id, email: g.email, name: g.name, phone: null };
  }
  return { token: await issueSession(toSessionUser(row)) };
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
  return { token: await issueSession({ id, email: email.trim(), user_metadata: { name: name?.trim() || null, phone: cphone } }) };
}

/** Email a reset link. Best-effort + always silent (never reveals whether the
 *  email exists); only password accounts get a link (Google-only have nothing to reset). */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!emailValid(email)) return;
  const supa = supaAdmin();
  const row = await findByEmail(supa, email);
  if (!row?.email || !row.password_hash) return;
  const token = await issueResetToken(String(row.id));
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

/** Set a new password from a valid reset token → returns a fresh session (auto-login). */
export async function setPasswordWithResetToken(token: string, password: string): Promise<{ token?: string; error?: string }> {
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };
  const userId = await verifyResetToken(token);
  if (!userId) return { error: "This reset link is invalid or has expired — request a new one." };
  const supa = supaAdmin();
  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supa.from("auth_user").update({ password_hash, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) return { error: "Couldn't update your password. Please try again." };
  const { data } = await supa.from("auth_user").select("*").eq("id", userId).limit(1);
  const row = data?.[0];
  return { token: row ? await issueSession(toSessionUser(row)) : undefined };
}
