// web/app/cart/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";
import {
  addUpsellSingle,
  clearCart,
  decUpsellSingle,
  getCart,
  removeBoxAt,
  removeSoldOutItemsFromCart,
  type CartItem,
  type CartState,
} from "@/lib/cart";
import { COLORS } from "@/lib/theme";
import TbsCartSection, { useTbsBasket } from "@/components/TbsCartSection";
import CartUpsell from "@/components/CartUpsell";
import CartSpendReward from "@/components/CartSpendReward";
import CartBoxDeal from "@/components/CartBoxDeal";
import CartBundleDeal from "@/components/CartBundleDeal";
import CartBestDeal from "@/components/CartBestDeal";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>({ boxes: [] });

  useEffect(() => {
    setCart(getCart());
  }, []);

  // Reserve space for the sticky bottom CTA so the floating WhatsApp button
  // clears it (see WhatsAppButton + globals.css --cd-bottombar-h).
  useEffect(() => {
    document.documentElement.style.setProperty("--cd-bottombar-h", "92px");
    return () => {
      document.documentElement.style.removeProperty("--cd-bottombar-h");
    };
  }, []);

  const soldOutSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of CATALOG_FLAVORS as any[]) {
      if (f?.soldOut) s.add(String(f.id));
    }
    return s;
  }, []);

  const tbsBasket = useTbsBasket();
  const subtotal = useMemo(
    () => cart.boxes.reduce((sum, b) => sum + (b.total || 0), 0),
    [cart]
  );

  const totalItems = useMemo(() => {
    return cart.boxes.reduce((sum, b) => {
      const boxCount = b.items.reduce((s, it) => s + (it.quantity || 0), 0);
      return sum + boxCount;
    }, 0);
  }, [cart]);

  const unavailableCount = useMemo(() => {
    let n = 0;
    for (const b of cart.boxes)
      for (const it of b.items) if (soldOutSet.has(String(it.id))) n += 1;
    return n;
  }, [cart, soldOutSet]);

  const hasUnavailable = unavailableCount > 0;
  const isEmpty = cart.boxes.length === 0;

  const onRemoveBox = (idx: number) => {
    removeBoxAt(idx);
    setCart(getCart());
  };

  // Resolve a thumbnail for a cart item (stored image → cookie catalog → smoothies).
  const imageFor = (it: CartItem): string => {
    if (it.image) return it.image;
    const f = (CATALOG_FLAVORS as any[]).find((x) => String(x.id) === String(it.id));
    if (f?.image) return f.image;
    const s = SMOOTHIES.find((x) => x.id === String(it.id));
    return s?.image || "";
  };

  // +/- a loose single (smoothie or single cookie add-on).
  const incSingle = (it: CartItem) => {
    addUpsellSingle({ id: it.id, name: it.name, price: it.price, image: it.image, kind: it.kind });
    setCart(getCart());
  };
  const decSingle = (it: CartItem) => {
    decUpsellSingle({ id: it.id, price: it.price });
    setCart(getCart());
  };

  const onClearCart = () => {
    clearCart();
    setCart(getCart());
  };

  const onRemoveSoldOut = () => {
    setCart(removeSoldOutItemsFromCart());
  };

  const goCheckout = () => {
    if (hasUnavailable) return;
    router.push("/checkout");
  };

  return (
    <main style={{ minHeight: "100vh", background: COLORS.white }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px 120px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>
            Your cookie box 🤍
          </h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>
            Freshly baked and packed with care.
          </p>
        </header>

        {/* Unified cart: the TotalBuahStore "table" — ships together from the same store */}
        <TbsCartSection />

        {!isEmpty && hasUnavailable && (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255, 90, 0, 0.08)",
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div>
                <div style={{ fontWeight: 950, color: COLORS.black }}>
                  Some items are sold out
                </div>
                <div style={{ marginTop: 6, color: "rgba(0,0,0,0.70)", lineHeight: 1.5 }}>
                  Remove sold out items to continue to checkout.
                </div>
              </div>

              <button
                type="button"
                onClick={onRemoveSoldOut}
                style={{
                  border: "none",
                  background: COLORS.blue,
                  color: COLORS.white,
                  borderRadius: 999,
                  padding: "10px 12px",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
                }}
              >
                Remove sold out
              </button>
            </div>
          </section>
        )}

        {isEmpty ? (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: COLORS.sand,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.black }}>
              Your box is waiting 🤍
            </div>
            <div style={{ marginTop: 6, color: "#6B6B6B", lineHeight: 1.6 }}>
              Start building your cookie box and we’ll bake the rest.
            </div>

            <Link
              href="/build"
              style={{
                marginTop: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                padding: "14px 22px",
                background: COLORS.blue,
                color: COLORS.white,
                fontWeight: 900,
                textDecoration: "none",
                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              }}
            >
              Build your box 🍪
            </Link>
          </section>
        ) : (
          <>
            {/* Items */}
            <section style={{ display: "grid", gap: 12 }}>
              {cart.boxes.map((box, idx) => {
                const boxCount = box.items.reduce((s, it) => s + (it.quantity || 0), 0);
                const looseSingle = box.kind !== "bundle" && !box.reward && !!box.label && box.items.length === 1;

                // Loose single (smoothie / single cookie) — thumbnail + quantity stepper.
                if (looseSingle) {
                  const it = box.items[0];
                  const isSoldOut = soldOutSet.has(String(it.id));
                  const img = imageFor(it);
                  return (
                    <article
                      key={idx}
                      style={{
                        borderRadius: 18,
                        border: "1px solid rgba(0,0,0,0.10)",
                        padding: 12,
                        background: COLORS.white,
                        boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div
                          style={{
                            position: "relative",
                            width: 64,
                            height: 64,
                            borderRadius: 14,
                            overflow: "hidden",
                            flex: "0 0 auto",
                            background: COLORS.sand,
                            border: "1px solid rgba(0,0,0,0.08)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 26,
                          }}
                        >
                          {img ? <Image src={img} alt={it.name} fill sizes="64px" style={{ objectFit: "cover" }} /> : (it.kind === "drink" ? "🥤" : "🍪")}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, color: COLORS.black, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <Link href={it.kind === "drink" ? "/smoothies" : "/cookies"} style={{ color: "inherit", textDecoration: "none" }}>{it.name}</Link>
                          </div>
                          <div style={{ color: "#6B6B6B", fontSize: 13, marginTop: 2 }}>{formatIDR(it.price)} each</div>

                          {isSoldOut ? (
                            <div style={{ marginTop: 7 }}>
                              <span style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,0.72)", color: COLORS.white, fontWeight: 950, fontSize: 12, letterSpacing: "0.08em" }}>SOLD OUT</span>
                            </div>
                          ) : (
                            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 12 }}>
                              <button onClick={() => decSingle(it)} aria-label="Remove one" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, fontSize: 18, lineHeight: 1, cursor: "pointer" }}>−</button>
                              <span style={{ minWidth: 18, textAlign: "center", fontWeight: 900, fontSize: 16, color: COLORS.black }}>{it.quantity}</span>
                              <button onClick={() => incSingle(it)} aria-label="Add one" style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 18, lineHeight: 1, cursor: "pointer" }}>＋</button>
                            </div>
                          )}
                        </div>

                        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                          <div style={{ fontWeight: 950, color: COLORS.black }}>{formatIDR(box.total || 0)}</div>
                          <button onClick={() => onRemoveBox(idx)} style={{ marginTop: 6, border: "none", background: "transparent", color: "#6B6B6B", cursor: "pointer", fontWeight: 800, fontSize: 13, padding: 0 }}>Remove</button>
                        </div>
                      </div>
                    </article>
                  );
                }

                // Box of N / bundle / reward — fixed set: contents (with thumbnails) + Remove box.
                return (
                  <article
                    key={idx}
                    style={{
                      borderRadius: 18,
                      border: "1px solid rgba(0,0,0,0.10)",
                      padding: 14,
                      background: COLORS.white,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 950, color: COLORS.black }}>
                        {box.kind === "bundle"
                          ? `${box.label || "Bundle"} • ${boxCount} items`
                          : box.label
                          ? `${box.label} • ${boxCount} ${box.items.every((it: any) => it.kind === "drink") ? (boxCount === 1 ? "drink" : "drinks") : boxCount === 1 ? "cookie" : "cookies"}`
                          : `Box of ${box.boxSize} • ${boxCount} cookies`}
                      </div>

                      <button
                        onClick={() => onRemoveBox(idx)}
                        style={{ border: "none", background: "transparent", color: "#6B6B6B", cursor: "pointer", fontWeight: 800 }}
                      >
                        Remove box
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {box.items.map((it) => {
                        const isSoldOut = soldOutSet.has(String(it.id));
                        const img = imageFor(it);
                        return (
                          <div
                            key={it.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 10px",
                              borderRadius: 14,
                              background: COLORS.sand,
                              border: "1px solid rgba(0,0,0,0.06)",
                              opacity: isSoldOut ? 0.85 : 1,
                            }}
                          >
                            <div
                              style={{
                                position: "relative",
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                overflow: "hidden",
                                flex: "0 0 auto",
                                background: "#fff",
                                border: "1px solid rgba(0,0,0,0.08)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                              }}
                            >
                              {img ? <Image src={img} alt={it.name} fill sizes="40px" style={{ objectFit: "cover" }} /> : (it.kind === "drink" ? "🥤" : "🍪")}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 800, color: COLORS.black, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <Link href={it.kind === "drink" ? "/smoothies" : "/cookies"} style={{ color: "inherit", textDecoration: "none" }}>{it.name}</Link> × {it.quantity}
                              </div>
                              {isSoldOut && (
                                <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ padding: "4px 9px", borderRadius: 999, background: "rgba(0,0,0,0.72)", color: COLORS.white, fontWeight: 950, fontSize: 11, letterSpacing: "0.08em" }}>SOLD OUT</span>
                                  <span style={{ color: "rgba(0,0,0,0.60)", fontWeight: 800, fontSize: 12 }}>Remove to checkout</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ color: "#6B6B6B" }}>Box total</div>
                      <div style={{ fontWeight: 950, color: COLORS.black }}>{formatIDR(box.total || 0)}</div>
                    </div>
                  </article>
                );
              })}
            </section>

            {/* Delivery quote expectation strip */}
            <section
              style={{
                marginTop: 14,
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(0,82,204,0.06)",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 950, color: COLORS.black }}>Delivery fee</div>
              <div style={{ marginTop: 6, color: "rgba(0,0,0,0.68)", lineHeight: 1.55 }}>
                Delivery is a <b>live quote</b> (Lalamove) and is calculated at checkout based on your address and time.
              </div>

              <button
                type="button"
                onClick={goCheckout}
                disabled={hasUnavailable}
                style={{
                  marginTop: 10,
                  width: "100%",
                  borderRadius: 999,
                  height: 44,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  cursor: hasUnavailable ? "not-allowed" : "pointer",
                  color: COLORS.black,
                  fontWeight: 950,
                }}
              >
                Calculate delivery fee at checkout
              </button>

              {hasUnavailable && (
                <div style={{ marginTop: 8, color: "rgba(0,0,0,0.62)", fontWeight: 800, fontSize: 12 }}>
                  Remove sold out items first.
                </div>
              )}
            </section>

            {/* Reassurance */}
            <section
              style={{
                marginTop: 16,
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.08)",
                background: COLORS.sand,
                padding: 14,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, color: "#3C3C3C", fontSize: 13 }}>
                <div>✨ Baked fresh on order</div>
                <div>✨ Limited daily batches</div>
                <div>✨ Jakarta delivery</div>
                <div>✨ Packed with care</div>
              </div>
            </section>

            {/* Complete-the-bundle deal (e.g. Box of 6 + 3 drinks → Party Pack) */}
            <CartBundleDeal cart={cart} onChanged={() => setCart(getCart())} />

            {/* Best-deal repackaging — cheapest price on what's already here (opt-in) */}
            <CartBestDeal cart={cart} onChanged={() => setCart(getCart())} />

            {/* Complete-the-box deal */}
            <CartBoxDeal cart={cart} onChanged={() => setCart(getCart())} />

            {/* Spend-threshold reward */}
            <CartSpendReward cart={cart} onChanged={() => setCart(getCart())} />

            {/* Upsell — quick-add popular singles */}
            <CartUpsell onAdded={() => setCart(getCart())} />

            {/* Summary */}
            <section style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, color: COLORS.black }}>Subtotal</div>
                <div style={{ fontWeight: 950, color: COLORS.black }}>{formatIDR(subtotal + tbsBasket.subtotal)}</div>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#6B6B6B" }}>
                <div>Delivery</div>
                <div style={{ fontWeight: 800 }}>Live quote at checkout (Lalamove)</div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <Link href="/build" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                  ← Add more cookies
                </Link>
                <button
                  onClick={onClearCart}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#6B6B6B",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Clear cart
                </button>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Sticky CTA */}
      {!isEmpty && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: COLORS.white,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 -10px 30px rgba(0,0,0,0.05)",
            padding: "12px 14px",
          }}
        >
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 900, color: COLORS.black }}>{totalItems} {totalItems === 1 ? "item" : "items"}</div>
              <div style={{ color: "#6B6B6B", fontWeight: 800 }}>Subtotal: {formatIDR(subtotal + tbsBasket.subtotal)}</div>
            </div>

            <button
              onClick={goCheckout}
              disabled={hasUnavailable}
              style={{
                marginTop: 10,
                width: "100%",
                borderRadius: 999,
                height: 52,
                border: "none",
                cursor: hasUnavailable ? "not-allowed" : "pointer",
                background: hasUnavailable ? "rgba(0,82,204,0.45)" : COLORS.blue,
                color: COLORS.white,
                fontWeight: 950,
                fontSize: 16,
                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              }}
            >
              {hasUnavailable ? "Remove sold out items to continue" : "Continue to checkout"}
            </button>

            {hasUnavailable && (
              <div style={{ marginTop: 8, textAlign: "center", color: "rgba(0,0,0,0.62)", fontWeight: 800, fontSize: 12 }}>
                Sold out items are marked above.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
