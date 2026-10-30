"use client";
// web/lib/memberBrowser.ts — client-side member session, flag-gated for the
// Cloud SQL cutover. NEXT_PUBLIC_AUTH_SELFHOSTED=1 → our own token in localStorage
// (issued by /api/auth/*, verified server-side by memberSession); OFF → Supabase
// browser session, unchanged. Every client auth read goes through here so the
// cutover is one flag flip (+ the server flag + DB repoint), all together.
import { getSupabaseBrowser } from "./supabaseBrowser";

const SELF = process.env.NEXT_PUBLIC_AUTH_SELFHOSTED === "1";
const TOKEN_KEY = "cd_member_session";

/** Store / clear the self-hosted session token (called by the sign-in flows). */
export function setMemberToken(token: string | null) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("cd-auth")); } catch { /* SSR */ }
}

/** The current access token to send as `Authorization: Bearer …`, or null. */
export async function getAccessToken(): Promise<string | null> {
  if (SELF) {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  try { const { data } = await getSupabaseBrowser().auth.getSession(); return data.session?.access_token || null; } catch { return null; }
}

/** Which account is signed in (for the "Signed in as …" line). Decodes the JWT
 *  email claim client-side in self-hosted mode (display only — the server still
 *  verifies every request). */
export async function getSessionEmail(): Promise<string | null> {
  if (SELF) {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (!t) return null;
      const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return p?.email || null;
    } catch { return null; }
  }
  try { const { data } = await getSupabaseBrowser().auth.getSession(); return data.session?.user?.email || null; } catch { return null; }
}

/** Fire cb whenever the session changes (login/logout). Returns an unsubscribe fn. */
export function onAuthChange(cb: () => void): () => void {
  if (SELF) {
    const h = () => cb();
    try { window.addEventListener("cd-auth", h); window.addEventListener("storage", h); } catch { /* SSR */ }
    return () => { try { window.removeEventListener("cd-auth", h); window.removeEventListener("storage", h); } catch { /* SSR */ } };
  }
  const { data } = getSupabaseBrowser().auth.onAuthStateChange(() => cb());
  return () => { try { data.subscription.unsubscribe(); } catch { /* ignore */ } };
}
