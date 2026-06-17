// web/lib/memberAuth.ts
"use client";

import { getSupabaseBrowser } from "./supabaseBrowser";
import { canonicalPhone } from "./phone";

// Members log in with email + password (or Google). Phone is collected at
// signup and stored on the user — it's the membership / loyalty key.

function emailValid(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
  phone: string
) {
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (!canonicalPhone(phone)) return { error: "Enter a valid phone (08… or +628…)." };
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters." };

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
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: error.message };
  return { data };
}

export async function signInWithGoogle() {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/account` },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signOutMember() {
  await getSupabaseBrowser().auth.signOut();
}
