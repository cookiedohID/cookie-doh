"use client";

// web/app/admin/spend-rewards/page.tsx — manage "spend Rp X, add reward for Rp Y" tiers.
import { useEffect, useMemo, useState } from "react";
import { COLORS } from "@/lib/theme";
import { FLAVORS } from "@/lib/catalog";

const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: COLORS.black, display: "block", marginBottom: 4 };
const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

type Tier = { id: string; threshold_idr: number; label: string; special_price_idr: number; items: { id: string; name: string; quantity: number }[]; active: boolean };

export default function SpendRewardsPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [threshold, setThreshold] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const chosen = useMemo(() => (FLAVORS as any[]).filter((f) => (qty[f.id] || 0) > 0), [qty]);

  async function load() {
    setLoading(true);
    try {
      const j = await (await fetch("/api/admin/spend-rewards", { cache: "no-store" })).json();
      if (j?.ok) setTiers(j.tiers || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function bump(id: string, d: number) {
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + d) }));
  }

  async function create() {
    setErr("");
    setBusy(true);
    try {
      const items = chosen.map((f) => ({ id: String(f.id), name: String(f.name), quantity: qty[f.id] }));
      const res = await fetch("/api/admin/spend-rewards", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold_idr: Number(threshold), label, special_price_idr: Number(price), items }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not create tier."); return; }
      setThreshold(""); setLabel(""); setPrice(""); setQty({});
      await load();
    } finally { setBusy(false); }
  }

  async function toggle(t: Tier) {
    setErr("");
    const res = await fetch(`/api/admin/spend-rewards/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !t.active }) });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not update."); return; }
    await load();
  }
  async function remove(t: Tier) {
    if (!window.confirm(`Delete "${t.label}"?`)) return;
    setErr("");
    const res = await fetch(`/api/admin/spend-rewards/${t.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not delete."); return; }
    await load();
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>Spend rewards</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>“Spend Rp300k, add a cookie for Rp30k.” Customers see the highest tier they unlock, plus a “spend a bit more” nudge.</p>

        {/* Create */}
        <section style={card}>
          <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, marginBottom: 10 }}>New tier</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Spend at least (Rp)</label><input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" placeholder="300000" style={field} /></div>
            <div><label style={lbl}>Reward name</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bonus cookie" style={field} /></div>
            <div><label style={lbl}>Reward price (Rp)</label><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="30000" style={field} /></div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Reward cookies {chosen.length ? `· ${chosen.reduce((n, f) => n + (qty[f.id] || 0), 0)} selected` : ""}</label>
            <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: 8, display: "grid", gap: 6 }}>
              {(FLAVORS as any[]).map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: COLORS.black }}>{f.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => bump(f.id, -1)} style={stepBtn}>–</button>
                    <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800 }}>{qty[f.id] || 0}</span>
                    <button onClick={() => bump(f.id, +1)} style={stepBtn}>+</button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</p> : null}
          <button onClick={create} disabled={busy} style={{ marginTop: 12, border: "none", background: busy ? "rgba(0,20,167,0.4)" : COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 15, padding: "12px 20px", borderRadius: 999, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "Creating…" : "Create tier"}
          </button>
        </section>

        {/* List */}
        <section style={card}>
          <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, marginBottom: 6 }}>Your tiers</div>
          {loading ? <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading…</p> : tiers.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 13 }}>No tiers yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {tiers.map((t) => (
                <div key={t.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, opacity: t.active ? 1 : 0.55 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: COLORS.black }}>Spend {rp(t.threshold_idr)} → {t.label} for {rp(t.special_price_idr)}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{(t.items || []).map((i) => `${i.name} ×${i.quantity}`).join(", ")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                    <button onClick={() => toggle(t)} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 12, color: t.active ? COLORS.muted : COLORS.blue, cursor: "pointer" }}>{t.active ? "Pause" : "Activate"}</button>
                    <button onClick={() => remove(t)} style={{ border: "1px solid rgba(192,57,43,0.3)", background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 12, color: "#C0392B", cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const stepBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(0,0,0,0.18)", background: "#fff", fontWeight: 900, cursor: "pointer", lineHeight: 1 };
