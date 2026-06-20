"use client";

// web/app/admin/promos/page.tsx — create & manage discount codes.
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";

const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: COLORS.black, display: "block", marginBottom: 4 };
const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

type Promo = {
  id: string; code: string; type: "percent" | "fixed"; value: number;
  min_subtotal: number; max_discount: number | null; usage_limit: number | null;
  per_customer_limit: number; expires_at: string | null; active: boolean;
  description: string | null; used: number;
};

export default function PromosPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // create form
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomer, setPerCustomer] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [desc, setDesc] = useState("");

  async function load() {
    setLoading(true);
    try {
      const j = await (await fetch("/api/admin/promos", { cache: "no-store" })).json();
      if (j?.ok) setPromos(j.promos || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, type, value: Number(value), min_subtotal: Number(minSubtotal || 0),
          max_discount: maxDiscount ? Number(maxDiscount) : null,
          usage_limit: usageLimit ? Number(usageLimit) : null,
          per_customer_limit: Number(perCustomer || 0),
          expires_at: expiresAt || null, description: desc || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not create code."); return; }
      setCode(""); setValue(""); setMinSubtotal(""); setMaxDiscount(""); setUsageLimit(""); setDesc(""); setExpiresAt("");
      await load();
    } finally { setBusy(false); }
  }

  async function toggle(p: Promo) {
    setErr("");
    const res = await fetch(`/api/admin/promos/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not update that code."); return; }
    await load();
  }
  async function remove(p: Promo) {
    if (!window.confirm(`Delete ${p.code}? This can't be undone.`)) return;
    setErr("");
    const res = await fetch(`/api/admin/promos/${p.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) { setErr(j?.error || "Could not delete that code."); return; }
    await load();
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>Promo codes</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Discount codes customers enter at checkout. Pair them with a broadcast to drive orders.</p>

        {/* Create */}
        <section style={card}>
          <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, marginBottom: 10 }}>New code</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Code</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAVENDER15" style={field} /></div>
            <div>
              <label style={lbl}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as any)} style={field}>
                <option value="percent">Percent off (%)</option>
                <option value="fixed">Fixed amount off (Rp)</option>
              </select>
            </div>
            <div><label style={lbl}>{type === "percent" ? "Percent (1–100)" : "Amount off (Rp)"}</label><input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder={type === "percent" ? "15" : "20000"} style={field} /></div>
            <div><label style={lbl}>Min spend (Rp)</label><input value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} inputMode="numeric" placeholder="0" style={field} /></div>
            {type === "percent" ? (
              <div><label style={lbl}>Max discount (Rp, optional)</label><input value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} inputMode="numeric" placeholder="e.g. 50000" style={field} /></div>
            ) : <div />}
            <div><label style={lbl}>Total uses (blank = ∞)</label><input value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} inputMode="numeric" placeholder="∞" style={field} /></div>
            <div><label style={lbl}>Uses per customer (0 = ∞)</label><input value={perCustomer} onChange={(e) => setPerCustomer(e.target.value)} inputMode="numeric" placeholder="1" style={field} /></div>
            <div><label style={lbl}>Expires (optional)</label><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={field} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Note (optional)</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Lavender launch promo" style={field} /></div>
          </div>
          {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</p> : null}
          <button onClick={create} disabled={busy} style={{ marginTop: 12, border: "none", background: busy ? "rgba(0,20,167,0.4)" : COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 15, padding: "12px 20px", borderRadius: 999, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "Creating…" : "Create code"}
          </button>
        </section>

        {/* List */}
        <section style={card}>
          <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, marginBottom: 6 }}>Your codes</div>
          {loading ? <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading…</p> : promos.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 13 }}>No codes yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {promos.map((p) => (
                <div key={p.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, opacity: p.active ? 1 : 0.55 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: COLORS.black, fontFamily: "monospace", fontSize: 16 }}>{p.code}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      {p.type === "percent" ? `${p.value}% off` : `${rp(p.value)} off`}
                      {p.min_subtotal ? ` · min ${rp(p.min_subtotal)}` : ""}
                      {p.max_discount ? ` · cap ${rp(p.max_discount)}` : ""}
                      {" · "}{p.used}{p.usage_limit ? `/${p.usage_limit}` : ""} used
                      {p.expires_at ? ` · ends ${String(p.expires_at).slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                    <button onClick={() => toggle(p)} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 12, color: p.active ? COLORS.muted : COLORS.blue, cursor: "pointer" }}>{p.active ? "Pause" : "Activate"}</button>
                    <button onClick={() => remove(p)} style={{ border: "1px solid rgba(192,57,43,0.3)", background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 12, color: "#C0392B", cursor: "pointer" }}>Delete</button>
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
