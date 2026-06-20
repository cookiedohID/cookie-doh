// web/lib/serverPricing.ts — authoritative, server-side price of a cart box.
// The client cart's box.total is NEVER trusted for money; every box is re-priced
// here from catalog constants. (Reward boxes are priced from the validated tier
// by the checkout route, not here.)
import { BOX_PRICES } from "@/lib/catalog";
import { BUNDLES } from "@/lib/bundles";

const SINGLE_PRICE = 32500; // a single cookie (out of a box)
const BUNDLE_PRICE_BY_NAME = new Map(BUNDLES.map((b) => [String(b.name), Number(b.price)]));

function itemCountOf(box: any): number {
  const items = Array.isArray(box?.items) ? box.items : [];
  return items.reduce((n: number, it: any) => n + Math.max(0, Math.floor(Number(it?.quantity || 0))), 0);
}

// Price a NON-reward box. Anything that doesn't exactly match a known shape
// (a catalog bundle, or a box of 3/6 with exactly that many cookies) is priced at
// the full single price — so a forged item count or fake "bundle" can't get a discount.
export function serverBoxTotal(box: any): number {
  const count = itemCountOf(box);

  if (box?.kind === "bundle") {
    const p = BUNDLE_PRICE_BY_NAME.get(String(box?.label || ""));
    return Number.isFinite(p) ? Number(p) : SINGLE_PRICE * Math.max(1, count);
  }

  const bs = Number(box?.boxSize);
  if (!box?.label && (bs === 3 || bs === 6) && count === bs) return (BOX_PRICES as any)[bs];

  return SINGLE_PRICE * Math.max(1, count); // singles, upsell add-ons, or malformed boxes
}
