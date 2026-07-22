// web/lib/memberAuthServer.ts — server-side member auth against the self-hosted
// auth_user table (Cloud SQL). Verifies credentials / Google, then issues a
// memberSession JWT. All reads/writes go through the pg shim (supaAdmin); anon
// can't touch auth_user (RLS-locked), only the service role here.
import bcrypt from "bcryptjs";
import { supaAdmin } from "@/lib/supaAdmin";
import { issueSession, type SessionUser } from "@/lib/memberSession";
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
