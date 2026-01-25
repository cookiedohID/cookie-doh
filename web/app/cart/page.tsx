"use client";

// web/app/cart/page.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
};

type CartBox = {
  boxSize: number;
  items: CartItem[];
  total: number;
};

type CartState = {
  boxes: CartBox[];
};

const CART_KEY = "cookie_doh_cart_v1";

const COLORS = {
  blue: "#0052CC",
  orange: "#FF5A00",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function readCart(): CartState {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { boxes: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.boxes)) return { boxes: [] };
    return parsed as CartState;
  } catch {
    return { boxes: [] };
  }
}

function writeCart(state: CartState) {
  localStorage.setItem(CART_KEY, JSON.stringify(state));
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>({ boxes: [] });

  useEffect(() => {
    setCart(readCart());
  }, []);

  const soldOutSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of CATALOG_FLAVORS as any[]) {
      if (f?.soldOut) s.add(String(f.id));
    }
    return s;
  }, []);

  const subtotal = useMemo(() => {
    return cart.boxes.reduce((sum, b) => sum + (b.total || 0), 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.boxes.reduce((sum, b) => {
      const boxCount = b.items.reduce((s, it) => s + (it.quantity || 0), 0);
      return sum + boxCount;
    }, 0);
  }, [cart]);

  const unavailableCount = useMemo(() => {
    let n = 0;
    for (const b of cart.boxes) {
      for (const it of b.items) {
        if (soldOutSet.has(String(it.id))) n += 1;
      }
    }
    return n;
  }, [cart, soldOutSet]);

  const hasUnavailable = unavailableCount > 0;

  const removeBox = (idx: number) => {
    setCart((prev) => {
      const next = { boxes: prev.boxes.slice() };
      next.boxes.splice(idx, 1);
      writeCart(next);
      return next;
    });
  };

  const removeUnavailableItems = () => {
    setCart((prev) => {
      const next: CartState = {
        boxes: prev.boxes
          .map((b) => ({
            ...b,
            items: b.items.filter((it) => !soldOutSet.has(String(it.id))),
          }))
          .filter((b) => b.items.length > 0),
      };

      // Recompute totals for boxes (keep safe even if totals were precomputed)
      next.boxes = next.boxes.map((b) => {
        const total = b.items.reduce(
          (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0),
          0
        );
        return { ...b, total: b.total && b.total > 0 ? b.total : total };
      });

      writeCart(next);
      return next;
    });
  };

  const clearCart = () => {
    const next = { boxes: [] as CartBox[] };
    writeCart(next);
    setCart(next);
  };

  const goCheckout = () => {
    if (hasUnavailable) return;
    router.push("/checkout");
  };

  const isEmpty = cart.boxes.length === 0;

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

        {/* Unavailable alert */}
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
                  Remove the sold out items to continue to checkout.
                </div>
              </div>

              <button
                type="button"
                onClick={removeUnavailableItems}
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ fontWeight: 950, color: COLORS.black }}>
                        Box of {box.boxSize} • {boxCount} cookies
                      </div>

                      <button
                        onClick={() => removeBox(idx)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#6B6B6B",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Remove box
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {box.items.map((it) => {
                        const isSoldOut = soldOutSet.has(String(it.id));

                        return (
                          <div
                            key={it.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 10px",
                              borderRadius: 14,
                              background: COLORS.sand,
                              border: "1px solid rgba(0,0,0,0.06)",
                              opacity: isSoldOut ? 0.85 : 1,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  color: COLORS.black,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {it.name} × {it.quantity}
                              </div>

                              {isSoldOut && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "5px 10px",
                                      borderRadius: 999,
                                      background: "rgba(0,0,0,0.72)",
                                      color: COLORS.white,
                                      fontWeight: 950,
                                      fontSize: 12,
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    SOLD OUT
                                  </span>
                                  <span style={{ color: "rgba(0,0,0,0.60)", fontWeight: 800, fontSize: 12 }}>
                                    Remove to checkout
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ color: "#6B6B6B" }}>Box total</div>
                      <div style={{ fontWeight: 950, color: COLORS.black }}>
                        {formatIDR(box.total || 0)}
                      </div>
                    </div>
                  </article>
                );
              })}
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  color: "#3C3C3C",
                  fontSize: 13,
                }}
              >
                <div>✨ Baked fresh on order</div>
                <div>✨ Limited daily batches</div>
                <div>✨ Jakarta delivery</div>
                <div>✨ Packed with care</div>
              </div>
            </section>

            {/* Summary */}
            <section style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, color: COLORS.black }}>Subtotal</div>
                <div style={{ fontWeight: 950, color: COLORS.black }}>{formatIDR(subtotal)}</div>
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  color: "#6B6B6B",
                }}
              >
                <div>Delivery</div>
                <div>Calculated at checkout</div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <Link href="/build" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                  ← Add more cookies
                </Link>

                <button
                  onClick={clearCart}
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
              <div style={{ fontWeight: 900, color: COLORS.black }}>{totalItems} cookies</div>
              <div style={{ color: "#6B6B6B", fontWeight: 800 }}>
                Subtotal: {formatIDR(subtotal)}
              </div>
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
