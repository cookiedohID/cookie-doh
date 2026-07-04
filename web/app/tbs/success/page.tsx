"use client";

// web/app/tbs/success/page.tsx — TotalBuahStore order confirmation.
import Link from "next/link";
import { GREEN, RED, CREAM, TbsCherry } from "../shared";

export default function TbsSuccessPage() {
  return (
    <main style={{ minHeight: "70vh", background: CREAM, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 440, background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", padding: "30px 22px" }}>
        <TbsCherry size={46} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: GREEN, margin: "12px 0 6px" }}>Order received! 🎉</h1>
        <p style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
          The store is getting your order ready. We&apos;ll <b>WhatsApp you</b> when it&apos;s
          confirmed — and when it&apos;s ready for pickup or on its way.
        </p>
        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          <Link href="/account/orders" style={{ textDecoration: "none", background: GREEN, color: "#fff", fontWeight: 900, fontSize: 14, padding: "12px", borderRadius: 10 }}>View my orders</Link>
          <Link href="/tbs" style={{ textDecoration: "none", border: `1.5px solid ${RED}`, color: RED, fontWeight: 900, fontSize: 14, padding: "11px", borderRadius: 10 }}>Keep shopping</Link>
        </div>
      </div>
    </main>
  );
}
