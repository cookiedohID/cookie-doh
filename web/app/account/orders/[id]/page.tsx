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
import { useLang } from "@/lib/i18n";
import { OrderThumb } from "@/lib/orderThumb";

const rupiah = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const GREEN = "#135232";

const PAY_LABEL: Record<string, string> = {
  qris: "QRIS", gopay: "GoPay", shopeepay: "ShopeePay", bank_transfer: "Bank transfer",
  echannel: "Mandiri bill", credit_card: "Card", cstore: "Convenience store",
};

export default function OrderDetailPage() {
  const { t } = useLang();
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

  const TIMELINE = [t("ord.timeline.paid"), t("ord.timeline.preparing"), t("ord.timeline.ready"), t("ord.timeline.done")];
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

  // rating (Shopee 'Nilai') — editable once paid
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [rateMsg, setRateMsg] = useState("");
  useEffect(() => {
    if (order?.rating) { setStars(Number(order.rating.stars) || 0); setComment(order.rating.comment || ""); }
  }, [order]);
  const submitRating = async (n: number) => {
    setStars(n);
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const t = data.session?.access_token;
      if (!t) return;
      const r = await fetch("/api/account/orders/rate", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ order_id: id, stars: n, comment }),
      }).then((x) => x.json());
      setRateMsg(r?.ok ? (r?.earned > 0 ? `Thank you! +${r.earned} 🍒 points 💛` : "Thank you! 💛") : (r?.error || "Couldn't save."));
      setTimeout(() => setRateMsg(""), 2500);
    } catch { setRateMsg("Couldn't save."); }
  };

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

            {/* courier tracking (CD deliveries with a live waybill) */}
            {order.shipping ? (
              <div style={{ marginTop: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#333" }}>{t("ord.shippingInfo")}</div>
                    <div style={{ fontSize: 12.5, color: "#555", marginTop: 3 }}>
                      {order.shipping.courier ? `${order.shipping.courier}: ` : ""}{order.shipping.waybill || "—"}
                    </div>
                  </div>
                  {order.shipping.trackingUrl ? (
                    <a href={order.shipping.trackingUrl} target="_blank" rel="noreferrer"
                      style={{ flex: "0 0 auto", textDecoration: "none", border: `1.5px solid ${GREEN}`, color: GREEN, fontWeight: 800, fontSize: 12.5, padding: "8px 16px", borderRadius: 999 }}>
                      {t("ord.track")}
                    </a>
                  ) : null}
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
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <OrderThumb it={it} size={44} />
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
                <span style={{ color: COLORS.muted }}>{t("ord.orderNo")}</span>
                <span style={{ fontWeight: 800 }}>
                  {order.orderNo ? `#${order.orderNo}` : id.slice(0, 8)}
                  <button onClick={copyNo} style={{ marginLeft: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "2px 8px", cursor: "pointer" }}>{copied ? t("ord.copied") : t("ord.copy")}</button>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ color: COLORS.muted }}>{t("ord.date")}</span>
                <span style={{ fontWeight: 700 }}>{new Date(order.paidAt || order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {order.paymentMethod ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                  <span style={{ color: COLORS.muted }}>{t("ord.payment")}</span>
                  <span style={{ fontWeight: 700 }}>{PAY_LABEL[order.paymentMethod] || order.paymentMethod}</span>
                </div>
              ) : null}
            </div>

            {order.payUrl ? (
              <a href={order.payUrl} style={{ display: "block", marginTop: 12, textAlign: "center", textDecoration: "none", background: "#0014A7", color: "#fff", fontWeight: 900, fontSize: 14.5, padding: "13px", borderRadius: 12 }}>
                {t("ord.continuePayment")} — {new Intl.NumberFormat("id-ID").format(order.total)} IDR
              </a>
            ) : null}

            {/* arrival promise (TBS orders still in the queue) */}
            {order.tbs && (stage === "preparing") ? (
              <div style={{ marginTop: 12, background: "#FFF9EC", border: "1px solid #F0DCA8", borderRadius: 14, padding: "10px 14px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700 }}>
                🛡 Arrival promise: ready within 3 store hours (10:00–21:00) of payment — or we send you a Rp10.000 voucher automatically.
              </div>
            ) : null}
            {(order as any).promiseVoucher ? (
              <div style={{ marginTop: 12, background: "#E8F3EC", border: "1px solid rgba(19,82,50,0.3)", borderRadius: 14, padding: "10px 14px", fontSize: 12.5, color: GREEN, fontWeight: 800 }}>
                🎟 We were late — voucher {(order as any).promiseVoucher.code} (Rp{Number((order as any).promiseVoucher.value).toLocaleString("id-ID")} off) is yours, sent by WhatsApp.
              </div>
            ) : null}

            {/* rating */}
            {String(order.status).toUpperCase() === "PAID" ? (
              <div style={{ marginTop: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#333" }}>{t("ord.rate")}{!order.rating ? <span style={{ color: GREEN, fontWeight: 800 }}> {t("ord.rateEarn")}</span> : null}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => submitRating(n)} aria-label={`${n} stars`}
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: 26, lineHeight: 1, filter: n <= stars ? "none" : "grayscale(1) opacity(0.35)" }}>⭐</button>
                  ))}
                  {rateMsg ? <span style={{ alignSelf: "center", fontSize: 12.5, fontWeight: 700, color: GREEN }}>{rateMsg}</span> : null}
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => { if (stars > 0) submitRating(stars); }}
                  placeholder={t("ord.tellMore")} rows={2}
                  style={{ width: "100%", marginTop: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, resize: "vertical" }} />
              </div>
            ) : null}

            {/* actions */}
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {hasTbsItems ? (
                <button onClick={buyAgain} style={{ border: "none", background: GREEN, color: "#fff", fontWeight: 900, fontSize: 14.5, padding: "13px", borderRadius: 12, cursor: "pointer" }}>
                  {t("ord.buyAgain")}
                </button>
              ) : null}
              <a href={`https://wa.me/6281932181818?text=${encodeURIComponent(`Hi! About my order ${order.orderNo ? "#" + order.orderNo : id.slice(0, 8)} 🙏`)}`} target="_blank" rel="noreferrer"
                style={{ textAlign: "center", textDecoration: "none", border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: "#222", fontWeight: 800, fontSize: 13.5, padding: "12px", borderRadius: 12 }}>
                {t("ord.needHelp")}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
