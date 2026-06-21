"use client";

// web/components/CartBundleDeal.tsx — "complete the bundle" upsell. When the cart's
// cookies + drinks are within 1–2 items of a fixed-price bundle (e.g. a Box of 6 +
// 3 drinks is 1 drink short of the Party Pack), nudge to complete it for a small
// top-up, showing the marginal cost AND the saving. One tap folds the cart into the
// bundle, auto-filling the shortfall with a bestseller.
import { useMemo } from "react";
import { COLORS } from "@/lib/theme";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";
import { BUNDLES } from "@/lib/bundles";
import { type CartState, cartItemCounts, completeToBundle } from "@/lib/cart";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";

const COOKIE = 32500;
const DRINK = 39000;
const POPULAR = new Set(["Bestseller", "Best Seller", "Fan Favorite", "Signature", "Crowd Pleaser", "House Favorite", "Crowd Favorite"]);
const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

export default function CartBundleDeal({ cart, onChanged }: { cart: CartState; onChanged: () => void }) {
  const { map } = useFlavorAvailability();

  // A popular, in-stock cookie + drink to top up with.
  const fillCookie = useMemo(() => {
    const pop = (FLAVORS as any[]).filter((f) => Array.isArray(f.badges) && f.badges.some((b: string) => POPULAR.has(b)));
    const pick = (pop.length ? pop : (FLAVORS as any[])).find((f) => !map[String(f.id)] && !f.soldOut);
    return pick ? { id: String(pick.id), name: String(pick.name), image: pick.image } : null;
  }, [map]);
  const fillDrink = useMemo(() => {
    const pop = SMOOTHIES.filter((s) => Array.isArray(s.badges) && s.badges.some((b) => POPULAR.has(b)) && !s.soldOut);
    const pick = (pop.length ? pop : SMOOTHIES).find((s) => !s.soldOut);
    return pick ? { id: String(pick.id), name: String(pick.name), image: pick.image } : null;
  }, []);

  const deal = useMemo(() => {
    const { cookies, drinks } = cartItemCounts(cart);
    if (cookies + drinks < 1) return null;
    // What the convertible boxes (the ones we'd fold in) currently cost.
    const paid = cart.boxes
      .filter((bx) => bx.kind !== "bundle" && !bx.reward)
      .reduce((s, bx) => s + (Number(bx.total) || 0), 0);

    // Bundles the cart fits inside, short by 1–2 items, that genuinely save money.
    const options = BUNDLES.map((b) => {
      const needC = b.cookies - cookies;
      const needD = b.drinks - drinks;
      if (needC < 0 || needD < 0) return null; // cart overflows this bundle
      const shortfall = needC + needD;
      if (shortfall < 1 || shortfall > 2) return null;
      if (needC > 0 && !fillCookie) return null;
      if (needD > 0 && !fillDrink) return null;
      const shortfallCost = needC * COOKIE + needD * DRINK;
      const separate = paid + shortfallCost; // current items + topping up à la carte
      const savings = separate - b.price;
      if (savings < 10000) return null; // not worth nudging
      const marginal = b.price - paid; // extra to pay now vs current cart
      return { b, needC, needD, shortfall, savings, marginal };
    }).filter(Boolean) as { b: (typeof BUNDLES)[number]; needC: number; needD: number; shortfall: number; savings: number; marginal: number }[];

    options.sort((a, z) => a.shortfall - z.shortfall || z.savings - a.savings);
    return options[0] || null;
  }, [cart, fillCookie, fillDrink]);

  if (!deal) return null;
  const { b, needC, needD, savings, marginal } = deal;

  const parts: string[] = [];
  if (needC > 0) parts.push(`${needC} more cookie${needC > 1 ? "s" : ""}`);
  if (needD > 0) parts.push(`${needD} more drink${needD > 1 ? "s" : ""}`);
  const addText = parts.join(" + ");
  const fillNames = [needC > 0 ? fillCookie?.name : null, needD > 0 ? fillDrink?.name : null].filter(Boolean).join(" + ");

  return (
    <section style={{ marginTop: 18, borderRadius: 16, padding: 16, background: "rgba(0,82,204,0.07)", border: "1px solid rgba(0,82,204,0.30)" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 950, color: COLORS.blue, fontSize: 16 }}>
        <span>🎉 {marginal > 0 ? `Add ${addText} for +${rp(marginal)} → ${b.name}` : `Upgrade to ${b.name}`}</span>
      </div>
      <div style={{ color: "#3C3C3C", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
        {marginal > 0
          ? `You save ${rp(savings)} vs adding it separately`
          : `Get ${addText} and pay ${rp(Math.abs(marginal))} less — save ${rp(savings)} total`}
        {fillNames ? ` — we'll add ${fillNames}.` : "."}{" "}
        {b.badge ? `${b.badge}. ` : ""}Earns loyalty stamps too. 🍪
      </div>
      <button
        type="button"
        onClick={() => {
          completeToBundle(
            { id: b.id, name: b.name, cookies: b.cookies, drinks: b.drinks, price: b.price },
            { cookie: fillCookie || undefined, drink: fillDrink || undefined }
          );
          onChanged();
        }}
        style={{ marginTop: 11, border: "none", background: COLORS.blue, color: "#fff", borderRadius: 999, padding: "11px 20px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
      >
        Make it the {b.name} →
      </button>
    </section>
  );
}
