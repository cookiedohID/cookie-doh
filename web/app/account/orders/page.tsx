"use client";

// web/app/account/orders/page.tsx — member purchase history (cafe + online).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type Item = { id?: string; name: string; qty: number; price: number; free: boolean; href?: string | null };
type Order = {
  id: string;
  orderNo: number | null;
  createdAt: string | null;
  paidAt: string | null;
  total: number;
  status: string;
  channel: string;
  items: Item[];
  fulfilType?: string | null;
  scheduleDate?: string | null;
  scheduleTime?: string | null;
  pickupName?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  gift?: { message: string | null; to: string | null; from: string | null } | null;
};

function fmtSchedule(date: string | null | undefined, time: string | null | undefined) {
  if (!date && !time) return "";
  let d = date || "";
  try { if (date) d = new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch {}
  return [d, time].filter(Boolean).join(" · ");
}

const rupiah = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

function fmtDate(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function statusColor(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "PAID") return { bg: "#EAF2FF", fg: COLORS.blue };
  if (s === "FAILED") return { bg: "#FDECEC", fg: "#C0392B" };
  return { bg: "#FFF4E5", fg: "#9A6700" }; // pending/other
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabaseBrowser().auth.getSession();
        const t = data.session?.access_token;
        if (!t) { router.replace("/account/login"); return; }
        const res = await fetch("/api/account/orders", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
        if (res.status === 401) { router.replace("/account/login"); return; }
        const j = await res.json().catch(() => ({}));
        if (j?.ok) setOrders(Array.isArray(j.orders) ? j.orders : []);
        else setErr(j?.error || "We couldn't load your orders.");
      } catch {
        setErr("We couldn't load your orders. Please check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px 80px" }}>
        <Link href="/account" style={{ color: COLORS.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>‹ Back to account</Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 800, color: COLORS.black }}>My Orders</h1>
        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: 13 }}>Your cafe &amp; online purchases.</p>

        {loading ? (
          <p style={{ marginTop: 24, color: COLORS.muted }}>Loading…</p>
        ) : err ? (
          <p style={{ marginTop: 24, color: "#C0392B" }}>{err}</p>
        ) : orders.length === 0 ? (
          <div style={{ marginTop: 24, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🍪</div>
            <div style={{ marginTop: 8, fontWeight: 700, color: COLORS.black }}>No orders yet</div>
            <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted }}>Orders you place online or in the cafe will show up here.</div>
            <Link href="/" style={{ display: "inline-block", marginTop: 14, background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "10px 22px", borderRadius: 999, textDecoration: "none" }}>Start an order</Link>
          </div>
        ) : (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            {orders.map((o) => {
              const sc = statusColor(o.status);
              return (
                <div key={o.id} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontWeight: 800, color: COLORS.black }}>
                      {o.orderNo ? `Order #${o.orderNo}` : "Order"}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: sc.fg, background: sc.bg, padding: "3px 9px", borderRadius: 999 }}>{o.status}</span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, color: COLORS.muted, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>{fmtDate(o.paidAt || o.createdAt)}</span>
                    <span>•</span>
                    <span>{o.channel}</span>
                  </div>

                  {/* Where / when */}
                  {o.pickupName || o.fulfilType === "pickup" ? (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,0,0,0.03)", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#333" }}>🏬 Pickup{o.pickupName ? `: ${o.pickupName}` : ""}</div>
                      {o.pickupAddress ? <div style={{ fontSize: 12.5, color: "#555", marginTop: 2, lineHeight: 1.4 }}>{o.pickupAddress}</div> : null}
                      {fmtSchedule(o.scheduleDate, o.scheduleTime) ? <div style={{ fontSize: 12.5, color: "#555", marginTop: 2 }}>🕒 {fmtSchedule(o.scheduleDate, o.scheduleTime)}</div> : null}
                    </div>
                  ) : (o.fulfilType === "delivery" || o.deliveryAddress) ? (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,0,0,0.03)", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#333" }}>🛵 Delivery{fmtSchedule(o.scheduleDate, o.scheduleTime) ? ` · ${fmtSchedule(o.scheduleDate, o.scheduleTime)}` : ""}</div>
                      {o.deliveryAddress ? <div style={{ fontSize: 12.5, color: "#555", marginTop: 2, lineHeight: 1.4 }}>{o.deliveryAddress}</div> : null}
                    </div>
                  ) : fmtSchedule(o.scheduleDate, o.scheduleTime) ? (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,0,0,0.03)", borderRadius: 10, fontSize: 13, fontWeight: 800, color: "#333" }}>🕒 {fmtSchedule(o.scheduleDate, o.scheduleTime)}</div>
                  ) : null}

                  {/* Gift card */}
                  {o.gift ? (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#EAF2FF", border: "1px solid rgba(0,20,167,0.2)", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.blue }}>🎁 Gift</div>
                      {o.gift.to ? <div style={{ fontSize: 12.5, color: "#333", marginTop: 2 }}>To: {o.gift.to}</div> : null}
                      {o.gift.from ? <div style={{ fontSize: 12.5, color: "#333" }}>From: {o.gift.from}</div> : null}
                      {o.gift.message ? <div style={{ fontSize: 12.5, color: "#333", marginTop: 4, fontStyle: "italic", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>&ldquo;{o.gift.message}&rdquo;</div> : null}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                    {o.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#333" }}>
                        <span>
                          {it.qty}× {it.href ? (
                            <Link href={it.href} style={{ color: COLORS.blue, textDecoration: "none", fontWeight: 600 }}>{it.name}</Link>
                          ) : it.name}
                          {it.free ? <span style={{ color: COLORS.blue, fontWeight: 700 }}> · free</span> : null}
                        </span>
                        <span style={{ color: COLORS.muted }}>{it.free || !it.price ? "—" : rupiah(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", fontWeight: 800, color: COLORS.black }}>
                    <span>Total</span>
                    <span>{rupiah(o.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
