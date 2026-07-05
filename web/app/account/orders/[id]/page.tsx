"use client";

// web/app/account/orders/[id]/page.tsx — Shopee-style order detail (owner's
// inspo set): status banner + fulfilment timeline, pickup/delivery info,
// itemized lines, payment method, order number with copy, and Buy again
// (rebuilds the TBS basket from this order; live validation reprices it).
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const rupiah = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const GREEN = "#135232";

const PAY_LABEL: Record<string, string> = {
  qris: "QRIS", gopay: "GoPay", shopeepay: "ShopeePay", bank_transfer: "Bank transfer",
  echannel: "Mandiri bill", credit_card: "Card", cstore: "Convenience store",
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabaseBrowser().auth.getSession();
        const t = data.session?.access_token;
        if (!t) { router.replace("/account/login"); return; }
        const res = await fetch("/api/account/orders", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const o = (j?.orders || []).find((x: any) => String(x.id) === id);
        if (o) setOrder(o);
        else setErr("We couldn't find this order in your account.");
      } catch { setErr("We couldn't load this order."); }
      finally { setLoading(false); }
    })();
  }, [id, router]);

  const stage = useMemo(() => {
    if (!order) return "preparing";
    const pay = String(order.status).toUpperCase();
    if (pay === "PENDING" || pay === "UNPAID") return "topay";
    if (pay === "FAILED") return "cancelled";
    const st = order.tbs?.stage;
    if (st === "new" || st === "confirmed") return "preparing";
    if (st === "ready") return "ready";
    if (st === "cancelled") return "cancelled";
    if (st === "completed") return "done";
    return order.tbs ? "preparing" : "done";
  }, [order]);

  const banner = {
    topay: { bg: "#FFF4E5", fg: "#9A6700", text: "💳 Waiting for payment" },
    preparing: { bg: "#EAF2FF", fg: COLORS.blue, text: "👩‍🍳 Being prepared" },
    ready: { bg: "#E8F3EC", fg: GREEN, text: order?.fulfilType === "pickup" ? "🛍 Ready for pickup!" : "🛵 Ready — on its way" },
    done: { bg: GREEN, fg: "#fff", text: "✅ Order completed" },
    cancelled: { bg: "#FDECEC", fg: "#C0392B", text: "✗ Cancelled" },
  }[stage] as { bg: string; fg: string; text: string };

  const TIMELINE = ["Paid", "Being prepared", "Ready", "Completed"];
  const stageIdx = stage === "topay" ? -1 : stage === "preparing" ? 1 : stage === "ready" ? 2 : stage === "done" ? 3 : -1;

  const buyAgain = () => {
    const tbsLines = (order?.items || []).filter((i: any) => (i.href || "").startsWith("/tbs") && i.sku);
    if (!tbsLines.length || !order?.tbs?.store) return;
    try {
      // don't silently clobber a basket the customer is building
      const cur = JSON.parse(localStorage.getItem("tbs_basket") || "null");
      if (cur?.items && Object.keys(cur.items).length > 0) {
        if (!window.confirm("You already have items in your TotalBuahStore basket — replace them with this order?")) return;
      }
      const items: Record<string, any> = {};
      for (const l of tbsLines) items[l.sku] = { sku: l.sku, name: l.name, price: l.price, unit: l.unit || "pcs", qty: l.qty };
      localStorage.setItem("tbs_store", order.tbs.store);
      localStorage.setItem("tbs_basket", JSON.stringify({ store: order.tbs.store, items }));
      window.dispatchEvent(new Event("tbs-basket"));
      router.push("/tbs"); // live validation reprices + stock-checks the basket
    } catch { /* ignore */ }
  };

  const copyNo = async () => {
    try { await navigator.clipboard.writeText(order?.orderNo ? `#${order.orderNo}` : id); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* ignore */ }
  };

  const hasTbsItems = (order?.items || []).some((i: any) => (i.href || "").startsWith("/tbs") && i.sku);

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px 90px" }}>
        <Link href="/account/orders" style={{ color: COLORS.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>‹ My Orders</Link>

        {loading ? <p style={{ marginTop: 24, color: COLORS.muted }}>Loading…</p> :
         err ? <p style={{ marginTop: 24, color: "#C0392B" }}>{err}</p> :
         order ? (
          <>
            {/* status banner */}
            <div style={{ marginTop: 12, background: banner.bg, color: banner.fg, borderRadius: 14, padding: "14px 16px", fontWeight: 900, fontSize: 15 }}>
              {banner.text}
              {order.tbs?.orderNo ? <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, opacity: 0.85 }}>Store order {order.tbs.orderNo} · {order.tbs.storeName || order.tbs.store}</div> : null}
            </div>

            {/* timeline */}
            {stage !== "cancelled" && stage !== "topay" ? (
              <div style={{ marginTop: 14, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {TIMELINE.map((t, i) => (
                    <div key={t} style={{ flex: i === 0 ? "0 0 auto" : 1, display: "flex", alignItems: "center" }}>
                      {i > 0 ? <div style={{ flex: 1, height: 3, background: i <= stageIdx ? GREEN : "rgba(0,0,0,0.10)", margin: "0 4px" }} /> : null}
                      <div style={{ width: 22, height: 22, borderRadius: 999, flex: "0 0 auto", display: "grid", placeItems: "center", background: i <= stageIdx ? GREEN : "rgba(0,0,0,0.10)", color: "#fff", fontSize: 12, fontWeight: 900 }}>
                        {i <= stageIdx ? "✓" : ""}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  {TIMELINE.map((t, i) => (
                    <span key={t} style={{ fontSize: 10.5, fontWeight: i === stageIdx ? 900 : 600, color: i <= stageIdx ? GREEN : COLORS.muted, textAlign: i === 0 ? "left" : i === TIMELINE.length - 1 ? "right" : "center" }}>{t}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* where / when */}
            {(order.pickupName || order.deliveryAddress) ? (
              <div style={{ marginTop: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#333" }}>
                  {order.fulfilType === "pickup" ? `🏬 Pickup: ${order.pickupName || ""}` : "🛵 Delivery"}
                </div>
                <div style={{ fontSize: 12.5, color: "#555", marginTop: 3, lineHeight: 1.5 }}>{order.pickupAddress || order.deliveryAddress}</div>
              </div>
            ) : null}

            {/* items */}
            <div style={{ marginTop: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "6px 16px" }}>
              {(order.items || []).map((it: any, i: number) => {
                const isTbs = (it.href || "").startsWith("/tbs");
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, flex: "0 0 auto", display: "grid", placeItems: "center", fontSize: 20, background: isTbs ? "#EAF3E7" : "#EAF2FF" }}>
                      {isTbs ? "🍒" : it.href === "/smoothies" ? "🥤" : "🍪"}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#222", fontWeight: 600 }}>
                        {it.href ? <Link href={it.href} style={{ color: "#222", textDecoration: "none" }}>{it.name}</Link> : it.name}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>× {it.qty}{it.free ? " · free reward" : ""}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{it.free ? "FREE" : rupiah(it.price * it.qty)}</div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: 900, fontSize: 15 }}>
                <span>Total</span><span>{rupiah(order.total)}</span>
              </div>
            </div>

            {/* order facts */}
            <div style={{ marginTop: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "12px 16px", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ color: COLORS.muted }}>Order no.</span>
                <span style={{ fontWeight: 800 }}>
                  {order.orderNo ? `#${order.orderNo}` : id.slice(0, 8)}
                  <button onClick={copyNo} style={{ marginLeft: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "2px 8px", cursor: "pointer" }}>{copied ? "Copied ✓" : "Copy"}</button>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ color: COLORS.muted }}>Date</span>
                <span style={{ fontWeight: 700 }}>{new Date(order.paidAt || order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {order.paymentMethod ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                  <span style={{ color: COLORS.muted }}>Payment</span>
                  <span style={{ fontWeight: 700 }}>{PAY_LABEL[order.paymentMethod] || order.paymentMethod}</span>
                </div>
              ) : null}
            </div>

            {/* actions */}
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {hasTbsItems ? (
                <button onClick={buyAgain} style={{ border: "none", background: GREEN, color: "#fff", fontWeight: 900, fontSize: 14.5, padding: "13px", borderRadius: 12, cursor: "pointer" }}>
                  🍒 Buy again — rebuild this basket
                </button>
              ) : null}
              <a href={`https://wa.me/6281932181818?text=${encodeURIComponent(`Hi! About my order ${order.orderNo ? "#" + order.orderNo : id.slice(0, 8)} 🙏`)}`} target="_blank" rel="noreferrer"
                style={{ textAlign: "center", textDecoration: "none", border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: "#222", fontWeight: 800, fontSize: 13.5, padding: "12px", borderRadius: 12 }}>
                💬 Need help? Chat with us
              </a>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
