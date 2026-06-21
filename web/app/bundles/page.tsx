"use client";

// web/app/bundles/page.tsx
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { BUNDLES, type Bundle } from "@/lib/bundles";
import { addBundleToCart, type CartItem } from "@/lib/cart";
import { COLORS } from "@/lib/theme";
import { COOKIE_ALLERGENS, DRINK_ALLERGENS } from "@/lib/allergens";
import PickerCard from "@/components/PickerCard";
import ItemDetailModal from "@/components/ItemDetailModal";

const COOKIE_PRICE = 32500;
const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

type PickItem = { id: string; name: string; image?: string; price: number; description?: string; ingredients?: string[]; allergens?: string; badge?: string; soldOut?: boolean };

export default function BundlesPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [cookieQty, setCookieQty] = useState<Record<string, number>>({});
  const [drinkQty, setDrinkQty] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<{ item: PickItem; kind: "cookie" | "drink" } | null>(null);

  const cookies: PickItem[] = useMemo(
    () => FLAVORS.map((f: any) => ({ id: String(f.id), name: String(f.name), image: f.image, price: COOKIE_PRICE, description: f.description, ingredients: f.ingredients, allergens: COOKIE_ALLERGENS, badge: Array.isArray(f.badges) ? f.badges[0] : undefined, soldOut: f.soldOut })),
    []
  );
  const drinks: PickItem[] = useMemo(
    () => SMOOTHIES.map((s) => ({ id: s.id, name: s.name, image: s.image, price: SMOOTHIE_PRICE, description: s.description, ingredients: s.ingredients, allergens: DRINK_ALLERGENS, badge: Array.isArray(s.badges) ? s.badges[0] : undefined, soldOut: s.soldOut })),
    []
  );

  const cookieCount = Object.values(cookieQty).reduce((a, b) => a + b, 0);
  const drinkCount = Object.values(drinkQty).reduce((a, b) => a + b, 0);
  const cookiesNeeded = selected?.cookies ?? 0;
  const drinksNeeded = selected?.drinks ?? 0;
  const ready = !!selected && cookieCount === cookiesNeeded && drinkCount === drinksNeeded;

  function choose(b: Bundle) {
    setSelected(b);
    setCookieQty({});
    setDrinkQty({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bump(kind: "cookie" | "drink", id: string, delta: number) {
    const need = kind === "cookie" ? cookiesNeeded : drinksNeeded;
    const cur = kind === "cookie" ? cookieQty : drinkQty;
    const set = kind === "cookie" ? setCookieQty : setDrinkQty;
    const count = Object.values(cur).reduce((a, b) => a + b, 0);
    const next = Math.max(0, (cur[id] || 0) + delta);
    if (delta > 0 && count >= need) return; // can't exceed bundle size
    set({ ...cur, [id]: next });
  }

  function addToCart() {
    if (!selected || !ready) return;
    const items: CartItem[] = [];
    for (const c of cookies) {
      const q = cookieQty[c.id] || 0;
      if (q > 0) items.push({ id: c.id, name: c.name, image: c.image, price: c.price, quantity: q });
    }
    for (const d of drinks) {
      const q = drinkQty[d.id] || 0;
      if (q > 0) items.push({ id: d.id, name: d.name, image: d.image, price: d.price, quantity: q });
    }
    addBundleToCart({ label: selected.name, items, total: selected.price });
    router.push("/cart");
  }

  // ---------- Builder ----------
  if (selected) {
    const Picker = ({ kind, items, need, count }: { kind: "cookie" | "drink"; items: PickItem[]; need: number; count: number }) => (
      <section style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.black }}>
            Pick {need} {kind === "cookie" ? "cookie" : "drink"}{need > 1 ? "s" : ""}
          </h2>
          <span style={{ fontWeight: 800, fontSize: 13, color: count === need ? "#0014A7" : COLORS.muted }}>{count}/{need}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4" style={{ gap: 12 }}>
          {items.map((it) => {
            const q = (kind === "cookie" ? cookieQty : drinkQty)[it.id] || 0;
            return (
              <PickerCard
                key={it.id}
                name={it.name}
                image={it.image}
                price={it.price}
                qty={q}
                badge={it.badge}
                soldOut={it.soldOut}
                atMax={count >= need}
                onInc={() => bump(kind, it.id, 1)}
                onDec={() => bump(kind, it.id, -1)}
                onOpenDetail={() => setDetail({ item: it, kind })}
              />
            );
          })}
        </div>
      </section>
    );

    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: 110 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 0" }}>
          <button type="button" onClick={() => setSelected(null)} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 800, cursor: "pointer" }}>← All bundles</button>
          <h1 style={{ margin: "8px 0 2px", fontSize: 26, fontWeight: 800, color: COLORS.black }}>{selected.name}</h1>
          <p style={{ margin: 0, color: COLORS.muted, fontSize: 14 }}>{selected.description}</p>
          <div style={{ margin: "16px 0 18px", fontWeight: 900, color: COLORS.blue, fontSize: 18 }}>{formatIDR(selected.price)}</div>

          {cookiesNeeded > 0 ? <Picker kind="cookie" items={cookies} need={cookiesNeeded} count={cookieCount} /> : null}
          {drinksNeeded > 0 ? <Picker kind="drink" items={drinks} need={drinksNeeded} count={drinkCount} /> : null}
        </div>

        {/* sticky bar */}
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", padding: "12px 16px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 14 }}>
              {ready ? "Bundle complete" : `Pick ${Math.max(0, cookiesNeeded - cookieCount)} cookie + ${Math.max(0, drinksNeeded - drinkCount)} drink left`}
            </div>
            <button type="button" onClick={addToCart} disabled={!ready}
              style={{ borderRadius: 999, height: 48, padding: "0 24px", border: "none", background: ready ? COLORS.blue : "rgba(0,20,167,0.4)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: ready ? "pointer" : "not-allowed" }}>
              Add to cart · {formatIDR(selected.price)}
            </button>
          </div>
        </div>

        {detail ? (() => {
          const atLimit = (detail.kind === "cookie" ? cookieCount : drinkCount) >= (detail.kind === "cookie" ? cookiesNeeded : drinksNeeded);
          return (
            <ItemDetailModal
              item={{ name: detail.item.name, image: detail.item.image, price: detail.item.price, description: detail.item.description, ingredients: detail.item.ingredients, allergens: detail.item.allergens }}
              onClose={() => setDetail(null)}
              actionLabel={detail.item.soldOut ? "Sold out" : atLimit ? `Picked enough ${detail.kind}s` : `＋ Add to ${selected.name}`}
              actionDisabled={!!detail.item.soldOut || atLimit}
              onAction={() => { bump(detail.kind, detail.item.id, 1); setDetail(null); }}
            />
          );
        })() : null}
      </main>
    );
  }

  // ---------- List ----------
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <section style={{ background: COLORS.blue, color: "#fff" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 16px 36px" }}>
          <span className="font-dearjoe" style={{ fontSize: 26, opacity: 0.95 }}>mix & save</span>
          <h1 style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 800 }}>Bundles</h1>
          <p style={{ margin: "12px 0 0", maxWidth: 560, opacity: 0.9 }}>Pick any cookies + drinks and save — your combo, our treat price.</p>
        </div>
      </section>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 64px", display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {BUNDLES.map((b) => (
          <div key={b.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 18, background: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.black }}>{b.name}</div>
              {b.badge ? <span style={{ background: COLORS.orange, color: "#fff", fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{b.badge}</span> : null}
            </div>
            <p style={{ margin: 0, color: COLORS.muted, fontSize: 13.5, lineHeight: 1.45, flex: 1 }}>{b.description}</p>
            <div style={{ fontWeight: 900, color: COLORS.blue, fontSize: 18 }}>{formatIDR(b.price)}</div>
            <button type="button" onClick={() => choose(b)} style={{ marginTop: 4, height: 46, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Choose this bundle</button>
          </div>
        ))}
      </div>
    </main>
  );
}
