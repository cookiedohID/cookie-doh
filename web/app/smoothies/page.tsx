"use client";

// web/app/smoothies/page.tsx
import { useMemo } from "react";
import { COLORS } from "@/lib/theme";
import SmoothieCard from "@/components/SmoothieCard";
import {
  SMOOTHIES,
  SMOOTHIE_CATEGORIES,
  CATEGORY_TAGLINES,
  SMOOTHIE_PRICE,
} from "@/lib/smoothies";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default function SmoothiesPage() {
  const grouped = useMemo(() => {
    return SMOOTHIE_CATEGORIES.map((cat) => ({
      category: cat,
      items: SMOOTHIES.filter((s) => s.category === cat),
    })).filter((g) => g.items.length > 0);
  }, []);

  return (
    <main style={{ background: COLORS.bg, minHeight: "100vh" }}>
      {/* Header */}
      <section style={{ background: COLORS.blue, color: COLORS.white }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 16px 36px" }}>
          <span className="font-dearjoe" style={{ fontSize: 26, opacity: 0.95 }}>
            sip the magic
          </span>
          <h1 style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>
            Cookie Doh Blend
          </h1>
          <p style={{ margin: "12px 0 0", maxWidth: 560, opacity: 0.9, lineHeight: 1.5 }}>
            Freshly blended fruit, yoghurt &amp; sorbet — order in store or message us on WhatsApp.
          </p>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8, marginTop: 16, background: "#fff", color: COLORS.blue, borderRadius: 999, padding: "9px 20px" }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.04em" }}>ALL BLENDS</span>
            <span style={{ fontSize: 22, fontWeight: 950 }}>{formatIDR(SMOOTHIE_PRICE)}</span>
          </div>
        </div>
      </section>

      {/* Menu */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 16px 64px" }}>
        {grouped.map((g) => (
          <section key={g.category} style={{ marginBottom: 40 }}>
            <h2 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: COLORS.black }}>
              {g.category}
            </h2>
            <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: 14 }}>
              {CATEGORY_TAGLINES[g.category]}
            </p>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
              {g.items.map((item) => (
                <SmoothieCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
