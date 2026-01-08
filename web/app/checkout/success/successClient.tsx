"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const WHATSAPP_NUMBER = "6281932181818";
const SUPPORT_EMAIL = "hello@cookiedoh.co.id";

export default function SuccessClient() {
  const sp = useSearchParams();
  const orderId = sp.get("order_id") || "—";

  const waText = encodeURIComponent(
    `Hi Cookie Doh 💙\n\nI just placed an order.\nOrder ID: ${orderId}\n\nCan you help me track it?`
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
        ✅ COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Payment successful</span>
      </div>

      <h1 style={{ margin: "12px 0 8px", fontSize: 32, letterSpacing: -0.3 }}>You’re all set 🎉</h1>

      <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.55, maxWidth: 720 }}>
        Payment confirmed. We’re preparing your cookies right now. We’ll notify you when your order is on the way.
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

        <div style={{ marginTop: 10, fontSize: 13, color: "rgba(0,0,0,0.70)", lineHeight: 1.5 }}>
          Keep this order ID for quick support. If you chose instant delivery (Jakarta), you’ll usually get updates faster.
        </div>
      </section>

      <section
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#fff",
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 6 }}>What happens next</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "rgba(0,0,0,0.75)", lineHeight: 1.6 }}>
            <li>We prepare your cookies (fresh + packed).</li>
            <li>Courier is assigned based on your selection & location.</li>
            <li>You’ll receive delivery updates via WhatsApp / email.</li>
          </ol>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#fff",
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 6 }}>Need help?</div>
          <div style={{ color: "rgba(0,0,0,0.75)", lineHeight: 1.55, marginBottom: 12 }}>
            Message us anytime with your Order ID — we’ll help quickly.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                background: "rgba(0,0,0,0.02)",
                color: "inherit",
                fontWeight: 950,
              }}
            >
              WhatsApp us →
            </a>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Cookie Doh Order ${orderId}`)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 14,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(0,0,0,0.02)",
                color: "inherit",
                fontWeight: 950,
              }}
            >
              Email →
            </a>
          </div>
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
        <div style={{ fontWeight: 950, marginBottom: 6 }}>Track your orders</div>
        <div style={{ color: "rgba(0,0,0,0.75)", lineHeight: 1.55, marginBottom: 12 }}>
          Guest checkout is totally fine. If you want an order history + tracking page, continue with Google.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/login"
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
            Continue with Google →
          </Link>

          <Link
            href="/build"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              textDecoration: "none",
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              color: "inherit",
              fontWeight: 950,
            }}
          >
            Build another box
          </Link>
        </div>
      </section>
    </main>
  );
}
