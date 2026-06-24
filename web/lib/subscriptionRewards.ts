// web/lib/subscriptionRewards.ts — the member's redeemable subscription reward pool.
//
// "Buy 6, get 1 free" as a SEPARATE balance (not the buy-10-get-1 loyalty):
//   earned    = floor(subscription cookies purchased / 6)
//   redeemed  = subReward free cookies already spent (in ANY order — box, checkout, cafe)
//   reserved  = subReward cookies queued for a future box (subscriptions.pending_rewards)
//   available = earned − redeemed − reserved
//
// One ledger, both spend paths (next-box reservation + checkout/cafe) draw it down,
// so a cookie can never be spent twice.
import { phoneSignificant } from "@/lib/phone";
import { classifyItem } from "@/lib/loyalty";

export const SUB_REWARD_PER = 6; // 1 free per 6 cookies

export type SubRewardBalance = {
  purchased: number;
  earned: number;
  redeemed: number;
  reserved: number;
  available: number;
};

export async function subscriptionRewardBalance(supa: any, ownerPhone: string | null): Promise<SubRewardBalance> {
  const empty = { purchased: 0, earned: 0, redeemed: 0, reserved: 0, available: 0 };
  if (!ownerPhone) return empty;
  const sig = phoneSignificant(ownerPhone);
  if (!sig) return empty;

  // PAID orders for this member (loose prefilter, exact significant match).
  const { data } = await supa
    .from("orders")
    .select("payment_status, items_json, customer_phone")
    .ilike("customer_phone", `%${sig}%`)
    .eq("payment_status", "PAID")
    .limit(600);
  const mine = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);

  let purchased = 0; // subscription paid cookies (noLoyalty, not free)
  let redeemed = 0; // subReward free cookies consumed anywhere
  for (const o of mine) {
    for (const it of Array.isArray(o?.items_json) ? o.items_json : []) {
      const qty = Math.max(0, Math.floor(Number(it?.quantity || 0)));
      if (!qty) continue;
      if (it?.subReward === true) { redeemed += qty; continue; }
      if (it?.noLoyalty === true && it?.free !== true && classifyItem(String(it?.id || ""), it?.kind) === "cookie") {
        purchased += qty;
      }
    }
  }
  const earned = Math.floor(purchased / SUB_REWARD_PER);

  // Reserved = reward cookies queued for a future box, across all the member's subs.
  const { data: subs } = await supa
    .from("subscriptions")
    .select("pending_rewards")
    .eq("owner_phone", ownerPhone);
  let reserved = 0;
  for (const s of subs || []) reserved += Array.isArray(s?.pending_rewards) ? s.pending_rewards.length : 0;

  const available = Math.max(0, earned - redeemed - reserved);
  return { purchased, earned, redeemed, reserved, available };
}
