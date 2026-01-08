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

function safeParseCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countCookies(cart: CartItem[]) {
  return cart.reduce((sum, box) => {
    return (
      sum +
      (box.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0)
    );
  }, 0);
}

export default function CartPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [gift, setGift] = useState(false);
  const [giftNote, setGiftNote] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = safeParseCart(raw);
    setCart(parsed);

    // If the latest box has a giftNote, initialize UI nicely
    const firstGift = parsed.find((x) => x.giftNote && String(x.giftNote).trim().length > 0);
    if (firstGift) {
      setGift(true);
      setGiftNote(String(firstGift.giftNote));
    }
  }, []);

  // Persist (gift note applied to all boxes for MVP simplicity)
  useEffect(() => {
    try {
      const next = cart.map((b) => ({ ...b, giftNote: gift ? giftNote : undefined }));
      localStorage.setItem(CART_KEY, JSON.stringify(next));
    } catch {}
  }, [cart, gift, giftNote]);

  const stats = useMemo(() => {
    const boxes = cart.length;
    const cookies = countCookies(cart);
    const subtotal = cart.reduce((s, it) => s + (it.price || 0), 0);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 20000; // placeholder
    const total = subtotal + shipping;
    return { boxes, cookies, subtotal, shipping, total };
  }, [cart]);

  function clearCart() {
    try {
      localStorage.removeItem(CART_KEY);
    } catch {}
    setCart([]);
    setGift(false);
    setGiftNote("");
  }

  function removeBox(createdAt: number) {
    const next = cart.filter((b) => b.createdAt !== createdAt);
    setCart(next);
  }

  if (cart.length === 0) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-flex",
            gap: 10,
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(0,0,0,0.02)",
            fontWeight: 950,
            fontSize: 12,
          }}
        >
          🛒 COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Cart</span>
        </div>

        <h1 style={{ margin: "14px 0 8px", fontSize: 32, letterSpacing: -0.3 }}>
          Your cart is empty
        </h1>
        <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.5, maxWidth: 650 }}>
          Your cookie box is feeling lonely. Build a fresh box and we’ll get it on the way.
        </p>

        <div style={{ marginTop: 18 }}>
          <Link
            href="/build/6"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              textDecoration: "none",
              background: "var(--brand-blue)",
              color: "#fff",
              fontWeight: 950,
            }}
          >
            Build a box <span aria-hidden>→</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1080, margin: "0 auto", paddingBottom: 110 }}>
      {/* Header */}
      <header style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(0,0,0,0.02)",
                fontWeight: 950,
                fontSize: 12,
              }}
            >
              🛒 COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Cart</span>
            </div>

            <h1 style={{ margin: "12px 0 6px", fontSize: 30, letterSpacing: -0.3 }}>
              Your boxes
            </h1>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "rgba(0,0,0,0.03)",
                  fontSize: 12,
                  fontWeight: 950,
                }}
              >
                {stats.boxes} box{stats.boxes > 1 ? "es" : ""}
              </span>

              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "rgba(0,0,0,0.03)",
                  fontSize: 12,
                  fontWeight: 950,
                }}
              >
                {stats.cookies} cookies
              </span>

              <span style={{ color: "rgba(0,0,0,0.75)" }}>
                Subtotal: <strong>IDR {formatIDR(stats.subtotal)}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/build"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "rgba(0,0,0,0.02)",
                textDecoration: "none",
                color: "inherit",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              + Add another box
            </Link>

            <button
              type="button"
              onClick={clearCart}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              Clear cart
            </button>
          </div>
        </div>
      </header>

      {/* Free shipping note */}
      <section
        style={{
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(0,0,0,0.02)",
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
          lineHeight: 1.5,
          color: "rgba(0,0,0,0.75)",
        }}
      >
        {stats.subtotal >= FREE_SHIPPING_THRESHOLD ? (
          <div>
            🚚 <strong>Free shipping unlocked.</strong> Sweet.
          </div>
        ) : (
          <div>
            🚚 Add <strong>IDR {formatIDR(FREE_SHIPPING_THRESHOLD - stats.subtotal)}</strong> more to enjoy{" "}
            <strong>free shipping</strong>.
          </div>
        )}
      </section>

      {/* Boxes list */}
      <section style={{ display: "grid", gap: 12 }}>
        {cart.map((box) => {
          const boxLabel = `Box of ${box.boxSize}`;
          return (
            <div
              key={box.createdAt}
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 18,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  background: "rgba(0,0,0,0.02)",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>{boxLabel}</div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.70)" }}>
                    IDR {formatIDR(box.price)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeBox(box.createdAt)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  Remove
                </button>
              </div>

              <div style={{ padding: 14, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  {box.items.map((it) => {
                    const f = FLAVORS.find((x) => x.id === it.flavorId);
                    const name = f?.name ?? it.flavorId;
                    return (
                      <div
                        key={`${box.createdAt}-${it.flavorId}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderRadius: 14,
                          background: "rgba(0,0,0,0.03)",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{name}</div>
                        <div style={{ fontWeight: 900, color: "rgba(0,0,0,0.75)" }}>
                          × {it.qty}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Gift note */}
      <section
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 18,
          background: "#fff",
          padding: 16,
        }}
      >
        <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
          <span style={{ fontWeight: 950 }}>This is a gift</span>
          <span style={{ color: "rgba(0,0,0,0.60)", fontSize: 13 }}>
            (we’ll include a handwritten note)
          </span>
        </label>

        {gift && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={giftNote}
              onChange={(e) => setGiftNote(e.target.value)}
              placeholder="Write a short note…"
              maxLength={200}
              style={{
                width: "100%",
                minHeight: 90,
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.12)",
                outline: "none",
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div className="font-dearjoe" style={{ opacity: 0.9 }}>
                Made with love, always.
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{giftNote.length}/200</div>
            </div>
          </div>
        )}
      </section>

      {/* Sticky checkout bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          padding: "14px 14px 18px",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid rgba(0,0,0,0.10)",
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 950 }}>
              Total: <strong>IDR {formatIDR(stats.total)}</strong>
            </div>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.70)" }}>
              Shipping: {stats.shipping === 0 ? "Free" : `IDR ${formatIDR(stats.shipping)}`}
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/checkout")}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              border: "none",
              background: "var(--brand-blue)",
              color: "#fff",
              fontWeight: 950,
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            Checkout
          </button>
        </div>
      </div>
    </main>
  );
}
