"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  // Hide on the kiosk (same as SiteHeader)
  if (pathname?.startsWith("/cafe")) return null;

  const year = new Date().getFullYear();
  const link: React.CSSProperties = { color: "rgba(255,255,255,0.85)", textDecoration: "none", fontWeight: 600 };

  return (
    <footer
      style={{
        background: "#000",
        color: "#fff",
        padding: "32px 24px",
        textAlign: "center",
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <Link href="/help" style={link}>Help &amp; FAQ</Link>
        <Link href="/privacy" style={link}>Privacy Policy</Link>
        <Link href="/terms" style={link}>Terms of Service</Link>
      </div>
      <div style={{ color: "rgba(255,255,255,0.7)" }}>© {year} Cookie Doh. Made with love.</div>
    </footer>
  );
}
