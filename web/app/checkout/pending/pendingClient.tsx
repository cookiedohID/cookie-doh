"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const WHATSAPP_NUMBER = "6281932181818";
const SUPPORT_EMAIL = "hello@cookiedoh.co.id";

export default function PendingClient() {
  const sp = useSearchParams();
  const orderId = sp.get("order_id") || "—";

  const waText = encodeURIComponent(
    `Hi Cookie Doh 💙\n\nMy payment is pending.\nOrder ID: ${orderId}\n\nCan you help me check the status?`
  );

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(0,0,0,0.02)",
          fontWeight: 950,
          fontSize: 12,
        }}
      >
        ⏳ COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Payment pending</span>
      </div>

      <h1 style={{ margin: "12px 0 8px", fontSize: 32, letterSpacing: -0.3 }}>Payment still processing</h1>

      <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.55, maxWidth: 720 }}>
        No worries — this can happen depending on payment method. If your payment completes, we’ll confirm it automatically.
      </p>

      <section
        style={{
          marginTop: 16,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "#fff",
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 6 }}>Order reference</div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(0,0,0,0.02)",
            fontWeight: 1000,
            letterSpacing: 0.2,
          }}
        >
          {orderId}
        </div>
      </section>

      <section
        style={{
          marginTop: 14,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(0,0,0,0.02)",
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 6 }}>What you can do</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(0,0,0,0.75)", lineHeight: 1.6 }}>
          <li>Return to checkout and try the payment again.</li>
          <li>Contact us with your Order ID if you’re unsure.</li>
        </ul>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/checkout"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              textDecoration: "none",
              background: "var(--brand-blue)",
              color: "#fff",
              fontWeight: 1000,
            }}
          >
            Back to checkout →
          </Link>

          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              textDecoration: "none",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "#fff",
              color: "inherit",
              fontWeight: 950,
            }}
          >
            WhatsApp support →
          </a>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Cookie Doh Pending Payment ${orderId}`)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              textDecoration: "none",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "#fff",
              color: "inherit",
              fontWeight: 950,
            }}
          >
            Email →
          </a>
        </div>
      </section>
    </main>
  );
}
