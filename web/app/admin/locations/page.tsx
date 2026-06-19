"use client";

// web/app/admin/locations/page.tsx — manage store locations + internal stock transfer.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";

type Loc = { id: string; name: string; short: string | null; address: string | null; lat: number | null; lng: number | null; active: boolean };

const ITEMS: { id: string; name: string; kind: string }[] = [
  ...FLAVORS.map((f: any) => ({ id: String(f.id), name: String(f.name), kind: "cookie" })),
  ...SMOOTHIES.map((s: any) => ({ id: String(s.id), name: String(s.name), kind: "drink" })),
];

const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 };

export default function AdminLocationsPage() {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // add-location form
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [address, setAddress] = useState("");

  // transfer form
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [transferMsg, setTransferMsg] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch("/api/admin/locations", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (j?.ok) { setLocs(j.locations || []); setNotReady(Boolean(j.notReady)); }
    else setErr(j?.error || "Couldn't load locations.");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addLocation() {
    if (!name.trim()) { setErr("Enter a location name."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, short, address }) });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Couldn't add."); return; }
      setName(""); setShort(""); setAddress(""); await load();
    } finally { setBusy(false); }
  }

  async function removeLocation(l: Loc) {
    if (!window.confirm(`Delete location "${l.name}"? Stock rows for it stay in the database.`)) return;
    setBusy(true);
    try { await fetch(`/api/admin/locations/${l.id}`, { method: "DELETE" }); await load(); }
    finally { setBusy(false); }
  }

  async function doTransfer() {
    setTransferMsg("");
    if (!from || !to || !itemId || !qty) { setTransferMsg("Fill in all transfer fields."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, item_id: itemId, qty: Number(qty) }) });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setTransferMsg("❌ " + (j?.error || "Transfer failed.")); return; }
      const itemName = ITEMS.find((x) => x.id === itemId)?.name || itemId;
      setTransferMsg(`✅ Moved ${qty}× ${itemName}. Source now ${j.from.after}, destination now ${j.to.after}.`);
      setQty("");
    } finally { setBusy(false); }
  }

  const nameFor = (id: string) => locs.find((l) => l.id === id)?.short || locs.find((l) => l.id === id)?.name || id;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>Locations</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          Manage your stores and move stock between them. New locations are inventory/transfer points — delivery still ships from your existing stores.
        </p>

        {err ? <p style={{ color: "#C0392B", fontSize: 14 }}>{err}</p> : null}
        {notReady ? <p style={{ color: "#9A6700", fontSize: 13 }}>Run the locations SQL migration in Supabase to enable this.</p> : null}

        {/* Transfer tool */}
        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>🔄 Internal transfer</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>From<br />
              <select style={field} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Select…</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.short || l.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>To<br />
              <select style={field} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select…</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.short || l.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>Item<br />
              <select style={field} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Select…</option>
                {ITEMS.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.kind})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>Quantity<br />
              <input style={field} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </label>
          </div>
          <button onClick={doTransfer} disabled={busy} style={{ marginTop: 12, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "10px 22px", borderRadius: 999, cursor: "pointer" }}>{busy ? "Working…" : "Transfer stock"}</button>
          {transferMsg ? <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: transferMsg.startsWith("✅") ? COLORS.blue : "#C0392B" }}>{transferMsg}</div> : null}
        </section>

        {/* Locations list */}
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>Your locations</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {locs.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div>
                  <div style={{ fontWeight: 700, color: COLORS.black }}>{l.short || l.name} {!l.active ? <span style={{ color: COLORS.muted, fontWeight: 400 }}>(inactive)</span> : null}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>{l.address || l.id}</div>
                </div>
                <button onClick={() => removeLocation(l)} disabled={busy} style={{ border: "1px solid rgba(192,57,43,0.4)", background: "#fff", color: "#C0392B", fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 999, cursor: "pointer" }}>Delete</button>
              </div>
            ))}
            {locs.length === 0 && !notReady ? <p style={{ color: COLORS.muted, fontSize: 14 }}>No locations yet.</p> : null}
          </div>
        </section>

        {/* Add location */}
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>➕ Add a location</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={field} placeholder="Name (e.g. Total Buah Segar — Pondok Indah)" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={field} placeholder="Short label (e.g. Pondok Indah)" value={short} onChange={(e) => setShort(e.target.value)} />
            <input style={field} placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
            <button onClick={addLocation} disabled={busy} style={{ border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "11px", borderRadius: 999, cursor: "pointer" }}>{busy ? "Adding…" : "Add location"}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
