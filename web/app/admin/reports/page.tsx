"use client";

// web/app/admin/reports/page.tsx — admin reporting: daily sales, items,
// per-location comparison, inventory, redeemed items.
import { useCallback, useEffect, useState, Fragment } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const rupiah = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

type Report = any;
type Tab = "daily" | "items" | "locations" | "inventory" | "redemptions";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Daily sales" },
  { key: "items", label: "By item" },
  { key: "locations", label: "Locations" },
  { key: "inventory", label: "Inventory" },
  { key: "redemptions", label: "Redeemed" },
];

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: COLORS.muted, fontWeight: 800, borderBottom: "1px solid rgba(0,0,0,0.10)" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "#222", borderBottom: "1px solid rgba(0,0,0,0.06)" };

export default function AdminReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [locationId, setLocationId] = useState("");
  const [tab, setTab] = useState<Tab>("daily");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ from, to });
      if (locationId) qs.set("location_id", locationId);
      const headers: Record<string, string> = {};
      const adminTok = process.env.NEXT_PUBLIC_ADMIN_TOKEN;
      if (adminTok) headers["x-admin-token"] = adminTok;
      const res = await fetch(`/api/admin/reports?${qs.toString()}`, { headers, cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setData(j);
      else setErr(j?.error || "Couldn't load reports.");
    } catch {
      setErr("Couldn't load reports.");
    } finally { setLoading(false); }
  }, [from, to, locationId]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const locations: { id: string; name: string }[] = data?.locations || [];
  const s = data?.summary;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>Reports</h1>
          <div style={{ display: "flex", gap: 14 }}>
            <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Orders</Link>
            <Link href="/admin/customers" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Customers</Link>
            <Link href="/admin/flavors" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Inventory</Link>
          </div>
        </div>

        {/* Filters */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted }}>From<br />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted }}>To<br />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted }}>Location<br />
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)", background: "#fff" }}>
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <button onClick={load} disabled={loading} style={{ border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "10px 20px", borderRadius: 999, cursor: "pointer" }}>{loading ? "Loading…" : "Apply"}</button>
        </div>

        {err ? <p style={{ marginTop: 14, color: "#C0392B" }}>{err}</p> : null}

        {/* Summary cards */}
        {s ? (
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Stat label="Paid orders" value={String(s.orders)} />
            <Stat label="Revenue" value={rupiah(s.revenue)} />
            <Stat label="Free cookies given" value={String(s.freeCookies)} />
            <Stat label="Free drinks given" value={String(s.freeDrinks)} />
          </div>
        ) : null}

        {/* Tabs */}
        <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              border: tab === t.key ? `1.5px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.14)",
              background: tab === t.key ? "#EAF2FF" : "#fff", color: tab === t.key ? COLORS.blue : COLORS.black,
              fontWeight: 800, fontSize: 13, padding: "8px 14px", borderRadius: 999, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ marginTop: 14, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
          {!data ? <p style={{ padding: 18, color: COLORS.muted }}>No data.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              {tab === "daily" && (
                <>
                  <thead><tr><th style={th}>Date</th><th style={th}>Orders</th><th style={th}>Revenue</th></tr></thead>
                  <tbody>{(data.daily || []).map((r: any) => {
                    const open = openDay === r.date;
                    const detail: any[] = (data.dailyDetail || {})[r.date] || [];
                    return (
                      <Fragment key={r.date}>
                        <tr onClick={() => setOpenDay(open ? null : r.date)} style={{ cursor: "pointer" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{open ? "▾" : "▸"} {r.date}</td>
                          <td style={td}>{r.orders}</td>
                          <td style={td}>{rupiah(r.revenue)}</td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "6px 14px 12px", background: "rgba(0,0,0,0.02)" }}>
                              {detail.map((o, i) => (
                                <div key={i} style={{ fontSize: 12.5, color: "#333", padding: "4px 0", borderBottom: i < detail.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                                  <strong>{o.orderNo ? `#${o.orderNo}` : "Order"}</strong> · {rupiah(o.total)}
                                  {o.items?.length ? <span style={{ color: COLORS.muted }}> — {o.items.map((it: any) => `${it.qty}× ${it.name}`).join(", ")}</span> : null}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}{(data.daily || []).length === 0 && <tr><td style={td} colSpan={3}>No sales in range.</td></tr>}</tbody>
                </>
              )}
              {tab === "items" && (
                <>
                  <thead><tr><th style={th}>Item</th><th style={th}>Type</th><th style={th}>Qty sold</th><th style={th}>Free</th><th style={th}>Revenue</th></tr></thead>
                  <tbody>{(data.items || []).map((r: any) => (
                    <tr key={r.id}><td style={td}>{r.name}</td><td style={td}>{r.kind}</td><td style={td}>{r.qty}</td><td style={td}>{r.freeQty}</td><td style={td}>{rupiah(r.revenue)}</td></tr>
                  ))}{(data.items || []).length === 0 && <tr><td style={td} colSpan={5}>No items in range.</td></tr>}</tbody>
                </>
              )}
              {tab === "locations" && (
                <>
                  <thead><tr><th style={th}>Location</th><th style={th}>Orders</th><th style={th}>Revenue</th></tr></thead>
                  <tbody>{(data.byLocation || []).map((r: any) => (
                    <tr key={r.locationId}><td style={td}>{r.name}</td><td style={td}>{r.orders}</td><td style={td}>{rupiah(r.revenue)}</td></tr>
                  ))}</tbody>
                </>
              )}
              {tab === "inventory" && (
                <>
                  <thead><tr><th style={th}>Location</th><th style={th}>Item</th><th style={th}>Stock</th><th style={th}>Status</th></tr></thead>
                  <tbody>{(data.inventory || []).map((r: any, i: number) => (
                    <tr key={i}><td style={td}>{r.locationName}</td><td style={td}>{r.itemId}</td><td style={td}>{r.stock == null ? "∞" : r.stock}</td><td style={td}>{r.soldOut ? "Sold out" : "Available"}</td></tr>
                  ))}{(data.inventory || []).length === 0 && <tr><td style={td} colSpan={4}>No tracked stock.</td></tr>}</tbody>
                </>
              )}
              {tab === "redemptions" && (
                <>
                  <thead><tr><th style={th}>Item</th><th style={th}>Type</th><th style={th}>Free given</th></tr></thead>
                  <tbody>{(data.redemptions || []).map((r: any) => (
                    <tr key={r.id}><td style={td}>{r.name}</td><td style={td}>{r.kind}</td><td style={td}>{r.qty}</td></tr>
                  ))}{(data.redemptions || []).length === 0 && <tr><td style={td} colSpan={3}>No rewards redeemed in range.</td></tr>}</tbody>
                </>
              )}
            </table>
          )}
        </div>

        {tab === "inventory" && data?.movements ? (
          <div style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: COLORS.black }}>Inventory movements</h2>
            <div style={{ marginTop: 8, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>When</th><th style={th}>Location</th><th style={th}>Item</th><th style={th}>−Qty</th><th style={th}>Before→After</th><th style={th}>Order</th></tr></thead>
                <tbody>{(data.movements || []).map((m: any, i: number) => (
                  <tr key={i}>
                    <td style={td}>{String(m.createdAt).slice(0, 16).replace("T", " ")}</td>
                    <td style={td}>{m.locationName}</td><td style={td}>{m.itemId}</td>
                    <td style={td}>{m.qty}</td><td style={td}>{m.before}→{m.after}</td><td style={td}>{m.orderNo ? `#${m.orderNo}` : ""}</td>
                  </tr>
                ))}{(data.movements || []).length === 0 && <tr><td style={td} colSpan={6}>No movements yet (logged from the next paid order onward).</td></tr>}</tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: COLORS.black }}>{value}</div>
    </div>
  );
}
