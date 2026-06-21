// web/lib/bundleDeals.ts
//
// "Best deal" repackaging: given the LOOSE cookies + drinks a customer already has,
// find the cheapest way to price them using fixed-price bundles + leftover singles —
// WITHOUT adding anything. Powers the opt-in amber "Apply" nudge (POS + web cart).
//
// This is the counterpart to the upsell (which ADDS items to reach a bundle). Here we
// only repackage what's already in the cart, so the customer never pays more.
import { BUNDLES } from "@/lib/bundles";

export const COOKIE_SINGLE = 32500;
export const DRINK_SINGLE = 39000;

export type RepackCombo = { bundleId: string; name: string; cookies: number; drinks: number; price: number; count: number }[];

export type RepackResult = {
  combo: RepackCombo;
  leftoverCookies: number;
  leftoverDrinks: number;
  total: number; // bundles + leftover singles
  singlesTotal: number; // everything at single prices (the current price)
  savings: number; // singlesTotal - total
};

// Min-price assignment of (C cookies, D drinks) across the bundle list (with repetition)
// plus leftover singles. Few bundles + small carts → plain recursion is plenty fast.
function solve(
  bundles: typeof BUNDLES,
  idx: number,
  C: number,
  D: number
): { price: number; counts: Record<string, number> } {
  if (idx >= bundles.length) {
    return { price: C * COOKIE_SINGLE + D * DRINK_SINGLE, counts: {} };
  }
  const b = bundles[idx];
  const maxN = b.cookies > 0 && b.drinks > 0 ? Math.min(Math.floor(C / b.cookies), Math.floor(D / b.drinks)) : 0;
  let best: { price: number; counts: Record<string, number> } | null = null;
  for (let n = 0; n <= maxN; n++) {
    const sub = solve(bundles, idx + 1, C - n * b.cookies, D - n * b.drinks);
    const price = n * b.price + sub.price;
    if (!best || price < best.price) {
      best = { price, counts: n > 0 ? { ...sub.counts, [b.id]: n } : sub.counts };
    }
  }
  return best!;
}

export function bestRepackage(cookies: number, drinks: number): RepackResult | null {
  const C = Math.max(0, Math.min(40, Math.floor(cookies)));
  const D = Math.max(0, Math.min(40, Math.floor(drinks)));
  const singlesTotal = C * COOKIE_SINGLE + D * DRINK_SINGLE;
  if (C + D < 2) return null;

  // Only bundles that need both a cookie and a drink can ever consume mixed carts.
  const bundles = BUNDLES.filter((b) => b.cookies > 0 && b.drinks > 0).sort((a, z) => z.cookies + z.drinks - (a.cookies + a.drinks));
  if (!bundles.length) return null;

  const sol = solve(bundles, 0, C, D);
  const savings = singlesTotal - sol.price;
  if (savings <= 0) return null;

  const combo: RepackCombo = Object.entries(sol.counts).map(([id, count]) => {
    const b = BUNDLES.find((x) => x.id === id)!;
    return { bundleId: id, name: b.name, cookies: b.cookies, drinks: b.drinks, price: b.price, count };
  });
  const usedC = combo.reduce((s, x) => s + x.cookies * x.count, 0);
  const usedD = combo.reduce((s, x) => s + x.drinks * x.count, 0);
  return { combo, leftoverCookies: C - usedC, leftoverDrinks: D - usedD, total: sol.price, singlesTotal, savings };
}

// One-line human summary of a combo, e.g. "Daily Duo + 1 cookie" or "Sweet Sharer".
export function repackSummary(r: RepackResult): string {
  const parts = r.combo.flatMap((x) => Array.from({ length: x.count }, () => x.name));
  if (r.leftoverCookies > 0) parts.push(`${r.leftoverCookies} cookie${r.leftoverCookies > 1 ? "s" : ""}`);
  if (r.leftoverDrinks > 0) parts.push(`${r.leftoverDrinks} drink${r.leftoverDrinks > 1 ? "s" : ""}`);
  return parts.join(" + ");
}
