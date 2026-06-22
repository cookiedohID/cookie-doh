"use client";

// web/components/CartUpsell.tsx — "Complete your order" quick-add strip for the
// cart. Suggests a drink (the natural pairing) plus popular single cookies; one
// tap adds them (drinks earn a drink stamp, cookies a cookie stamp).
import Image from "next/image";
import { useMemo, useState } from "react";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { addUpsellSingle } from "@/lib/cart";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";
import { COLORS } from "@/lib/theme";

const COOKIE_PRICE = 32500;
const POPULAR = new Set(["Bestseller", "Fan Favorite", "Signature", "Crowd Pleaser", "House Favorite", "Crowd Favorite"]);
const MAX = 8;
const DRINKS_SHOWN = 4;

type Pick = { id: string; name: string; image?: string; price: number; kind: "cookie" | "drink" };

export default function CartUpsell({ onAdded }: { onAdded: () => void }) {
  const { map } = useFlavorAvailability();
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const picks = useMemo<Pick[]>(() => {
    const drinks: Pick[] = (SMOOTHIES as any[])
      .filter((s) => !s.soldOut)
      .slice(0, DRINKS_SHOWN)
      .map((s) => ({ id: String(s.id), name: String(s.name), image: s.image, price: SMOOTHIE_PRICE, kind: "drink" }));

    const popular = (FLAVORS as any[]).filter((f) => Array.isArray(f.badges) && f.badges.some((b: string) => POPULAR.has(b)));
    const cookies: Pick[] = (popular.length ? popular : (FLAVORS as any[]))
      .filter((f) => !map[String(f.id)] && !f.soldOut)
      .slice(0, Math.max(0, MAX - drinks.length))
      .map((f) => ({ id: String(f.id), name: String(f.name), image: f.image, price: COOKIE_PRICE, kind: "cookie" }));

    return [...drinks, ...cookies];
  }, [map]);

  if (!picks.length) return null;

  function add(p: Pick) {
    addUpsellSingle({ id: p.id, name: p.name, price: p.price, image: p.image, kind: p.kind });
    const key = `${p.kind}:${p.id}`;
    setAdded((a) => ({ ...a, [key]: true }));
    setTimeout(() => setAdded((a) => ({ ...a, [key]: false })), 1400);
    onAdded();
  }

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 950, color: COLORS.black, fontSize: 16 }}>Complete your order 🍪</div>
      <div style={{ color: "#6B6B6B", fontSize: 13, marginTop: 2 }}>Add a drink or a few crowd-favourite cookies.</div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {picks.map((p) => {
          const key = `${p.kind}:${p.id}`;
          return (
            <div
              key={key}
              style={{ flex: "0 0 auto", width: 132, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 14, background: "#fff", overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,0.04)" }}
            >
              <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#F1EFE8", position: "relative" }}>
                {p.image ? <Image src={p.image} alt={p.name} fill sizes="132px" style={{ objectFit: "cover" }} /> : null}
                {p.kind === "drink" ? <span style={{ position: "absolute", top: 6, left: 6, fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>🥤 Drink</span> : null}
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 13, lineHeight: 1.25, minHeight: 32 }}>{p.name}</div>
                <div style={{ color: "#6B6B6B", fontSize: 12, marginTop: 2 }}>Rp{p.price.toLocaleString("id-ID")}</div>
                <button
                  type="button"
                  onClick={() => add(p)}
                  style={{ marginTop: 8, width: "100%", border: "none", borderRadius: 999, padding: "8px 0", fontWeight: 900, fontSize: 13, cursor: "pointer", background: added[key] ? "#1d9e75" : COLORS.blue, color: "#fff" }}
                >
                  {added[key] ? "Added ✓" : "+ Add"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
