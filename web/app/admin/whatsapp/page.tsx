"use client";

// web/app/admin/whatsapp/page.tsx — WhatsApp chats; mute the bot per customer (temporary)
// or exclude a number from auto-reply permanently (suppliers, partners, our own lines).
import { useCallback, useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";

const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 };

type Chat = { phone: string; name: string | null; lastText: string; lastAt: string; lastRole: string; count: number; mutedUntil: string | null; excluded: boolean };

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function WhatsAppPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const j = await (await fetch("/api/admin/whatsapp", { cache: "no-store" })).json();
      if (j?.ok) setChats(j.chats || []); else setErr(j?.error || "Could not load chats.");
    } catch (e: any) { setErr(e?.message || "Error"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(c: Chat, body: Record<string, unknown>) {
    setBusy(c.phone); setErr("");
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not update."); return; }
      await load();
    } finally { setBusy(""); }
  }

  const toggleMute = (c: Chat) => post(c, { mute: !c.mutedUntil });

  function toggleExclude(c: Chat) {
    if (!c.excluded && !confirm(
      `Never auto-reply to ${c.name || c.phone}?\n\nUse this for a supplier, a partner or one of your own numbers — not for a customer you're just handling yourself right now (that's Mute).\n\nTheir messages still show up here. You can switch it back any time.`
    )) return;
    post(c, { exclude: !c.excluded });
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>💬 WhatsApp chats</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          Recent conversations with the AI assistant. <b>Mute</b> the bot for a customer you want to handle yourself — it goes
          silent for that chat and <b>auto-resumes after the chat has been quiet ~2 hours</b>. Other customers keep getting instant replies.
        </p>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          <b>Never reply</b> is the permanent version — for a supplier, a partner or one of your own numbers. It never expires.
          Their messages still appear here.
        </p>
        <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
          Tip: replies you type on WhatsApp aren&apos;t visible here (WhatsApp doesn&apos;t share them) — this list shows the customer&apos;s messages + the bot&apos;s.
        </p>

        {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p> : null}

        <section style={card}>
          {loading ? <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading…</p> : chats.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 13 }}>No WhatsApp conversations yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {chats.map((c) => {
                const muted = !!c.mutedUntil;
                const off = c.excluded;
                return (
                  <div key={c.phone} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", background: (muted || off) ? "rgba(0,0,0,0.03)" : "#fff" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, color: COLORS.black }}>
                        {c.name || c.phone}{" "}
                        {off
                          ? <span style={{ fontSize: 11, fontWeight: 800, color: "#7a2e2e", background: "#F6DADA", borderRadius: 999, padding: "2px 8px" }}>🚫 Never replies</span>
                          : muted
                          ? <span style={{ fontSize: 11, fontWeight: 800, color: "#8a5a00", background: "#FFF1C2", borderRadius: 999, padding: "2px 8px" }}>🔇 Muted</span>
                          : <span style={{ fontSize: 11, fontWeight: 800, color: "#0f6e56", background: "rgba(29,158,117,0.12)", borderRadius: 999, padding: "2px 8px" }}>🤖 Bot active</span>}
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700 }}>{c.lastRole === "assistant" ? "Bot: " : ""}</span>{c.lastText}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{c.name ? c.phone + " · " : ""}{ago(c.lastAt)}</div>
                    </div>
                    <div style={{ flex: "0 0 auto", display: "grid", gap: 6, justifyItems: "stretch" }}>
                      {off ? null : (
                        <button onClick={() => toggleMute(c)} disabled={busy === c.phone}
                          style={{ border: `1px solid ${muted ? "rgba(29,158,117,0.4)" : "rgba(0,0,0,0.18)"}`, background: "#fff", color: muted ? "#0f6e56" : COLORS.black, borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: busy === c.phone ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                          {busy === c.phone ? "…" : muted ? "Unmute bot" : "Mute bot"}
                        </button>
                      )}
                      <button onClick={() => toggleExclude(c)} disabled={busy === c.phone}
                        style={{ border: `1px solid ${off ? "rgba(29,158,117,0.4)" : "rgba(0,0,0,0.18)"}`, background: "#fff", color: off ? "#0f6e56" : "#7a2e2e", borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 12, cursor: busy === c.phone ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                        {busy === c.phone ? "…" : off ? "Turn bot back on" : "Never reply"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <button onClick={load} style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.18)", background: "#fff", borderRadius: 999, padding: "8px 16px", fontWeight: 800, fontSize: 13, color: COLORS.blue, cursor: "pointer" }}>↻ Refresh</button>
      </div>
    </main>
  );
}
