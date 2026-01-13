"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

  const subtotal = useMemo(() => {
    return cart.boxes.reduce((sum, b) => sum + (b.total || 0), 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.boxes.reduce((sum, b) => {
      const boxCount = b.items.reduce((s, it) => s + (it.quantity || 0), 0);
      return sum + boxCount;
    }, 0);
  }, [cart]);

  const removeBox = (idx: number) => {
    setCart((prev) => {
      const next = { boxes: prev.boxes.slice() };
      next.boxes.splice(idx, 1);
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
    router.push("/checkout");
  };

  const isEmpty = cart.boxes.length === 0;

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px 120px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "#101010" }}>Your cookie box 🤍</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>Freshly baked and packed with care.</p>
        </header>

        {isEmpty ? (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "#FAF7F2",
              padding: 18,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#101010" }}>Your box is waiting 🤍</div>
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
                background: "#0052CC",
                color: "#fff",
                fontWeight: 800,
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
                      background: "#fff",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 950, color: "#101010" }}>
                        Box of {box.boxSize} • {boxCount} cookies
                      </div>
                      <button
                        onClick={() => removeBox(idx)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#6B6B6B",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        Remove from box
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {box.items.map((it) => (
                        <div
                          key={it.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 14,
                            background: "#FAF7F2",
                            border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                color: "#101010",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {it.name}
                            </div>

                            <div style={{ color: "#6B6B6B", fontSize: 13 }}>
                              Qty: <span style={{ fontWeight: 800, color: "#101010" }}>{it.quantity}</span>
                            </div>
                          </div>
                          <div style={{ fontWeight: 950, color: "#101010" }}>
                            {formatIDR((it.price || 0) * (it.quantity || 0))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ color: "#6B6B6B" }}>Box total</div>
                      <div style={{ fontWeight: 950, color: "#101010" }}>{formatIDR(box.total || 0)}</div>
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
                background: "#FAF7F2",
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

            {/* Summary */}
            <section style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, color: "#101010" }}>Subtotal</div>
                <div style={{ fontWeight: 950, color: "#101010" }}>{formatIDR(subtotal)}</div>
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#6B6B6B" }}>
                <div>Delivery</div>
                <div>Calculated at checkout</div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <Link href="/build" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                  ← Add more cookies
                </Link>
                <button
                  onClick={clearCart}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#6B6B6B",
                    cursor: "pointer",
                    fontWeight: 800,
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
            background: "#fff",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 -10px 30px rgba(0,0,0,0.05)",
            padding: "12px 14px",
          }}
        >
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, color: "#101010" }}>{totalItems} cookies</div>
              <div style={{ color: "#6B6B6B" }}>Subtotal: {formatIDR(subtotal)}</div>
            </div>

            <button
              onClick={goCheckout}
              style={{
                marginTop: 10,
                width: "100%",
                borderRadius: 999,
                height: 52,
                border: "none",
                cursor: "pointer",
                background: "#0052CC",
                color: "#fff",
                fontWeight: 950,
                fontSize: 16,
                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              }}
            >
              Continue to checkout
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
