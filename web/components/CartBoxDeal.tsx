"use client";

// web/components/CartBoxDeal.tsx — "complete the box" upsell. When the cart has
// loose single cookies, nudge toward the nearest Box (cheaper per cookie) with the
// saving in bold. One tap packs them into a box, auto-filling with a bestseller.
import { useMemo } from "react";
import { COLORS } from "@/lib/theme";
import { FLAVORS, BOX_PRICES } from "@/lib/catalog";
import { type CartState, looseCookieCount, completeToBox } from "@/lib/cart";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";

const SINGLE = 32500;
const POPULAR = new Set(["Bestseller", "Fan Favorite", "Signature", "Crowd Pleaser", "House Favorite", "Crowd Favorite"]);
const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

export default function CartBoxDeal({ cart, onChanged }: { cart: CartState; onChanged: () => void }) {
  const { map } = useFlavorAvailability();

  // A popular, in-stock cookie to top up the box with.
  const fill = useMemo(() => {
    const popular = (FLAVORS as any[]).filter((f) => Array.isArray(f.badges) && f.badges.some((b: string) => POPULAR.has(b)));
    const pick = (popular.length ? popular : (FLAVORS as any[])).find((f) => !map[String(f.id)] && !f.soldOut);
    return pick ? { id: String(pick.id), name: String(pick.name), image: pick.image } : null;
  }, [map]);

  const count = looseCookieCount(cart);
  let target: 3 | 6 | 0 = 0;
  if (count >= 1 && count <= 3) target = 3;
  else if (count >= 4 && count <= 6) target = 6;
  if (!target) return null;

  const need = target - count;
  if (need > 0 && !fill) return null; // can't top up if nothing's in stock

  const boxPrice = BOX_PRICES[target];
  const savings = target * SINGLE - boxPrice; // vs buying them all as singles
  const marginal = Math.max(0, boxPrice - count * SINGLE); // extra to pay now

  return (
    <section style={{ marginTop: 18, borderRadius: 16, padding: 16, background: "rgba(29,158,117,0.08)", border: "1px solid rgba(29,158,117,0.35)" }}>
      <div style={{ fontWeight: 950, color: "#0f6e56", fontSize: 16 }}>
        🎁 {need > 0 ? `Add ${need} more for a Box of ${target}` : `Make it a Box of ${target}`} — save {rp(savings)}!
      </div>
      <div style={{ color: "#3C3C3C", fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
        {need > 0
          ? `Just +${rp(marginal)} now (a box is cheaper per cookie)${fill ? ` — we'll add a ${fill.name}` : ""}.`
          : `${rp(boxPrice)} instead of ${rp(target * SINGLE)} as singles.`}{" "}
        Boxes earn loyalty stamps too. 🍪
      </div>
      <button
        type="button"
        onClick={() => { completeToBox(target as 3 | 6, fill || { id: "", name: "" }); onChanged(); }}
        style={{ marginTop: 10, border: "none", background: COLORS.blue, color: "#fff", borderRadius: 999, padding: "10px 18px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
      >
        {need > 0 ? `Make it a Box of ${target} →` : `Repackage as a Box of ${target} →`}
      </button>
    </section>
  );
}
