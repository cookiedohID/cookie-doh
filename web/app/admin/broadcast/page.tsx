"use client";

// web/app/admin/broadcast/page.tsx — compose + send a WhatsApp broadcast to members.
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";
import { SEGMENTS, type Segment } from "@/lib/broadcast";

const field: React.CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 18, marginTop: 14 };

export default function BroadcastPage() {
  const [segment, setSegment] = useState<Segment>("all");
  const [message, setMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<string[]>([]);
  const [loadingCount, setLoadingCount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState("");

  // Refresh the recipient count whenever the segment changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingCount(true); setCount(null); setSample([]);
    fetch(`/api/admin/broadcast/recipients?segment=${segment}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.ok) { setCount(j.count); setSample(j.sample || []); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCount(false); });
    return () => { cancelled = true; };
  }, [segment]);

  async function send() {
    setErr(""); setResult("");
    if (message.trim().length < 3) { setErr("Write a message first."); return; }
    if (!window.confirm(`Send this WhatsApp to ${count ?? "?"} recipient(s)? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/broadcast/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, message }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Send failed."); return; }
      setResult(`✅ Sent to ${j.sent} recipient(s).${j.failed ? ` ${j.failed} failed.` : ""}${j.capped ? ` (capped at ${j.capped} per send)` : ""}`);
      setMessage("");
    } finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>WhatsApp broadcast</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Message everyone who's ordered — new flavours, promos, reminders.</p>

        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black, marginBottom: 8 }}>Who gets it</div>
          <div style={{ display: "grid", gap: 8 }}>
            {SEGMENTS.map((s) => (
              <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: segment === s.key ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.12)", background: segment === s.key ? "rgba(0,20,167,0.05)" : "#fff", cursor: "pointer" }}>
                <input type="radio" name="seg" checked={segment === s.key} onChange={() => setSegment(s.key)} />
                <span>
                  <span style={{ fontWeight: 800, color: COLORS.black }}>{s.label}</span>
                  <span style={{ display: "block", fontSize: 12, color: COLORS.muted }}>{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: COLORS.blue }}>
            {loadingCount ? "Counting recipients…" : count != null ? `${count} recipient${count === 1 ? "" : "s"}` : "—"}
            {sample.length ? <span style={{ color: COLORS.muted, fontWeight: 600 }}> · e.g. {sample.join(", ")}</span> : null}
          </div>
        </section>

        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black, marginBottom: 8 }}>Message</div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={"Hi {name}! 🍪 Our new Lavender Hush cookie just dropped — order before it sells out…"}
            style={{ ...field, minHeight: 130, resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ marginTop: 8, fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
            Use <code style={{ background: "rgba(0,20,167,0.08)", color: COLORS.blue, padding: "1px 5px", borderRadius: 5 }}>{"{name}"}</code> to personalise. We automatically add <em>“Reply STOP to opt out.”</em> to every message.
          </div>
        </section>

        {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 14, marginTop: 12 }}>{err}</p> : null}
        {result ? <p style={{ color: COLORS.blue, fontWeight: 800, fontSize: 14, marginTop: 12 }}>{result}</p> : null}

        <button onClick={send} disabled={busy || loadingCount || !count}
          style={{ marginTop: 16, width: "100%", border: "none", background: busy || !count ? "rgba(0,20,167,0.4)" : COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, padding: "14px", borderRadius: 999, cursor: busy || !count ? "not-allowed" : "pointer" }}>
          {busy ? "Sending…" : `Send to ${count ?? 0} recipient${count === 1 ? "" : "s"}`}
        </button>
        <p style={{ marginTop: 10, fontSize: 12, color: COLORS.muted, textAlign: "center", lineHeight: 1.5 }}>
          Sends via WhatsApp (Fonnte) — each message has a small cost. Only message people who opted in.
        </p>
      </div>
    </main>
  );
}
