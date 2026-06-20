// web/lib/serverPricing.ts — authoritative, server-side price of a cart box.
// The client cart's box.total is NEVER trusted for money; every box is re-priced
// here from catalog constants. (Reward boxes are priced from the validated tier
// by the checkout route, not here.)
import { BOX_PRICES } from "@/lib/catalog";
import { BUNDLES } from "@/lib/bundles";

const COOKIE_SINGLE = 32500; // a single cookie (out of a box)
const DRINK_SINGLE = 39000; // a single smoothie
const BUNDLE_PRICE_BY_NAME = new Map(BUNDLES.map((b) => [String(b.name), Number(b.price)]));

function itemsOf(box: any): any[] {
  return Array.isArray(box?.items) ? box.items : [];
}
function countOf(box: any): number {
  return itemsOf(box).reduce((n: number, it: any) => n + Math.max(0, Math.floor(Number(it?.quantity || 0))), 0);
}
// Sum each item at its per-unit single price by kind (drinks cost more).
function singlesTotal(box: any): number {
  let t = 0;
  for (const it of itemsOf(box)) {
    const q = Math.max(0, Math.floor(Number(it?.quantity || 0)));
    t += (it?.kind === "drink" ? DRINK_SINGLE : COOKIE_SINGLE) * q;
  }
  return t;
}

// Price a NON-reward box. Anything that doesn't exactly match a known shape
// (a catalog bundle, or a box of 3/6 of cookies with exactly that many) is priced
// at full single prices — so a forged item count, a fake "bundle", or a drink
// smuggled into a box can't get a discount.
export function serverBoxTotal(box: any): number {
  const count = countOf(box);

  if (box?.kind === "bundle") {
    const p = BUNDLE_PRICE_BY_NAME.get(String(box?.label || ""));
    return Number.isFinite(p) ? Number(p) : Math.max(singlesTotal(box), COOKIE_SINGLE);
  }

  const bs = Number(box?.boxSize);
  const hasDrink = itemsOf(box).some((it: any) => it?.kind === "drink");
  if (!box?.label && !hasDrink && (bs === 3 || bs === 6) && count === bs) return (BOX_PRICES as any)[bs];

  return Math.max(singlesTotal(box), COOKIE_SINGLE); // singles, upsell add-ons, or malformed boxes
}
