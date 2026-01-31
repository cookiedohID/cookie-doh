// web/app/checkout/success/successClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";


const COLORS = {
  blue: "#0014a7",
  orange: "#FF5A00",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

function formatIDRLoose(amount: string | null) {
  if (!amount) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function normalizeWaNumber(raw: string) {
  const s = (raw || "").trim().replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("62")) return `+${s}`;
  if (s.startsWith("0")) return `+62${s.slice(1)}`;
  return s;
}

function waLink(number: string, text: string) {
  const phone = normalizeWaNumber(number).replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${phone}?text=${msg}`;
}

function mapsLink(address: string) {
  const q = encodeURIComponent(address || "");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}


function statusLabel(txStatus: string | null) {
  const s = (txStatus || "").toLowerCase();

  // Midtrans common statuses: settlement, capture, pending, deny, cancel, expire, failure
  if (s === "settlement" || s === "capture")
    return { kind: "success" as const, title: "Payment received" };
  if (s === "pending") return { kind: "pending" as const, title: "Payment pending" };
  if (s === "deny" || s === "cancel" || s === "expire" || s === "failure")
    return { kind: "failed" as const, title: "Payment not completed" };

  // Unknown / missing
  return { kind: "success" as const, title: "Order received" };
}

function normalizePaymentStatus(txStatus: string | null) {
  const s = (txStatus || "").toLowerCase();
  if (s === "settlement" || s === "capture") return "PAID";
  if (s === "pending") return "PENDING";
  if (s === "deny" || s === "cancel" || s === "expire" || s === "failure") return "FAILED";
  return s ? s.toUpperCase() : "PAID";
}

function parseItemsText(raw: string | null) {
  const t = (raw || "").trim();
  if (!t) return null;

  // If passed as multi-line, keep it
  // If passed as JSON (array), we format it nicely
  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        const lines = arr
          .map((x: any) => {
            const name = String(x?.name || x?.title || "").trim();
            const qty = Number(x?.quantity ?? x?.qty ?? 0);
            if (!name) return null;
            if (!Number.isFinite(qty) || qty <= 0) return `• ${name}`;
            return `• ${name} ×${qty}`;
          })
          .filter(Boolean);
        return lines.length ? lines.join("\n") : null;
      }
    } catch {
      // fall through
    }
  }

  return t;
}

export default function SuccessClient() {
  
  const sp = useSearchParams();
  const router = useRouter();

   // IDs
  const orderId = sp.get("order_id") || sp.get("orderId") || sp.get("id");
  const orderNo = sp.get("order_no") || sp.get("orderNo");
  const midtransOrderId = sp.get("midtrans_order_id") || sp.get("midtransOrderId");

  // Midtrans result (best-effort)
  const txStatus = sp.get("transaction_status") || sp.get("transactionStatus");
  const paymentType = sp.get("payment_type") || sp.get("paymentType");
  const grossAmount = sp.get("gross_amount") || sp.get("grossAmount");
  const amountText = useMemo(() => formatIDRLoose(grossAmount), [grossAmount]);

  // Customer/context (optional)
  const customerName = sp.get("customer_name") || sp.get("name");
  const customerPhone = sp.get("customer_phone") || sp.get("phone");

  // Schedule/context
  const fulfillment = sp.get("fulfillment"); // "delivery" | "pickup"
  const scheduleDate = sp.get("schedule_date") || sp.get("date");
  const scheduleTime = sp.get("schedule_time") || sp.get("time");
  const pickupPoint = sp.get("pickup_point");
  const address = sp.get("address");

  // NEW: optional extra fields if you pass them later
  const shipmentStatus = sp.get("shipment_status") || sp.get("shipmentStatus");
  const paymentStatusFromUrl = sp.get("payment_status") || sp.get("paymentStatus");

  // NEW: optional items text payload (if you pass it later)
  // You can pass either:
  // - items_text
  // - items
  // - boxes_text
  const itemsTextRaw = sp.get("items_text") || sp.get("items") || sp.get("boxes_text");
  const itemsText = useMemo(() => parseItemsText(itemsTextRaw), [itemsTextRaw]);

  const status = useMemo(() => statusLabel(txStatus), [txStatus]);

  const businessWa =
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    process.env.NEXT_PUBLIC_WA_NUMBER ||
    "6281932181818";
  
  
  const [order, setOrder] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!orderId) {
        setLoadingOrder(false);
        return;
      }
      setLoadingOrder(true);
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok && json?.order) setOrder(json.order);
      } finally {
        if (alive) setLoadingOrder(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [orderId]);


 

  // ✅ UPDATED: WhatsApp message matches Admin "Order Summary" format
    const waMessage = useMemo(() => {

    const o = order;

    const orderLabel = o?.order_no || o?.id || orderId || "—";
    const paid = (o?.payment_status || "UNPAID").toString().toUpperCase();

    const fulfil = (o?.fulfilment_status || "-").toString();
    const sched = [o?.schedule_date, o?.schedule_time].filter(Boolean).join(" ");
    const fulfilLine = sched ? `${fulfil} • ${sched}` : fulfil || "-";

    const shipLine = (o?.shipment_status || "-").toString();

    const customerName = (o?.customer_name || "").toString();
    const customerPhone = (o?.customer_phone || "").toString();

    const addrLine = (o?.shipping_address || "-").toString();

    const totalNum = Number(o?.total_idr ?? 0);
    const totalText =
      Number.isFinite(totalNum) && totalNum > 0
        ? new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
          }).format(totalNum)
        : "—";

    const items = Array.isArray(o?.items) ? o.items : [];
    const itemLines = items
      .map((it: any) => {
        const name = String(it?.name || "").trim();
        const qty = Number(it?.quantity || 0);
        if (!name) return null;
        return qty > 0 ? `• ${name} ×${qty}` : `• ${name}`;
      })
      .filter(Boolean);

    const paymentType = (o?.payment_type || "").toString();
    const txStatus = (o?.transaction_status || "").toString();

    const lines: string[] = [];
    lines.push("Cookie Doh — Order Summary");
    lines.push("");
    lines.push(`Order: ${orderLabel}`);
    lines.push(`Payment: ${paid}`);
    lines.push(`Fulfilment: ${fulfilLine}`);
    lines.push(`Shipment: ${shipLine}`);
    lines.push("");
    if (customerName) lines.push(`Customer: ${customerName}`);
    if (customerPhone) lines.push(`Phone: ${customerPhone}`);
    if (customerName || customerPhone) lines.push("");


   if (o?.fulfilment_status === "pickup") {
      if (o?.pickup_point_name) lines.push(`Pickup point: ${o.pickup_point_name}`);
      const pAddr = (o?.pickup_point_address || "-").toString();
      lines.push("Pickup address:");
      lines.push(pAddr);
      if (pAddr && pAddr !== "-") lines.push(`Google Maps: ${mapsLink(pAddr)}`);
      lines.push("");
    } else {
      const dAddr = (o?.shipping_address || "-").toString();
      lines.push("Delivery address:");
      lines.push(dAddr);
      if (dAddr && dAddr !== "-") lines.push(`Google Maps: ${mapsLink(dAddr)}`);
      lines.push("");
    }




    lines.push(`Total: ${totalText}`);
    lines.push("");
    if (itemLines.length) {
      lines.push("Items:");
      lines.push(itemLines.join("\n"));
      lines.push("");
    }
    if (paymentType) lines.push(`Payment type: ${paymentType}`);
    if (txStatus) lines.push(`Transaction status: ${txStatus}`);
    lines.push("");
    lines.push("Can you help confirm my order? Thank you");

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }, [order, orderId]);

    // Auto-open WhatsApp once when payment is confirmed PAID
      useEffect(() => {
        if (!order) return;
        if (String(order.payment_status || "").toUpperCase() !== "PAID") return;

        const key = `wa_opened_${order.id}`;
        if (typeof window !== "undefined" && sessionStorage.getItem(key) === "1") return;
        sessionStorage.setItem(key, "1");

        const t = setTimeout(() => {
          const url = waLink(businessWa, waMessage);
          window.location.href = url;
        }, 600);

        return () => clearTimeout(t);
      }, [order, businessWa, waMessage]);



  const toneBlock = (() => {
    if (status.kind === "success") {
      return {
        bg: "rgba(0,20,167,0.06)",
        border: "1px solid rgba(0,20,167,0.18)",
        badgeBg: COLORS.blue,
        badgeText: "RECEIVED",
        title: "Thank you 🤍",
        subtitle: "Your payment is received. We’ll confirm your order via WhatsApp.",
      };
    }
    if (status.kind === "pending") {
      return {
        bg: "rgba(255,90,0,0.08)",
        border: "1px solid rgba(255,90,0,0.25)",
        badgeBg: COLORS.orange,
        badgeText: "PENDING",
        title: "Almost there",
        subtitle: "Your payment is still processing. If it takes too long, message us on WhatsApp.",
      };
    }
    return {
      bg: "rgba(0,0,0,0.04)",
      border: "1px solid rgba(0,0,0,0.12)",
      badgeBg: "#111",
      badgeText: "NEEDS ACTION",
      title: "Payment not completed",
      subtitle: "No worries — you can try again or contact us for help.",
    };
  })();

  return (
    <main style={{ minHeight: "100vh", background: COLORS.white }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 120px" }}>
        {/* Header card */}
        <section
          style={{
            borderRadius: 18,
            border: toneBlock.border,
            background: toneBlock.bg,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: toneBlock.badgeBg,
                  color: "#fff",
                  fontWeight: 950,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                }}
              >
                {toneBlock.badgeText}
              </div>

              <h1 style={{ margin: "10px 0 6px", fontSize: 26, color: COLORS.black }}>
                {toneBlock.title}
              </h1>

              <p style={{ margin: 0, color: "rgba(0,0,0,0.65)", lineHeight: 1.6 }}>
                {toneBlock.subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/")}
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                borderRadius: 999,
                padding: "10px 12px",
                fontWeight: 900,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Back home
            </button>
          </div>

          {/* Order meta */}
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {orderNo ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Order No</div>
                <div style={{ fontWeight: 950, color: COLORS.black }}>{orderNo}</div>
              </div>
            ) : null}

            {orderId ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Order ID</div>
                <div style={{ fontWeight: 900, color: COLORS.black }}>{orderId}</div>
              </div>
            ) : null}

            {amountText ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Total</div>
                <div style={{ fontWeight: 950, color: COLORS.black }}>{amountText}</div>
              </div>
            ) : null}

            {fulfillment ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Fulfillment</div>
                <div style={{ fontWeight: 900, color: COLORS.black, textTransform: "capitalize" }}>
                  {fulfillment}
                </div>
              </div>
            ) : null}

            {(scheduleDate || scheduleTime) ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Schedule</div>
                <div style={{ fontWeight: 900, color: COLORS.black }}>
                  {[scheduleDate, scheduleTime].filter(Boolean).join(" • ")}
                </div>
              </div>
            ) : null}

            {fulfillment === "pickup" && pickupPoint ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Pickup point</div>
                <div style={{ fontWeight: 900, color: COLORS.black }}>{pickupPoint}</div>
              </div>
            ) : null}

            {paymentType ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Payment</div>
                <div style={{ fontWeight: 900, color: COLORS.black, textTransform: "uppercase", fontSize: 12 }}>
                  {paymentType}
                </div>
              </div>
            ) : null}

            {txStatus ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Status</div>
                <div style={{ fontWeight: 900, color: COLORS.black }}>{txStatus}</div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Next steps */}
        <section
          style={{
            marginTop: 14,
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            background: COLORS.sand,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 950, color: COLORS.black }}>What happens next</div>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.10)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                1
              </div>
              <div style={{ color: "rgba(0,0,0,0.70)", lineHeight: 1.55 }}>
                We review your order and confirm it in WhatsApp.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.10)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                2
              </div>
              <div style={{ color: "rgba(0,0,0,0.70)", lineHeight: 1.55 }}>
                Your cookies are baked fresh and packed with care.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.10)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                3
              </div>
              <div style={{ color: "rgba(0,0,0,0.70)", lineHeight: 1.55 }}>
                For delivery, we’ll share driver details when your order is on the way.
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <a
            href={waLink(businessWa, waMessage)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              height: 52,
              background: COLORS.blue,
              color: "#fff",
              fontWeight: 950,
              textDecoration: "none",
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              padding: "0 14px",
            }}
          >
            Contact us on WhatsApp
          </a>

          <Link
            href="/build"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              height: 52,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "#fff",
              color: COLORS.black,
              fontWeight: 950,
              textDecoration: "none",
              padding: "0 14px",
            }}
          >
            Build another box
          </Link>

          <div style={{ marginTop: 4, color: "#6B6B6B", fontSize: 12, textAlign: "center", fontWeight: 800 }}>
            Secure checkout via Midtrans · Freshly baked · Gift-ready
          </div>
        </section>
      </div>
    </main>
  );
}
