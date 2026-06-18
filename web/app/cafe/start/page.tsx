// web/app/cafe/start/page.tsx — POS attract / welcome screen.
// Leave the kiosk on this page; tapping "Order" goes to the menu (/cafe).
import Image from "next/image";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

export default function CafeStartPage() {
  return (
    <main style={{ position: "relative", minHeight: "100vh", display: "grid", placeItems: "center", overflow: "hidden", background: COLORS.black }}>
      {/* Hero */}
      <Image src="/flavors/CxCookiedoh/hero image.png" alt="" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.30) 40%, rgba(0,0,0,0.65) 100%)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", padding: 24 }}>
        <Link href="/cafe" style={{
          display: "inline-block", marginTop: 48, background: "#fff", color: COLORS.blue,
          fontWeight: 900, fontSize: 24, letterSpacing: 0.5, padding: "20px 80px", borderRadius: 999,
          textDecoration: "none", boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
        }}>Order</Link>

        <div style={{ marginTop: 18, fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>Tap to start your order 🍪</div>
      </div>
    </main>
  );
}
