"use client";

// web/components/CartBestDeal.tsx — opt-in "best deal" repackaging. When the cart's
// loose cookies + drinks can be re-priced cheaper as a bundle (+ leftovers) WITHOUT
// adding anything, offer a one-tap "Apply". Sits alongside the upsell (CartBundleDeal):
// blue upsell = grow the order; amber best-deal = cheapest price on what's here.
import { COLORS } from "@/lib/theme";
import { type CartState, looseSingleCounts, applyBestDeal } from "@/lib/cart";
import { bestRepackage, repackSummary } from "@/lib/bundleDeals";

const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

export default function CartBestDeal({ cart, onChanged }: { cart: CartState; onChanged: () => void }) {
  const { cookies, drinks } = looseSingleCounts(cart);
  const deal = bestRepackage(cookies, drinks);
  if (!deal) return null;

  return (
    <section style={{ marginTop: 18, borderRadius: 16, padding: 16, background: "#FAEEDA", border: "1px solid #EF9F27" }}>
      <div style={{ fontWeight: 950, color: "#633806", fontSize: 16 }}>
        💡 Best deal — save {rp(deal.savings)}
      </div>
      <div style={{ color: "#7a5c00", fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
        Re-price what&apos;s already in your cart as <b>{repackSummary(deal)}</b> — same items, {rp(deal.savings)} less. Bundles earn stamps too. 🍪
      </div>
      <button
        type="button"
        onClick={() => { applyBestDeal(deal.combo); onChanged(); }}
        style={{ marginTop: 11, border: "none", background: "#854F0B", color: "#fff", borderRadius: 999, padding: "11px 20px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
      >
        Apply &amp; save {rp(deal.savings)} →
      </button>
    </section>
  );
}
