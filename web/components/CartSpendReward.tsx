"use client";

// web/components/CartSpendReward.tsx — spend-threshold reward on the cart.
// Shows the highest tier the customer has unlocked (or a "spend Rp X more" nudge),
// and lets them add the reward at its special price. Server re-validates at checkout.
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";
import { type CartState, addSpendReward, removeReward, qualifyingSubtotal } from "@/lib/cart";
import { pickTiers, type SpendReward } from "@/lib/spendRewards";

const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

export default function CartSpendReward({ cart, onChanged }: { cart: CartState; onChanged: () => void }) {
  const [tiers, setTiers] = useState<SpendReward[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/spend-rewards", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive && j?.ok) setTiers(j.tiers || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const qSub = qualifyingSubtotal(cart);
  const { unlocked, next } = pickTiers(tiers, qSub);
  const rewardBox = cart.boxes.find((b) => b.reward);

  // Auto-remove an added reward once the cart drops below its threshold.
  useEffect(() => {
    if (rewardBox && qSub < (rewardBox.reward?.threshold || 0)) {
      removeReward();
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qSub, rewardBox?.reward?.tierId]);

  if (!tiers.length) return null;

  const box: React.CSSProperties = { marginTop: 18, borderRadius: 16, padding: 16, border: "1px solid rgba(0,0,0,0.10)" };

  // Already added — confirm + allow removal (and a switch if a higher tier is now unlocked).
  if (rewardBox) {
    const canSwitch = unlocked && unlocked.id !== rewardBox.reward?.tierId;
    return (
      <section style={{ ...box, background: "rgba(29,158,117,0.08)", borderColor: "rgba(29,158,117,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, color: "#0f6e56" }}>🎉 {rewardBox.label} added for {rp(rewardBox.total)}</div>
          <button type="button" onClick={() => { removeReward(); onChanged(); }} style={{ border: "none", background: "none", color: "#6B6B6B", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>Remove</button>
        </div>
        {canSwitch ? (
          <button type="button" onClick={() => { addSpendReward(unlocked!); onChanged(); }} style={{ marginTop: 8, border: "1px solid rgba(0,20,167,0.35)", background: "#fff", color: COLORS.blue, borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ⬆️ You've unlocked a better reward — switch to {unlocked!.label} for {rp(unlocked!.special_price_idr)}
          </button>
        ) : null}
      </section>
    );
  }

  // Unlocked — offer to add.
  if (unlocked) {
    return (
      <section style={{ ...box, background: "rgba(0,20,167,0.05)", borderColor: "rgba(0,20,167,0.25)" }}>
        <div style={{ fontWeight: 900, color: COLORS.black }}>🎯 You've unlocked a reward!</div>
        <div style={{ color: "#3C3C3C", fontSize: 14, marginTop: 2 }}>Add <b>{unlocked.label}</b> for just <b>{rp(unlocked.special_price_idr)}</b>.</div>
        <button type="button" onClick={() => { addSpendReward(unlocked); onChanged(); }} style={{ marginTop: 10, border: "none", background: COLORS.blue, color: "#fff", borderRadius: 999, padding: "10px 18px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
          + Add {unlocked.label} — {rp(unlocked.special_price_idr)}
        </button>
      </section>
    );
  }

  // Locked — nudge toward the next tier.
  if (next) {
    const remain = Math.max(0, next.threshold_idr - qSub);
    return (
      <section style={{ ...box, background: COLORS.sand }}>
        <div style={{ fontWeight: 900, color: COLORS.black }}>🎁 Spend {rp(remain)} more to unlock a reward</div>
        <div style={{ color: "#6B6B6B", fontSize: 13, marginTop: 2 }}>Reach {rp(next.threshold_idr)} and add <b>{next.label}</b> for just {rp(next.special_price_idr)}.</div>
      </section>
    );
  }

  return null;
}
