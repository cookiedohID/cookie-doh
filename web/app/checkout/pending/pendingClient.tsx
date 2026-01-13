"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function toWaNumber(input: string) {
  const digits = (input || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}

export default function PendingClient() {
  const sp = useSearchParams();

  const orderId = sp.get("order_id") || "";
  const total = Number(sp.get("total") || "0") || 0;

  const name = sp.get("name") || "";
  const phone = sp.get("phone") || "";
  const address = sp.get("address") || "";
  const building = sp.get("building") || "";
  const postal = sp.get("postal") || "";

  const adminWa = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "";
  const adminWaDigits = toWaNumber(adminWa);

  // ✅ Put your manual payment instructions here (env-based)
  const manualPayInstructions =
    process.env.NEXT_PUBLIC_MANUAL_PAYMENT_INSTRUCTIONS ||
    "Manual payment: Please WhatsApp admin to receive payment instructions (Bank/QRIS).";

  const msgLines = [
    "Hi Cookie Doh 🤍",
    "I’d like to complete manual payment for my order:",
    "",
    orderId ? `Order ID: ${orderId}` : "" : "",
    name ? `Name: ${name}` : "",
    phone ? `WhatsApp: ${phone}` : "",
    total ? `Total: ${formatIDR(total)}` : "",
    address ? `Address: ${address}` : "",
    building ? `Building: ${building}` : "",
    postal ? `Postal Code: ${postal}` : "" : "",
  
    "Please send the proof of payment via Bank transfer",
    "",
    "BCA : 622-0372918 a/n Angelia Tania  🙏",
    
  ].filter(Boolean);

  const waText = encodeURIComponent(msgLines.join("\n"));
  const waLink = adminWaDigits ? `https://wa.me/${adminWaDigits}?text=${waText}` : "#";

  return (
    <main style={{ minHeight: "100vh", background: "#FAF7F2" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 16px" }}>
        <div
          style={{
            borderRadius: 20,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#fff",
            padding: 18,
            boxShadow: "0 14px 30px rgba(0,0,0,0.06)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 950, color: "#101010" }}>
            Payment pending 🤍
          </div>

          <div style={{ marginTop: 8, color: "#6B6B6B", lineHeight: 1.6 }}>
            Your order is saved. We’re starting with <b>manual payment</b> while Midtrans is being verified.
          </div>

          {orderId && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#3C3C3C" }}>
              Order ID: <span style={{ fontWeight: 900 }}>{orderId}</span>
            </div>
          )}

          {total > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#3C3C3C" }}>
              Total: <span style={{ fontWeight: 900 }}>{formatIDR(total)}</span>
            </div>
          )}

          <div
            style={{
              marginTop: 14,
              borderRadius: 16,
              background: "#FAF7F2",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 12,
              color: "#3C3C3C",
              textAlign: "left",
              lineHeight: 1.6,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Payment instructions</div>
            {manualPayInstructions}
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10, justifyItems: "center" }}>
            <a
              href={waLink}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                padding: "14px 22px",
                background: "#0052CC",
                color: "#fff",
                fontWeight: 950,
                textDecoration: "none",
                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                minWidth: 260,
              }}
            >
              WhatsApp admin for payment
            </a>

            <Link href="/" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
              Back to home
            </Link>
          </div>

          {!adminWaDigits && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#6B6B6B" }}>
              (Admin WhatsApp not set. Add NEXT_PUBLIC_WHATSAPP_SUPPORT in env.)
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
