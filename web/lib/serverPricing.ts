// web/lib/serverPricing.ts — authoritative, server-side price of a cart box.
// The client cart's box.total is NEVER trusted for money; every box is re-priced
// here from catalog constants. (Reward boxes are priced from the validated tier
// by the checkout route, not here.)
import { BOX_PRICES } from "@/lib/catalog";
import { BUNDLES } from "@/lib/bundles";

const COOKIE_SINGLE = 32500; // a single cookie (out of a box)
const DRINK_SINGLE = 39000; // a single smoothie
// Keyed by name to the WHOLE bundle, not just its price: serverBoxTotal must check the declared
// composition (cookies + drinks) before honouring the fixed price, not just the label.
const BUNDLE_BY_NAME = new Map(BUNDLES.map((b) => [String(b.name), b]));

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
    // A bundle price is only honoured when the box ACTUALLY matches that bundle's declared
    // composition. Until 2026-07-29 this returned the flat price on the label alone: `count` was
    // computed above and never consulted, so a box labelled "Daily Duo" holding fifty cookies was
    // charged Rp 65.000 instead of Rp 1.625.000. That contradicted the comment directly above this
    // function, which promises a forged item count cannot get a discount — every other branch keeps
    // that promise; this one did not. Found by the 2026-07-29 security audit.
    // Mismatches fall through to full single prices, the same safe default used everywhere else.
    const b = BUNDLE_BY_NAME.get(String(box?.label || ""));
    if (b) {
      const items = itemsOf(box);
      const qty = (kind: string) => items
        .filter((it: any) => it?.kind === kind)
        .reduce((n: number, it: any) => n + Math.max(0, Math.floor(Number(it?.quantity || 0))), 0);
      const cookies = qty("cookie"), drinks = qty("drink");
      // exact match on both counts, and nothing else smuggled in alongside them
      if (cookies === Number(b.cookies) && drinks === Number(b.drinks)
          && count === Number(b.cookies) + Number(b.drinks)) {
        return Number(b.price);
      }
    }
    return Math.max(singlesTotal(box), COOKIE_SINGLE);
  }

  const bs = Number(box?.boxSize);
  const hasDrink = itemsOf(box).some((it: any) => it?.kind === "drink");
  if (!box?.label && !hasDrink && (bs === 3 || bs === 6) && count === bs) return (BOX_PRICES as any)[bs];

  return Math.max(singlesTotal(box), COOKIE_SINGLE); // singles, upsell add-ons, or malformed boxes
}
