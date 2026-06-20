"use client";

// web/components/NotifyWhenBack.tsx — "tell me when this flavour is back".
// Shown on sold-out product cards. Subscribes a phone to /api/stock/subscribe;
// the admin's back-in-stock toggle WhatsApps everyone subscribed.
import { useState } from "react";

const stop = (e: React.SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export default function NotifyWhenBack({ flavorId }: { flavorId: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    stop(e);
    if (!phone.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/stock/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flavor_id: flavorId, phone: phone.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) setDone(true);
      else setErr(j?.error || "Couldn't sign you up.");
    } catch {
      setErr("Couldn't sign you up — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div style={{ fontSize: 12, fontWeight: 700, color: "#1d9e75" }}>🔔 We&apos;ll text you when it&apos;s back!</div>;
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setOpen(true); }}
        style={{ border: "1px solid rgba(0,20,167,0.35)", background: "#fff", color: "#0014A7", borderRadius: 999, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
      >
        🔔 Notify me when back
      </button>
    );
  }
  return (
    <form onSubmit={submit} onClick={stop} style={{ display: "flex", gap: 6 }}>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="08…"
        inputMode="tel"
        autoFocus
        style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.2)", fontSize: 13 }}
      />
      <button type="submit" disabled={busy} style={{ border: "none", background: "#0014A7", color: "#fff", borderRadius: 8, padding: "0 12px", fontWeight: 800, fontSize: 12, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "…" : "OK"}
      </button>
      {err ? <span style={{ fontSize: 11, color: "#C0392B", alignSelf: "center" }}>{err}</span> : null}
    </form>
  );
}
