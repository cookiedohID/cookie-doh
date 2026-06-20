// web/lib/spendRewards.ts — spend-threshold reward tiers.
// "Spend Rp X, add this reward for Rp Y." Validation runs on the server at
// checkout so a customer can't keep the cheap reward after dropping below the
// threshold or swap in pricier cookies.

export type SpendRewardItem = { id: string; name: string; quantity: number };

export type SpendReward = {
  id: string;
  threshold_idr: number;
  label: string;
  special_price_idr: number;
  items: SpendRewardItem[];
  active: boolean;
};

// The single HIGHEST tier whose threshold the qualifying subtotal meets, plus the
// next tier just out of reach (for the "spend Rp X more" nudge).
export function pickTiers(
  tiers: SpendReward[],
  qualifyingSubtotal: number
): { unlocked: SpendReward | null; next: SpendReward | null } {
  const sorted = tiers.filter((t) => t.active).sort((a, b) => a.threshold_idr - b.threshold_idr);
  let unlocked: SpendReward | null = null;
  let next: SpendReward | null = null;
  for (const t of sorted) {
    if (qualifyingSubtotal >= t.threshold_idr) unlocked = t; // keep the highest passing
    else {
      next = t; // first one above the subtotal
      break;
    }
  }
  return { unlocked, next };
}

// Order-independent signature of a cookie set, for matching a cart reward to its tier.
export function itemsSignature(items: { id: string; quantity: number }[]): string {
  return (items || [])
    .map((i) => `${String(i.id)}x${Math.max(0, Math.floor(Number(i.quantity || 0)))}`)
    .filter((s) => !s.endsWith("x0"))
    .sort()
    .join(",");
}

// Does a cart reward box match the configured tier (same price + same cookies)?
export function rewardMatchesTier(
  reward: { total: number; items: { id: string; quantity: number }[] },
  tier: SpendReward
): boolean {
  if (Number(reward.total) !== Number(tier.special_price_idr)) return false;
  return itemsSignature(reward.items) === itemsSignature(tier.items);
}
