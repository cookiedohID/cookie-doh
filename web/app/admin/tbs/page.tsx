"use client";

// web/app/admin/tbs/page.tsx — Admin → TBS: the one place to run the
// TotalBuahStore e-commerce. Launch switch (password preview ↔ public),
// store/ERP health, month-to-date money, marketplace fee, recent orders with
// their back-office push status (+ retry), and quick links.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const rp = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const GREEN = "#135232", RED = "#9c1216";

export default function AdminTbsPage() {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [feeDraft, setFeeDraft] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const j = await (await fetch("/api/admin/tbs", { cache: "no-store" })).json();
      if (j?.ok) setData(j);
      else setErr(j?.error || "Couldn't load.");
    } catch { setErr("Couldn't load."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setSetting = async (key: string, value: string) => {
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) alert(r?.error || "Couldn't save.");
    return Boolean(r?.ok);
  };

  const toggleLaunch = async () => {
    const goingPublic = !data?.shop?.public;
    const msg = goingPublic
      ? "Open the TotalBuahStore shop to ALL customers?\n\nEveryone can browse and buy immediately (no password)."
      : "Close the shop back to password-preview mode?\n\nCustomers will see the \"opening soon\" screen again; people with the password keep access.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    if (await setSetting("tbs_shop_public", goingPublic ? "true" : "false")) await load();
    setBusy(false);
  };

  const saveFee = async () => {
    const v = feeDraft.trim();
    if (!v) { alert("Type the fee % first (e.g. 5)."); return; }
    if (await setSetting("tbs_marketplace_fee_pct", v)) { setFeeDraft(""); await load(); }
  };

  const retryPush = async (id: string) => {
    setBusy(true);
    const r = await fetch("/api/admin/tbs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_push", order_id: id }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) { alert(r.already ? "Already pushed." : `Pushed to the back-office — ${r.tbs_order_no || "ok"}.`); load(); }
    else alert(r?.error || "Push failed again — the ERP may be unreachable.");
  };

  const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 };
  const s = data?.shop;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>🍒 TotalBuahStore shop</h1>
        {err ? <p style={{ marginTop: 12, color: "#C0392B" }}>{err}</p> : null}

        {data ? (
          <>
            {/* status + launch */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
              <div style={{ ...card, borderTop: `4px solid ${s?.public ? GREEN : "#c99700"}` }}>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>Shop status</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: s?.public ? GREEN : "#8a6d00" }}>
                  {s?.public ? "🟢 LIVE to all customers" : "🟡 Password preview"}
                </div>
                {!s?.public ? (
                  <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>
                    Early-access password: <b style={{ color: COLORS.black }}>{s?.preview_key}</b>
                  </div>
                ) : null}
                <button onClick={toggleLaunch} disabled={busy}
                  style={{ marginTop: 10, border: "none", background: s?.public ? "#8a6d00" : GREEN, color: "#fff", fontWeight: 800, fontSize: 13, padding: "10px 18px", borderRadius: 999, cursor: "pointer" }}>
                  {s?.public ? "Close to password preview" : "🚀 Open shop to everyone"}
                </button>
              </div>

              <div style={card}>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>This month (WIB)</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: COLORS.black }}>{data.month.orders} order{data.month.orders === 1 ? "" : "s"} · {rp(data.month.goods_idr)}</div>
                <div style={{ fontSize: 12.5, color: "#0f6e56", fontWeight: 800, marginTop: 4 }}>Marketplace fee earned: {rp(data.month.fee_idr)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Link href="/admin/reports" style={{ textDecoration: "none", fontSize: 12.5, fontWeight: 800, color: COLORS.blue }}>Reports ›</Link>
                  <Link href="/admin/tbs-tf" style={{ textDecoration: "none", fontSize: 12.5, fontWeight: 800, color: COLORS.blue }}>Tukar Faktur ›</Link>
                </div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>Marketplace fee</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: COLORS.black }}>{Number(s?.fee_pct ?? 5)}% of TBS goods</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <input value={feeDraft} onChange={(e) => setFeeDraft(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(s?.fee_pct ?? 5)}
                    style={{ width: 64, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)" }} />
                  <button onClick={saveFee} style={{ border: "none", background: GREEN, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "8px 14px", borderRadius: 999, cursor: "pointer" }}>💾 Save</button>
                </div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>Stores (live from the ERP)</div>
                {Array.isArray(data.stores) && data.stores.length ? data.stores.map((st: any) => (
                  <div key={st.code || st.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                    <span style={{ fontWeight: 700 }}>{st.name || st.code}</span>
                    <span style={{ color: COLORS.muted }}>{Number(st.items || 0).toLocaleString("id-ID")} items</span>
                  </div>
                )) : <div style={{ marginTop: 6, color: RED, fontWeight: 800, fontSize: 13 }}>⚠️ ERP unreachable right now</div>}
                {data.backoffice_url ? (
                  <a href={data.backoffice_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 800, color: COLORS.blue, textDecoration: "none" }}>
                    Open TBS back-office ↗
                  </a>
                ) : null}
              </div>
            </div>

            {/* recent orders + push status */}
            <section style={{ ...card, marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: COLORS.black, margin: 0 }}>Recent TBS orders</h2>
                <span style={{ fontSize: 12, color: COLORS.muted }}>“Pushed” = handed to the store’s Web Orders screen</span>
              </div>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left", color: COLORS.muted, fontSize: 11 }}>
                    <th style={{ padding: 6 }}>When (UTC)</th><th style={{ padding: 6 }}>Order</th><th style={{ padding: 6 }}>Store</th>
                    <th style={{ padding: 6 }}>Total</th><th style={{ padding: 6 }}>Payment</th><th style={{ padding: 6 }}>Back-office</th><th style={{ padding: 6 }}></th>
                  </tr></thead>
                  <tbody>{(data.recent || []).map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                      <td style={{ padding: 6, whiteSpace: "nowrap" }}>{r.when}</td>
                      <td style={{ padding: 6 }}><Link href={`/admin/orders/${r.id}`} style={{ color: COLORS.blue, fontWeight: 700, textDecoration: "none" }}>{r.order_no ? `#${r.order_no}` : r.id.slice(0, 8)}</Link></td>
                      <td style={{ padding: 6 }}>{r.store}</td>
                      <td style={{ padding: 6 }}>{rp(r.total)}</td>
                      <td style={{ padding: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: r.status === "PAID" ? "#E8F3EC" : "#FFF6E5", color: r.status === "PAID" ? GREEN : "#8a6d00" }}>{r.status}</span>
                      </td>
                      <td style={{ padding: 6 }}>
                        {r.pushed ? (
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: GREEN }}>✓ {r.tbs_order_no || "pushed"}</span>
                        ) : r.status === "PAID" ? (
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: RED }} title={r.push_error || ""}>✗ not pushed{r.push_error ? ` — ${String(r.push_error).slice(0, 40)}` : ""}</span>
                        ) : (
                          <span style={{ fontSize: 11.5, color: COLORS.muted }}>— waits for payment</span>
                        )}
                      </td>
                      <td style={{ padding: 6 }}>
                        {!r.pushed && r.status === "PAID" ? (
                          <button onClick={() => retryPush(r.id)} disabled={busy}
                            style={{ border: `1px solid ${RED}`, background: "#fff", color: RED, fontWeight: 800, fontSize: 11.5, padding: "5px 12px", borderRadius: 999, cursor: "pointer" }}>
                            Retry push
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}{(data.recent || []).length === 0 && <tr><td style={{ padding: 10, color: COLORS.muted }} colSpan={7}>No TBS orders yet.</td></tr>}</tbody>
                </table>
              </div>
            </section>

            <p style={{ fontSize: 12, color: COLORS.muted, marginTop: 12 }}>
              Storefront: <Link href="/tbs" style={{ color: COLORS.blue, fontWeight: 700 }}>cookiedoh.co.id/tbs</Link> · catalog, stock and pick/pack live in the TBS back-office; money and fees live here.
            </p>
          </>
        ) : !err ? <p style={{ marginTop: 16, color: COLORS.muted }}>Loading…</p> : null}
      </div>
    </main>
  );
}
