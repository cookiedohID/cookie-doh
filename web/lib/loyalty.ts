// web/lib/loyalty.ts
//
// Loyalty: buy any 10 FULL-PRICED cookies -> 1 free cookie; any 10 full-priced
// drinks -> 1 free drink. Everything is derived from the customer's PAID orders.
//
// Every cookie/drink the customer BUYS earns a stamp — singles, boxes,
// assortments, AND bundles/spend-reward items. The ONLY lines that don't earn are
// `free` (a redeemed reward), which instead count as REDEMPTIONS, so:
//   available free = floor(boughtUnits / 10) - freeUnitsAlreadyTaken

import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";

export const STAMPS_PER_FREE = 10;

const COOKIE_IDS = new Set(FLAVORS.map((f: any) => String(f.id)));
const DRINK_IDS = new Set(SMOOTHIES.map((s) => s.id));

export type ItemKind = "cookie" | "drink" | "other";

export function classifyItem(id: string, kind?: string): ItemKind {
  // Prefer an explicit kind on the order line (the cafe POS sets it) so the two
  // ids that exist as BOTH a cookie and a smoothie (ruby-glow, strawberry-kiss)
  // are bucketed by what was actually sold, not by id-set precedence.
  if (kind === "cookie" || kind === "drink") return kind;
  if (COOKIE_IDS.has(id)) return "cookie";
  if (DRINK_IDS.has(id)) return "drink";
  return "other";
}

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type LoyaltyProgress = {
  cookieStamps: number; // progress toward the next free cookie (0–9)
  drinkStamps: number;
  freeCookies: number; // available now
  freeDrinks: number;
};

// `grant` adds free cookies/drinks earned OUTSIDE the buy-10 engine (e.g. a
// referral bonus, stored in loyalty_grants). They stack on top of stamp-earned
// rewards and are spent down by the same `free:true` redemption lines.
export function loyaltyFromOrders(
  orders: any[],
  grant?: { cookies?: number; drinks?: number }
): LoyaltyProgress {
  let cookieUnits = 0, drinkUnits = 0; // full-price, earning
  let cookieFree = 0, drinkFree = 0; // redeemed (free lines)

  for (const o of orders || []) {
    if (String(o?.payment_status).toUpperCase() !== "PAID") continue;
    for (const it of parseItems(o?.items_json)) {
      const kind = classifyItem(String(it?.id ?? ""), it?.kind);
      if (kind === "other") continue;
      const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
      if (!qty) continue;

      // Subscription cookies + their reward redemptions live in a SEPARATE pool
      // (see lib/subscriptionRewards): `noLoyalty` paid lines earn nothing, `bonus`
      // is a gift, and `subReward` is a subscription-reward redemption. None of them
      // ever touch the regular buy-10-get-1 balance — skip.
      if (it?.bonus === true || it?.noLoyalty === true || it?.subReward === true) continue;

      // Bundles and spend-reward items DO earn now (every purchased cookie/drink
      // earns). Only an explicitly-flagged `free:true` line (a redeemed reward) is
      // a redemption; a price of 0 alone is not (box/assortment cookies are priced
      // at the set level and still earn).
      const isFree = it?.free === true;

      if (isFree) {
        if (kind === "cookie") cookieFree += qty;
        else drinkFree += qty;
      } else {
        if (kind === "cookie") cookieUnits += qty;
        else drinkUnits += qty;
      }
    }
  }

  const earnedCookies = Math.floor(cookieUnits / STAMPS_PER_FREE);
  const earnedDrinks = Math.floor(drinkUnits / STAMPS_PER_FREE);
  const grantCookies = Math.max(0, Math.floor(Number(grant?.cookies || 0)));
  const grantDrinks = Math.max(0, Math.floor(Number(grant?.drinks || 0)));

  return {
    cookieStamps: cookieUnits % STAMPS_PER_FREE,
    drinkStamps: drinkUnits % STAMPS_PER_FREE,
    freeCookies: Math.max(0, earnedCookies + grantCookies - cookieFree),
    freeDrinks: Math.max(0, earnedDrinks + grantDrinks - drinkFree),
  };
}
