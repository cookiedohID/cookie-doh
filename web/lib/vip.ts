// web/lib/vip.ts
//
// VIP tiers — a member's standing based on TOTAL lifetime paid spend.
// Perks: faster loyalty (buy-N-get-1), free same-day delivery, and a free cookie
// per order. Tiers are configured by the owner in /admin/vip (public.vip_tiers);
// nothing applies until at least one tier is `active` and a member qualifies.
//
// Lifetime spend only ever rises, so a member's tier only ever improves — perks
// (and the faster loyalty rate) never get taken away.
import { phoneSignificant } from "@/lib/phone";
import { STAMPS_PER_FREE } from "@/lib/loyalty";

export type VipTier = {
  id: string;
  name: string;
  min_lifetime_idr: number;
  loyalty_per_free: number; // buy N -> 1 free (10 = no boost)
  free_delivery: boolean;
  free_cookie_per_order: boolean;
  active: boolean;
};

export type VipStatus = {
  lifetime_idr: number;
  tier: VipTier | null; // current tier (highest reached), or null
  next: VipTier | null; // next tier up, for a "spend X more" nudge
  remaining_idr: number; // to reach `next` (0 if already top / none)
};

// Total paid spend for a phone. ilike is a loose prefilter (orders store the
// phone as typed); require an exact significant-digit match.
export async function lifetimeSpendForPhone(supa: any, phone: string | null): Promise<number> {
  const sig = phoneSignificant(phone);
  if (!sig) return 0;
  const { data } = await supa
    .from("orders")
    .select("payment_status, total_idr, customer_phone")
    .ilike("customer_phone", `%${sig}%`)
    .limit(2000);
  return (data || [])
    .filter(
      (o: any) =>
        String(o?.payment_status).toUpperCase() === "PAID" && phoneSignificant(o?.customer_phone) === sig
    )
    .reduce((sum: number, o: any) => sum + Math.max(0, Math.round(Number(o?.total_idr || 0))), 0);
}

export async function activeVipTiers(supa: any): Promise<VipTier[]> {
  const { data } = await supa
    .from("vip_tiers")
    .select("id,name,min_lifetime_idr,loyalty_per_free,free_delivery,free_cookie_per_order,active")
    .eq("active", true)
    .order("min_lifetime_idr", { ascending: true });
  return (data || []) as VipTier[];
}

// Highest active tier a lifetime total qualifies for, plus the next one up.
// `tiers` must be sorted ascending by min_lifetime_idr (activeVipTiers does this).
export function pickVipTier(tiers: VipTier[], lifetime: number): { tier: VipTier | null; next: VipTier | null } {
  let tier: VipTier | null = null;
  let next: VipTier | null = null;
  for (const t of tiers) {
    if (lifetime >= t.min_lifetime_idr) tier = t;
    else { next = t; break; }
  }
  return { tier, next };
}

// Full VIP status for a phone (lifetime sum + tier match in one call).
export async function vipStatusForPhone(supa: any, phone: string | null): Promise<VipStatus> {
  const [lifetime, tiers] = await Promise.all([lifetimeSpendForPhone(supa, phone), activeVipTiers(supa)]);
  const { tier, next } = pickVipTier(tiers, lifetime);
  return {
    lifetime_idr: lifetime,
    tier,
    next,
    remaining_idr: next ? Math.max(0, next.min_lifetime_idr - lifetime) : 0,
  };
}

// The buy-N-get-1 threshold for a tier (falls back to the standard 10).
export function loyaltyPerFree(tier: VipTier | null): number {
  const n = tier?.loyalty_per_free;
  return n && n > 0 ? Math.floor(n) : STAMPS_PER_FREE;
}
