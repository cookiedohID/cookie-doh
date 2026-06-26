// web/lib/vip.ts
//
// VIP tiers — a member's standing, computed LIVE from their paid orders.
//   • REACH a tier: total paid spend in the trailing 12 months >= reach_annual_idr.
//   • KEEP a tier: spent >= maintain_monthly_idr in THIS or LAST calendar month
//     (WIB). maintain_monthly_idr = 0 means no monthly upkeep (kept once reached).
// Effective tier = highest ACTIVE tier satisfying BOTH. Using "this OR last month"
// avoids a brutal demotion at midnight on the 1st; two quiet calendar months in a
// row drops the member a tier. No cron, no stored tier — pure function of orders.
//
// Perks (applied elsewhere): faster loyalty (buy-N-get-1), free same-day delivery,
// a free cookie per order. Tiers are configured in /admin/vip (public.vip_tiers).
import { phoneSignificant } from "@/lib/phone";
import { STAMPS_PER_FREE } from "@/lib/loyalty";

const WIB_OFFSET = 7 * 60 * 60 * 1000; // Asia/Jakarta = UTC+7

export type VipTier = {
  id: string;
  name: string;
  reach_annual_idr: number;
  maintain_monthly_idr: number;
  loyalty_per_free: number;
  free_delivery: boolean;
  free_cookie_per_order: boolean;
  active: boolean;
};

export type VipStatus = {
  annual_idr: number; // paid spend, trailing 12 months
  this_month_idr: number; // paid spend, current WIB calendar month
  last_month_idr: number; // paid spend, previous WIB calendar month
  tier: VipTier | null; // effective tier (reached + maintained), or null
  next: VipTier | null; // next tier up to reach, for a nudge
  reach_remaining_idr: number; // more annual spend to reach `next` (0 if none)
  maintain_remaining_idr: number; // spend this month to stay covered on `tier` (0 if none/secured)
};

type PaidOrder = { amount: number; t: number };

async function paidOrders(supa: any, phone: string | null): Promise<PaidOrder[]> {
  const sig = phoneSignificant(phone);
  if (!sig) return [];
  const { data } = await supa
    .from("orders")
    .select("payment_status, total_idr, created_at, customer_phone")
    .ilike("customer_phone", `%${sig}%`)
    .limit(3000);
  return (data || [])
    .filter(
      (o: any) =>
        String(o?.payment_status).toUpperCase() === "PAID" && phoneSignificant(o?.customer_phone) === sig
    )
    .map((o: any) => ({ amount: Math.max(0, Math.round(Number(o?.total_idr || 0))), t: new Date(o?.created_at).getTime() }))
    .filter((o: PaidOrder) => Number.isFinite(o.t));
}

// WIB calendar-month boundaries (as UTC ms) for "now".
function windows(nowMs: number) {
  const w = new Date(nowMs + WIB_OFFSET);
  const wy = w.getUTCFullYear();
  const wm = w.getUTCMonth();
  return {
    yearAgo: nowMs - 365 * 24 * 60 * 60 * 1000,
    startThisMonth: Date.UTC(wy, wm, 1) - WIB_OFFSET,
    startPrevMonth: Date.UTC(wy, wm - 1, 1) - WIB_OFFSET, // Date.UTC handles month -1
  };
}

export async function activeVipTiers(supa: any): Promise<VipTier[]> {
  const { data } = await supa
    .from("vip_tiers")
    .select("id,name,reach_annual_idr,maintain_monthly_idr,loyalty_per_free,free_delivery,free_cookie_per_order,active")
    .eq("active", true)
    .order("reach_annual_idr", { ascending: true });
  return (data || []) as VipTier[];
}

// Effective tier for known spend figures. `tiers` ascending by reach_annual_idr.
// A tier is held when annual reach is met AND it's maintained (this or last month,
// or no upkeep required). Scans high→low so a member who reached Platinum annually
// but stopped maintaining it settles at the highest tier they still keep.
export function pickVipTier(
  tiers: VipTier[],
  annual: number,
  thisMonth: number,
  lastMonth: number
): { tier: VipTier | null; next: VipTier | null } {
  const sorted = [...tiers].sort((a, b) => a.reach_annual_idr - b.reach_annual_idr);
  let tier: VipTier | null = null;
  let next: VipTier | null = null;
  for (const t of sorted) {
    const reached = annual >= t.reach_annual_idr;
    const maintained = t.maintain_monthly_idr <= 0 || thisMonth >= t.maintain_monthly_idr || lastMonth >= t.maintain_monthly_idr;
    if (reached && maintained) tier = t;
    if (!reached && !next) next = t; // lowest tier not yet reached → the "reach" nudge target
  }
  return { tier, next };
}

export async function vipStatusForPhone(supa: any, phone: string | null, nowMs: number = Date.now()): Promise<VipStatus> {
  const [orders, tiers] = await Promise.all([paidOrders(supa, phone), activeVipTiers(supa)]);
  const { yearAgo, startThisMonth, startPrevMonth } = windows(nowMs);

  let annual = 0, thisMonth = 0, lastMonth = 0;
  for (const o of orders) {
    if (o.t >= yearAgo) annual += o.amount;
    if (o.t >= startThisMonth) thisMonth += o.amount;
    else if (o.t >= startPrevMonth) lastMonth += o.amount;
  }

  const { tier, next } = pickVipTier(tiers, annual, thisMonth, lastMonth);
  const reach_remaining_idr = next ? Math.max(0, next.reach_annual_idr - annual) : 0;
  // Nudge to keep the current tier going: spend this much more THIS month so the
  // member stays covered next month too (0 if no upkeep or already met this month).
  const maintain_remaining_idr =
    tier && tier.maintain_monthly_idr > 0 ? Math.max(0, tier.maintain_monthly_idr - thisMonth) : 0;

  return { annual_idr: annual, this_month_idr: thisMonth, last_month_idr: lastMonth, tier, next, reach_remaining_idr, maintain_remaining_idr };
}

// The buy-N-get-1 threshold for a tier (falls back to the standard 10).
export function loyaltyPerFree(tier: VipTier | null): number {
  const n = tier?.loyalty_per_free;
  return n && n > 0 ? Math.floor(n) : STAMPS_PER_FREE;
}
