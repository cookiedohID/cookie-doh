"use client";

// web/app/admin/login/page.tsx — admin password gate.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/theme";

export default function AdminLoginPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) {
        const next = new URLSearchParams(window.location.search).get("next") || "/admin/orders";
        router.replace(next);
      } else {
        setErr(j?.error || "Wrong password.");
      }
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand, display: "grid", placeItems: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20, padding: 24 }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: COLORS.black }}>Admin sign in</h1>
        <p style={{ margin: "6px 0 16px", color: COLORS.muted, fontSize: 13 }}>Enter the admin password to continue.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Admin password"
          autoFocus
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)", fontSize: 15, boxSizing: "border-box" }}
        />
        {err ? <div style={{ marginTop: 10, color: "#C0392B", fontWeight: 700, fontSize: 13 }}>{err}</div> : null}
        <button type="submit" disabled={busy || !pw} style={{ marginTop: 14, width: "100%", border: "none", background: pw ? COLORS.blue : "rgba(0,20,167,0.4)", color: "#fff", fontWeight: 800, padding: "13px", borderRadius: 999, cursor: pw ? "pointer" : "not-allowed" }}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
