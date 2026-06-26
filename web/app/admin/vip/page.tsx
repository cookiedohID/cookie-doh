"use client";

// web/app/admin/vip/page.tsx — manage VIP tiers (annual to reach, monthly to keep).
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";

const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: COLORS.black, display: "block", marginBottom: 4 };
const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");
const num = (s: string) => Number(String(s).replace(/\D/g, "")) || 0;

type Tier = {
  id: string; name: string; reach_annual_idr: number; maintain_monthly_idr: number;
  loyalty_per_free: number; free_delivery: boolean; free_cookie_per_order: boolean; active: boolean;
};

export default function VipPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [reach, setReach] = useState("");
  const [maintain, setMaintain] = useState("");
  const [perFree, setPerFree] = useState("9");
  const [freeDel, setFreeDel] = useState(false);
  const [freeCookie, setFreeCookie] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const j = await (await fetch("/api/admin/vip", { cache: "no-store" })).json();
      if (j?.ok) setTiers(j.tiers || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function patchLocal(id: string, p: Partial<Tier>) {
    setTiers((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  }

  async function create() {
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/admin/vip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, reach_annual_idr: num(reach), maintain_monthly_idr: num(maintain), loyalty_per_free: Number(perFree), free_delivery: freeDel, free_cookie_per_order: freeCookie }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not create tier."); return; }
      setName(""); setReach(""); setMaintain(""); setPerFree("9"); setFreeDel(false); setFreeCookie(false);
      await load();
    } finally { setBusy(false); }
  }

  async function save(t: Tier) {
    setErr("");
    const res = await fetch(`/api/admin/vip/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t.name, reach_annual_idr: Number(t.reach_annual_idr), maintain_monthly_idr: Number(t.maintain_monthly_idr), loyalty_per_free: Number(t.loyalty_per_free), free_delivery: t.free_delivery, free_cookie_per_order: t.free_cookie_per_order }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not save."); return; }
    await load();
  }
  async function toggle(t: Tier) {
    setErr("");
    const res = await fetch(`/api/admin/vip/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !t.active }) });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not update."); return; }
    await load();
  }
  async function remove(t: Tier) {
    if (!window.confirm(`Delete the "${t.name}" tier?`)) return;
    setErr("");
    const res = await fetch(`/api/admin/vip/${t.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not delete."); return; }
    await load();
  }

  const check: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: COLORS.black };

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>👑 VIP tiers</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          Members <b>reach</b> a tier by spending its annual amount (last 12 months) and <b>keep</b> it by meeting its monthly
          minimum (this or last calendar month — so a quiet 1st-of-month doesn't demote anyone; two quiet months does). A
          member sits in the highest <b>active</b> tier they currently reach <i>and</i> keep. Perks: faster loyalty, free
          same-day delivery, a free cookie per order. New tiers start <b>paused</b>.
        </p>

        {/* Create */}
        <section style={card}>
          <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, marginBottom: 10 }}>New tier</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1.3fr 0.9fr", gap: 10 }}>
            <div><label style={lbl}>Tier name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gold" style={field} /></div>
            <div><label style={lbl}>Reach: annual (Rp)</label><input value={reach} onChange={(e) => setReach(e.target.value)} inputMode="numeric" placeholder="3000000" style={field} /></div>
            <div><label style={lbl}>Keep: monthly (Rp)</label><input value={maintain} onChange={(e) => setMaintain(e.target.value)} inputMode="numeric" placeholder="200000 (0 = none)" style={field} /></div>
            <div><label style={lbl}>Buy N → 1 free</label><input value={perFree} onChange={(e) => setPerFree(e.target.value)} inputMode="numeric" placeholder="8" style={field} /></div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            <label style={check}><input type="checkbox" checked={freeDel} onChange={(e) => setFreeDel(e.target.checked)} /> Free same-day delivery</label>
            <label style={check}><input type="checkbox" checked={freeCookie} onChange={(e) => setFreeCookie(e.target.checked)} /> Free cookie each order</label>
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
            <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
              {tiers.map((t) => (
                <div key={t.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 14, opacity: t.active ? 1 : 0.6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1.3fr 0.9fr", gap: 10 }}>
                    <div><label style={lbl}>Name</label><input value={t.name} onChange={(e) => patchLocal(t.id, { name: e.target.value })} style={field} /></div>
                    <div><label style={lbl}>Reach: annual (Rp)</label><input value={String(t.reach_annual_idr)} onChange={(e) => patchLocal(t.id, { reach_annual_idr: num(e.target.value) })} inputMode="numeric" style={field} /></div>
                    <div><label style={lbl}>Keep: monthly (Rp)</label><input value={String(t.maintain_monthly_idr)} onChange={(e) => patchLocal(t.id, { maintain_monthly_idr: num(e.target.value) })} inputMode="numeric" style={field} /></div>
                    <div><label style={lbl}>Buy N → 1 free</label><input value={String(t.loyalty_per_free)} onChange={(e) => patchLocal(t.id, { loyalty_per_free: num(e.target.value) })} inputMode="numeric" style={field} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={check}><input type="checkbox" checked={t.free_delivery} onChange={(e) => patchLocal(t.id, { free_delivery: e.target.checked })} /> Free same-day delivery</label>
                    <label style={check}><input type="checkbox" checked={t.free_cookie_per_order} onChange={(e) => patchLocal(t.id, { free_cookie_per_order: e.target.checked })} /> Free cookie each order</label>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 8 }}>
                    Reach with ≥ {rp(t.reach_annual_idr)}/yr · keep with {t.maintain_monthly_idr > 0 ? `≥ ${rp(t.maintain_monthly_idr)}/mo` : "no monthly upkeep"} · buy {t.loyalty_per_free} get 1 free{t.free_delivery ? " · free delivery" : ""}{t.free_cookie_per_order ? " · free cookie/order" : ""}.
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => save(t)} style={{ border: "none", background: COLORS.blue, color: "#fff", borderRadius: 8, padding: "7px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Save changes</button>
                    <button onClick={() => toggle(t)} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 13, color: t.active ? COLORS.muted : "#0f6e56", cursor: "pointer" }}>{t.active ? "Pause" : "Activate"}</button>
                    <button onClick={() => remove(t)} style={{ border: "1px solid rgba(192,57,43,0.3)", background: "#fff", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 13, color: "#C0392B", cursor: "pointer" }}>Delete</button>
                    <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, fontWeight: 800, color: t.active ? "#0f6e56" : COLORS.muted }}>{t.active ? "● Active" : "○ Paused"}</span>
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
