// web/lib/memberAuth.ts
"use client";

import { getSupabaseBrowser } from "./supabaseBrowser";
import { canonicalPhone } from "./phone";
import { setMemberToken } from "./memberBrowser";

// Members log in with email + password (or Google). Phone is collected at
// signup and stored on the account — it's the membership / loyalty key.
//
// Flag-gated for the Cloud SQL cutover: NEXT_PUBLIC_AUTH_SELFHOSTED=1 → our own
// /api/auth/* + memberSession token; OFF → Supabase Auth, unchanged.
const SELF = process.env.NEXT_PUBLIC_AUTH_SELFHOSTED === "1";

function emailValid(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
}

async function postAuth(url: string, body: any): Promise<any> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ error: "Sign-in failed." }));
  } catch {
    return { error: "Network error. Please check your connection and try again." };
  }
}

export async function signUpWithEmail(email: string, password: string, name: string, phone: string) {
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (!canonicalPhone(phone)) return { error: "Enter a valid phone (08… or +628…)." };
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };

  if (SELF) {
    const r = await postAuth("/api/auth/signup", { email, password, name, phone });
    if (r?.error) return { error: r.error };
    setMemberToken(r.access_token);
    return { data: { ok: true } };
  }
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name?.trim() || null, phone: canonicalPhone(phone) } },
  });
  if (error) return { error: error.message };
  return { data };
}

export async function signInWithEmail(email: string, password: string) {
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (SELF) {
    const r = await postAuth("/api/auth/login", { email, password });
    if (r?.error) return { error: r.error };
    setMemberToken(r.access_token);
    return { data: { ok: true } };
  }
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: error.message };
  return { data };
}

// Self-hosted Google: the login page (Google Identity Services) hands us the
// Google ID token; we exchange it for a member session. See app/account/login.
export async function signInWithGoogleToken(idToken: string) {
  const r = await postAuth("/api/auth/google", { id_token: idToken });
  if (r?.error) return { error: r.error };
  setMemberToken(r.access_token);
  return { data: { ok: true } };
}

export async function signInWithGoogle() {
  // OFF mode: Supabase hosted OAuth redirect. SELF mode uses GIS in the login
  // page (signInWithGoogleToken), so this is a guarded no-op there.
  if (SELF) return { error: "Use the Google button." };
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/account` },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signOutMember() {
  if (SELF) { setMemberToken(null); return; }
  // scope:"local" clears the session on THIS device without a global network
  // revoke — so a broken/unreachable session can't make sign-out hang. Never throws.
  try {
    await getSupabaseBrowser().auth.signOut({ scope: "local" });
  } catch {
    /* ignore — callers also force-clear local storage */
  }
}

// Forgot password: email the member a reset link that lands on /account/reset.
export async function requestPasswordReset(email: string) {
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (SELF) {
    // Always resolves ok (never reveal whether an email exists).
    await postAuth("/api/auth/reset/request", { email });
    return {};
  }
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/account/reset`,
  });
  if (error) return { error: error.message };
  return {};
}

// Set a new password (called on /account/reset once the recovery link has
// established a session, or for a signed-in member changing their password).
export async function updatePassword(password: string, resetToken?: string) {
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };
  if (SELF) {
    const r = await postAuth("/api/auth/reset/set", { password, token: resetToken || null });
    if (r?.error) return { error: r.error };
    if (r?.access_token) setMemberToken(r.access_token);
    return {};
  }
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return {};
}
