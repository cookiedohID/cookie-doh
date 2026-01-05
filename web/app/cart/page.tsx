"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FLAVORS, formatIDR, FREE_SHIPPING_THRESHOLD } from "@/lib/catalog";

type CartItem = {
  boxSize: number;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
  giftNote?: string;
};

const CART_KEY = "cookieDohCart";

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [gift, setGift] = useState(false);
  const [giftNote, setGiftNote] = useState("");

  // Load cart from localStorage on first mount (safe parse)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCart([]);
    }
  }, []);

  // Persist cart + gift note into localStorage whenever they change
  useEffect(() => {
    try {
      const nextCart = cart.map((it) => ({
        ...it,
        giftNote: gift ? giftNote : undefined,
      }));
      localStorage.setItem(CART_KEY, JSON.stringify(nextCart));
    } catch {
      // ignore write errors
    }
  }, [cart, gift, giftNote]);

  const subtotal = useMemo(
    () => cart.reduce((s, it) => s + (it.price || 0), 0),
    [cart]
  );

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 20000; // placeholder
  const total = subtotal + shipping;

  function clearCart() {
    try {
      localStorage.removeItem(CART_KEY);
    } catch {}
    setCart([]);
    setGift(false);
    setGiftNote("");
  }

  if (cart.length === 0) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1>Your cart</h1>
        <p>Your cookie box is feeling lonely.</p>
        <Link href="/build">Build a box</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1>Your cart</h1>

      {/* Items */}
      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {cart.map((it, idx) => (
          <div
            key={`${it.createdAt}-${idx}`}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800 }}>Box of {it.boxSize}</div>

            <div style={{ marginTop: 10 }}>
              {it.items.map((x) => {
                const f = FLAVORS.find((ff) => ff.id === x.flavorId);
                return (
                  <div key={x.flavorId}>
                    {x.qty}× {f?.name ?? x.flavorId}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontWeight: 800 }}>
              IDR {formatIDR(it.price)}
            </div>
          </div>
        ))}
      </div>

      {/* Gift */}
      <section
        style={{
          marginTop: 18,
          borderTop: "1px solid #eee",
          paddingTop: 18,
        }}
      >
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={gift}
            onChange={(e) => setGift(e.target.checked)}
          />
          <span style={{ fontWeight: 700 }}>This is a gift</span>
        </label>

        {gift && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={giftNote}
              onChange={(e) => setGiftNote(e.target.value)}
              placeholder="Write a little note (we’ll handwrite it)"
              maxLength={200}
              style={{
                width: "100%",
                minHeight: 90,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
            />
            <div className="font-dearjoe" style={{ marginTop: 8 }}>
              Made with love, always.
            </div>
          </div>
        )}
      </section>

      {/* Summary */}
      <section style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <strong>IDR {formatIDR(subtotal)}</strong>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <span>Shipping</span>
          <strong>{shipping === 0 ? "Free" : `IDR ${formatIDR(shipping)}`}</strong>
        </div>

        {subtotal < FREE_SHIPPING_THRESHOLD && (
          <div style={{ marginTop: 10, color: "#444" }}>
            Just IDR {formatIDR(FREE_SHIPPING_THRESHOLD - subtotal)} more to enjoy
            free shipping 😌
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 14,
            fontSize: 18,
          }}
        >
          <span>Total</span>
          <strong>IDR {formatIDR(total)}</strong>
        </div>
      </section>

      {/* Actions */}
      <section
        style={{
          display: "flex",
          gap: 12,
          marginTop: 18,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/build"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Add another box
        </Link>

        <button
          onClick={clearCart}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Clear cart
        </button>

        <button
          onClick={() => router.push("/checkout")}
          style={{
            marginLeft: "auto",
            padding: "12px 14px",
            borderRadius: 10,
            border: "none",
            background: "var(--brand-blue)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Checkout
        </button>
      </section>
    </main>
  );
}
