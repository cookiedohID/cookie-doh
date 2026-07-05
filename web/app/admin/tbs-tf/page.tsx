"use client";

// web/app/admin/tbs-tf/page.tsx — printable Tukar Faktur Cabang: the periodic
// settlement document between Cookie Doh (marketplace) and one TotalBuahStore
// store. Shows every paid web order's goods + delivery, Cookie Doh's
// marketplace fee, and the NET amount Cookie Doh transfers to the store.
// Print / Save as PDF via the browser (print CSS hides the controls).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const rp = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const STORE_NAMES: Record<string, string> = {
  "TBS-RCV": "RC Veteran (Bintaro)",
  "TBS-KTR": "Karang Tengah (Lebak Bulus)",
  "TBS-XMAS": "Bekasi (KH Noer Ali)",
};
const monthStartIso = () => new Date().toISOString().slice(0, 8) + "01";
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TbsTfPage() {
  const [store, setStore] = useState("TBS-RCV");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [feePct, setFeePct] = useState("");
  const [tf, setTf] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (st: string, f: string, t: string, pct: string) => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ store: st, from: f, to: t });
      if (pct.trim()) qs.set("tbs_fee_pct", pct.trim());
      const j = await (await fetch(`/api/admin/tbs-tf?${qs}`, { cache: "no-store" })).json();
      if (j?.ok) setTf(j.tf);
      else { setTf(null); setErr(j?.error || "Couldn't load."); }
    } catch { setTf(null); setErr("Couldn't load."); }
    finally { setLoading(false); }
  }, []);

  // querystring prefill (links from /admin/reports)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = (q.get("store") || "TBS-RCV").toUpperCase();
    const f = q.get("from") || monthStartIso();
    const t = q.get("to") || todayIso();
    const pct = q.get("tbs_fee_pct") || "";
    setStore(st); setFrom(f); setTo(t); setFeePct(pct);
    load(st, f, t, pct);
  }, [load]);

  const totals = tf?.totals;

  return (
    <main style={{ minHeight: "100vh", background: "#f4f4f2" }}>
      <style>{`@media print { .no-print { display: none !important; } main { background: #fff !important; } .tf-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; } }`}</style>

      {/* controls (hidden when printing) */}
      <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", padding: "18px 16px 0", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Link href="/admin/reports" style={{ fontSize: 13, fontWeight: 700, color: "#0014A7", textDecoration: "none", alignSelf: "center" }}>‹ Reports</Link>
        <label style={{ fontSize: 12, fontWeight: 800, color: "#777" }}>Store<br />
          <select value={store} onChange={(e) => setStore(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)", background: "#fff" }}>
            {Object.entries(STORE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 800, color: "#777" }}>From<br />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 800, color: "#777" }}>To<br />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 800, color: "#777" }}>Fee %<br />
          <input value={feePct} onChange={(e) => setFeePct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="5" style={{ width: 60, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
        </label>
        <button onClick={() => load(store, from, to, feePct)} disabled={loading}
          style={{ border: "none", background: "#0014A7", color: "#fff", fontWeight: 800, padding: "10px 20px", borderRadius: 999, cursor: "pointer" }}>
          {loading ? "Loading…" : "Generate"}
        </button>
        {tf ? (
          <button onClick={() => window.print()}
            style={{ border: "none", background: "#135232", color: "#fff", fontWeight: 800, padding: "10px 20px", borderRadius: 999, cursor: "pointer" }}>
            🖨 Print / Save PDF
          </button>
        ) : null}
      </div>
      {err ? <p className="no-print" style={{ maxWidth: 820, margin: "10px auto 0", padding: "0 16px", color: "#C0392B" }}>{err}</p> : null}

      {/* the document */}
      {tf ? (
        <div className="tf-sheet" style={{ maxWidth: 820, margin: "16px auto 60px", background: "#fff", border: "1px solid rgba(0,0,0,0.12)", boxShadow: "0 12px 30px rgba(0,0,0,0.08)", borderRadius: 6, padding: "34px 38px", color: "#191919" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: 0.4 }}>TUKAR FAKTUR CABANG</div>
              <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Settlement — TotalBuahStore web sales via cookiedoh.co.id</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>{tf.tf_no}</div>
              <div style={{ fontSize: 12.5, color: "#555" }}>Period: {tf.period.from} — {tf.period.to} (WIB)</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 26, marginTop: 18, fontSize: 13, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 800, textTransform: "uppercase" }}>From (marketplace)</div>
              <div style={{ fontWeight: 800 }}>Cookie Doh</div>
              <div style={{ color: "#555" }}>cookiedoh.co.id — collects web payments (Midtrans)</div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 800, textTransform: "uppercase" }}>To (store)</div>
              <div style={{ fontWeight: 800 }}>TotalBuahStore — {STORE_NAMES[tf.store] || tf.store}</div>
              <div style={{ color: "#555" }}>{tf.store}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #191919", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Order</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Type</th>
                <th style={{ padding: "6px 4px" }}>Goods</th>
                <th style={{ padding: "6px 4px" }}>Delivery</th>
                <th style={{ padding: "6px 4px" }}>Fee ({tf.fee_pct}%)</th>
                <th style={{ padding: "6px 4px" }}>Points used</th>
                <th style={{ padding: "6px 4px" }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {tf.lines.map((l: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "6px 4px" }}>{l.date}</td>
                  <td style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700 }}>{l.order_no ? `#${l.order_no}` : l.order_id.slice(0, 8)}</td>
                  <td style={{ textAlign: "left", padding: "6px 4px", color: "#555" }}>{l.fulfil}</td>
                  <td style={{ padding: "6px 4px" }}>{rp(l.items_idr)}</td>
                  <td style={{ padding: "6px 4px" }}>{rp(l.delivery_idr)}</td>
                  <td style={{ padding: "6px 4px" }}>({rp(l.fee_idr)})</td>
                  <td style={{ padding: "6px 4px" }}>{l.points_idr ? `(${rp(l.points_idr)})` : "—"}</td>
                  <td style={{ padding: "6px 4px", fontWeight: 700 }}>{rp(l.net_idr)}</td>
                </tr>
              ))}
              {tf.lines.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 14, color: "#777" }}>No paid TotalBuahStore web orders for this store in the period.</td></tr>
              ) : null}
            </tbody>
          </table>

          {totals ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13.5, minWidth: 330 }}>
                <tbody>
                  <tr><td style={{ padding: "4px 10px", color: "#555" }}>Goods collected for the store</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700 }}>{rp(totals.items_idr)}</td></tr>
                  <tr><td style={{ padding: "4px 10px", color: "#555" }}>Delivery fees collected</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700 }}>{rp(totals.delivery_idr)}</td></tr>
                  <tr style={{ borderTop: "1px solid rgba(0,0,0,0.15)" }}><td style={{ padding: "4px 10px", color: "#555" }}>Gross owed to store</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 800 }}>{rp(totals.gross_idr)}</td></tr>
                  <tr><td style={{ padding: "4px 10px", color: "#555" }}>Cookie Doh marketplace fee ({tf.fee_pct}% of goods)</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 800, color: "#9c1216" }}>({rp(totals.fee_idr)})</td></tr>
                  {totals.points_idr ? <tr><td style={{ padding: "4px 10px", color: "#555" }}>TBS points redeemed by customers (store honored)</td><td style={{ padding: "4px 0", textAlign: "right", fontWeight: 800, color: "#9c1216" }}>({rp(totals.points_idr)})</td></tr> : null}
                  <tr style={{ borderTop: "2px solid #191919" }}>
                    <td style={{ padding: "7px 10px", fontWeight: 900, fontSize: 15 }}>NET PAYABLE TO STORE</td>
                    <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 900, fontSize: 15, color: "#135232" }}>{rp(totals.net_idr)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          <div style={{ marginTop: 26, fontSize: 11.5, color: "#777", lineHeight: 1.6 }}>
            {totals ? <>Orders in period: <b>{totals.orders}</b>. </> : null}
            Fee basis: TotalBuahStore goods value only (delivery is courier money, not fee-bearing).
            Cookie Doh books the fee as marketplace revenue; TotalBuahStore books it as an expense.
            Generated from cookiedoh.co.id paid-order data; dates are WIB business days.
          </div>

          <div style={{ display: "flex", gap: 40, marginTop: 34, fontSize: 12.5 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", paddingTop: 6, marginTop: 44 }}>Cookie Doh</div>
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", paddingTop: 6, marginTop: 44 }}>TotalBuahStore — {tf.store}</div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
