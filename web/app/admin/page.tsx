"use client";

// web/app/admin/page.tsx — admin home / hub. Linked sections; gated by proxy.ts.
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const SECTIONS = [
  { href: "/admin/orders", title: "Orders", desc: "All transactions, fulfilment & tracking", emoji: "🧾" },
  { href: "/admin/subscriptions", title: "Subscriptions", desc: "Plans, upcoming boxes & refunds", emoji: "🔁" },
  { href: "/admin/reports", title: "Reports", desc: "Daily sales, by item, per location, redeemed", emoji: "📊" },
  { href: "/admin/customers", title: "Customers", desc: "Members, purchase history & loyalty", emoji: "👥" },
  { href: "/admin/flavors", title: "Inventory", desc: "Per-location stock & sold-out", emoji: "📦" },
  { href: "/admin/locations", title: "Locations", desc: "Manage stores & transfer stock", emoji: "📍" },
  { href: "/admin/broadcast", title: "Broadcast", desc: "WhatsApp your members", emoji: "📣" },
  { href: "/admin/promos", title: "Promo codes", desc: "Discount codes for checkout", emoji: "🎟️" },
  { href: "/admin/spend-rewards", title: "Spend rewards", desc: "Spend Rp X, unlock a reward", emoji: "🎯" },
  { href: "/admin/vip", title: "VIP tiers", desc: "Reward lifetime spend", emoji: "👑" },
  { href: "/admin/help", title: "Manual", desc: "How everything works", emoji: "📖" },
];

export default function AdminHome() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 18px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ margin: "2px 0 0", fontSize: 28, fontWeight: 800, color: COLORS.black }}>Admin</h1>

        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 18, height: "100%" }}>
                <div style={{ fontSize: 26 }}>{s.emoji}</div>
                <div style={{ marginTop: 6, fontWeight: 800, color: COLORS.black, fontSize: 17 }}>{s.title}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: COLORS.muted }}>{s.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
