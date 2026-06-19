"use client";

// web/app/account/reset/page.tsx — set a new password after clicking the reset
// link. Supabase's recovery link establishes a session here (detectSessionInUrl),
// then the member chooses a new password.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { updatePassword } from "@/lib/memberAuth";

const field: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)", fontSize: 15, boxSizing: "border-box",
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    // The recovery link arrives with a token in the URL; the client picks it up
    // and fires PASSWORD_RECOVERY / SIGNED_IN. Also poll getSession as a fallback.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setState("ok");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setState("ok");
      else setTimeout(() => {
        supabase.auth.getSession().then(({ data }) => setState(data.session ? "ok" : "invalid"));
      }, 1800);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    if (password !== confirm) return setErr("Passwords don't match.");
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if ((res as any)?.error) return setErr((res as any).error);
    setDone(true);
    setTimeout(() => router.replace("/account"), 1500);
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "48px 16px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 24, color: COLORS.blue }}>cookie doh members</span>
        <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: COLORS.black }}>Set a new password</h1>

        {state === "checking" ? (
          <p style={{ marginTop: 18, color: COLORS.muted }}>Checking your reset link…</p>
        ) : state === "invalid" ? (
          <div style={{ marginTop: 18 }}>
            <p style={{ color: "#C0392B", fontSize: 14, lineHeight: 1.6 }}>
              This reset link is invalid or has expired. Reset links are single-use and last about an hour.
            </p>
            <Link href="/account/login" style={{ display: "inline-block", marginTop: 12, background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "11px 22px", borderRadius: 999, textDecoration: "none" }}>
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <p style={{ marginTop: 18, color: COLORS.blue, fontWeight: 700 }}>✅ Password updated! Taking you to your account…</p>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 22, display: "grid", gap: 10 }}>
            <input style={field} type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <input style={field} type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {err ? <div style={{ color: "crimson", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}
            <button type="submit" disabled={busy} style={{ marginTop: 4, height: 50, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
