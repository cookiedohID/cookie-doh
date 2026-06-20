"use client";

// web/components/CartUpsell.tsx — "Complete your order" quick-add strip for the
// cart. Suggests popular single cookies; one tap adds them (and earns a stamp).
import { useMemo, useState } from "react";
import { FLAVORS } from "@/lib/catalog";
import { addUpsellSingle } from "@/lib/cart";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";
import { COLORS } from "@/lib/theme";

const SINGLE_PRICE = 32500;
const POPULAR = new Set(["Bestseller", "Fan Favorite", "Signature", "Crowd Pleaser", "House Favorite", "Crowd Favorite"]);
const MAX = 8;

export default function CartUpsell({ onAdded }: { onAdded: () => void }) {
  const { map } = useFlavorAvailability();
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const picks = useMemo(() => {
    const popular = (FLAVORS as any[]).filter((f) => Array.isArray(f.badges) && f.badges.some((b: string) => POPULAR.has(b)));
    const pool = (popular.length ? popular : (FLAVORS as any[]))
      .filter((f) => !map[String(f.id)] && !f.soldOut) // never upsell a sold-out flavour
      .slice(0, MAX);
    return pool;
  }, [map]);

  if (!picks.length) return null;

  function add(f: any) {
    addUpsellSingle({ id: String(f.id), name: String(f.name), price: SINGLE_PRICE, image: f.image });
    setAdded((a) => ({ ...a, [f.id]: true }));
    setTimeout(() => setAdded((a) => ({ ...a, [f.id]: false })), 1400);
    onAdded();
  }

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 950, color: COLORS.black, fontSize: 16 }}>Complete your order 🍪</div>
      <div style={{ color: "#6B6B6B", fontSize: 13, marginTop: 2 }}>Add a few crowd favourites as singles.</div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {picks.map((f) => (
          <div
            key={f.id}
            style={{ flex: "0 0 auto", width: 132, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 14, background: "#fff", overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,0.04)" }}
          >
            <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#F1EFE8" }}>
              {f.image ? <img src={f.image} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 13, lineHeight: 1.25, minHeight: 32 }}>{f.name}</div>
              <div style={{ color: "#6B6B6B", fontSize: 12, marginTop: 2 }}>Rp{SINGLE_PRICE.toLocaleString("id-ID")}</div>
              <button
                type="button"
                onClick={() => add(f)}
                style={{
                  marginTop: 8, width: "100%", border: "none", borderRadius: 999, padding: "8px 0", fontWeight: 900, fontSize: 13, cursor: "pointer",
                  background: added[f.id] ? "#1d9e75" : COLORS.blue, color: "#fff",
                }}
              >
                {added[f.id] ? "Added ✓" : "+ Add"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
