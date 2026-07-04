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
  const [tbsFeePct, setTbsFeePct] = useState("");
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
      if (tbsFeePct.trim()) qs.set("tbs_fee_pct", tbsFeePct.trim());
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
  }, [from, to, locationId, tbsFeePct]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const locations: { id: string; name: string }[] = data?.locations || [];
  const s = data?.summary;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>Reports</h1>

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
                                <Link key={i} href={o.id ? `/admin/orders/${o.id}` : "#"} style={{ textDecoration: "none", display: "block" }}>
                                  <div style={{ fontSize: 12.5, color: "#333", padding: "5px 6px", margin: "0 -6px", borderRadius: 8, borderBottom: i < detail.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", cursor: "pointer" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,20,167,0.06)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                    <strong style={{ color: COLORS.blue }}>{o.orderNo ? `#${o.orderNo}` : "Order"}</strong> · {rupiah(o.total)}
                                    {o.items?.length ? <span style={{ color: COLORS.muted }}> — {o.items.map((it: any) => `${it.qty}× ${it.name}`).join(", ")}</span> : null}
                                    <span style={{ color: COLORS.blue, fontWeight: 800 }}> ›</span>
                                  </div>
                                </Link>
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

        {(data?.tbsSettlement || []).length > 0 ? (
          <section style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: COLORS.black }}>🍒 TBS settlement & marketplace fee</h2>
            <p style={{ fontSize: 12, color: COLORS.muted, margin: "4px 0 8px" }}>
              TotalBuahStore web orders paid via Cookie Doh in this range. The store is owed <b>items + delivery</b>;
              Cookie Doh charges a <b>{Number(data?.tbsFee?.pct ?? 5)}% marketplace fee</b> on the items value (TBS books it as an expense).
              <b> Net transfer</b> = items + delivery − fee.
              {" "}<label style={{ fontWeight: 800 }}>Fee %:{" "}
                <input value={tbsFeePct} onChange={(e) => setTbsFeePct(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(data?.tbsFee?.pct ?? 5)}
                  style={{ width: 52, padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.16)" }} />
              </label> (press Apply)
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "right", color: COLORS.muted, fontSize: 11 }}>
                  <th style={{ textAlign: "left", padding: 6 }}>Store</th><th style={{ padding: 6 }}>Orders</th><th style={{ padding: 6 }}>Items</th><th style={{ padding: 6 }}>Delivery</th><th style={{ padding: 6 }}>Fee ({Number(data?.tbsFee?.pct ?? 5)}%)</th><th style={{ padding: 6 }}>Net transfer</th><th style={{ padding: 6 }}>Collected</th>
                </tr></thead>
                <tbody>{(data.tbsSettlement || []).map((r: any) => (
                  <tr key={r.store} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", textAlign: "right" }}>
                    <td style={{ textAlign: "left", padding: 6, fontWeight: 700 }}>{r.store}</td>
                    <td style={{ padding: 6 }}>{r.orders}</td>
                    <td style={{ padding: 6 }}>Rp{Number(r.items_idr).toLocaleString("id-ID")}</td>
                    <td style={{ padding: 6 }}>Rp{Number(r.delivery_idr).toLocaleString("id-ID")}</td>
                    <td style={{ padding: 6, color: "#0f6e56", fontWeight: 800 }}>Rp{Number(r.fee_idr || 0).toLocaleString("id-ID")}</td>
                    <td style={{ padding: 6, fontWeight: 800 }}>Rp{Number(r.net_transfer_idr ?? (r.items_idr + r.delivery_idr)).toLocaleString("id-ID")}</td>
                    <td style={{ padding: 6 }}>Rp{Number(r.collected_idr).toLocaleString("id-ID")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {(data?.tbsFee?.orders || []).length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 800, color: COLORS.black, margin: 0 }}>
                    Invoice backing — {data.tbsFee.orders.length} order{data.tbsFee.orders.length > 1 ? "s" : ""} ·
                    {" "}items Rp{Number(data.tbsFee.total_items_idr).toLocaleString("id-ID")} ·
                    {" "}<span style={{ color: "#0f6e56" }}>fee Rp{Number(data.tbsFee.total_fee_idr).toLocaleString("id-ID")}</span>
                  </h3>
                  <button onClick={() => {
                    const rows = [["Date", "Order", "Store", "TBS items (Rp)", `Fee ${Number(data.tbsFee.pct)}% (Rp)`],
                      ...data.tbsFee.orders.map((r: any) => [r.date, r.order_no ? `#${r.order_no}` : r.order_id.slice(0, 8), r.store, String(r.items_idr), String(r.fee_idr)]),
                      ["TOTAL", "", "", String(data.tbsFee.total_items_idr), String(data.tbsFee.total_fee_idr)]];
                    const csv = rows.map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
                    a.download = `tbs-marketplace-fee_${from}_${to}.csv`;
                    a.click(); URL.revokeObjectURL(a.href);
                  }} style={{ border: "none", background: "#135232", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "8px 16px", borderRadius: 999, cursor: "pointer" }}>
                    ⬇ Download CSV (invoice backing)
                  </button>
                </div>
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead><tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "right", color: COLORS.muted, fontSize: 11 }}>
                      <th style={{ textAlign: "left", padding: 6 }}>Date</th><th style={{ textAlign: "left", padding: 6 }}>Order</th><th style={{ textAlign: "left", padding: 6 }}>Store</th><th style={{ padding: 6 }}>TBS items</th><th style={{ padding: 6 }}>Fee</th>
                    </tr></thead>
                    <tbody>{data.tbsFee.orders.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", textAlign: "right" }}>
                        <td style={{ textAlign: "left", padding: 6 }}>{r.date}</td>
                        <td style={{ textAlign: "left", padding: 6 }}>
                          <Link href={`/admin/orders/${r.order_id}`} style={{ color: COLORS.blue, textDecoration: "none", fontWeight: 700 }}>{r.order_no ? `#${r.order_no}` : r.order_id.slice(0, 8)}</Link>
                        </td>
                        <td style={{ textAlign: "left", padding: 6 }}>{r.store}</td>
                        <td style={{ padding: 6 }}>Rp{Number(r.items_idr).toLocaleString("id-ID")}</td>
                        <td style={{ padding: 6, color: "#0f6e56", fontWeight: 700 }}>Rp{Number(r.fee_idr).toLocaleString("id-ID")}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

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
