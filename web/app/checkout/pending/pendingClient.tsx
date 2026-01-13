"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PendingClient() {
  const sp = useSearchParams();
  const orderId = sp.get("order_id") || sp.get("orderId") || "";
  const status = sp.get("transaction_status") || sp.get("status") || "pending";

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
          <div style={{ fontSize: 18, fontWeight: 950, color: "#101010" }}>Payment pending 🤍</div>
          <div style={{ marginTop: 8, color: "#6B6B6B", lineHeight: 1.6 }}>
            No worries — your order is saved. Please complete payment and we’ll start baking right after 🍪
          </div>

          {orderId && (
            <div style={{ marginTop: 12, fontSize: 13, color: "#3C3C3C" }}>
              Order ID: <span style={{ fontWeight: 900 }}>{orderId}</span>
            </div>
          )}

          <div style={{ marginTop: 18, display: "grid", gap: 10, justifyItems: "center" }}>
            <Link
              href="/cart"
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
                minWidth: 220,
              }}
            >
              Back to cart
            </Link>

            <div style={{ fontSize: 12, color: "#6B6B6B" }}>
              Status: <span style={{ fontWeight: 800 }}>{status}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
