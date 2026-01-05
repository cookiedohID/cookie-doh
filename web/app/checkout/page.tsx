"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAVORS, formatIDR as formatIDRFromCatalog, FREE_SHIPPING_THRESHOLD } from "@/lib/catalog";

type LegacyCartItem = {
  boxSize: number;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
  giftNote?: string;
};

type MidtransItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options?: {
          onSuccess?: (result: any) => void;
          onPending?: (result: any) => void;
          onError?: (result: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

const CART_KEY = "cookieDohCart";

function formatIDR(n: number) {
  // prefer your shared helper if it exists/works
  try {
    return formatIDRFromCatalog(n);
  } catch {
    try {
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);
    } catch {
      return `Rp ${n.toLocaleString("id-ID")}`;
    }
  }
}

function safeParseCart(raw: string | null): LegacyCartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function legacyCartToMidtransItems(cart: LegacyCartItem[]): MidtransItem[] {
  const items: MidtransItem[] = [];

  for (const box of cart) {
    // Create a readable name: "Box of 6: Choco Chip x2, Matcha x4"
    const parts = (box.items || []).map((x) => {
      const f = FLAVORS.find((ff) => ff.id === x.flavorId);
      const name = f?.name ?? x.flavorId;
      return `${name} x${x.qty}`;
    });

    const name = parts.length ? `Box of ${box.boxSize}: ${parts.join(", ")}` : `Box of ${box.boxSize}`;

    items.push({
      id: `box-${box.createdAt}`,
      name,
      // IMPORTANT: Midtrans requires integer prices in IDR
      price: Math.max(0, Math.round(Number(box.price) || 0)),
      quantity: 1,
    });
  }

  return items;
}

export default function CheckoutPage() {
  const router = useRouter();

  const [legacyCart, setLegacyCart] = useState<LegacyCartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapReady, setSnapReady] = useState(false);

  // Env
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const isProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
  const snapSrc = isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

  // Load cart from localStorage (cookieDohCart)
  useEffect(() => {
    const raw = localStorage.getItem(CART_KEY);
    setLegacyCart(safeParseCart(raw));
  }, []);

  // Convert to Midtrans items (id, name, price, quantity)
  const midtransItems = useMemo(() => legacyCartToMidtransItems(legacyCart), [legacyCart]);

  const totals = useMemo(() => {
    const subtotal = midtransItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const totalQty = midtransItems.reduce((sum, it) => sum + it.quantity, 0);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 20000; // placeholder
    const total = subtotal + shipping;
    return { subtotal, totalQty, shipping, total };
  }, [midtransItems]);

  async function handlePay() {
    if (!clientKey) {
      alert("Missing NEXT_PUBLIC_MIDTRANS_CLIENT_KEY in env.");
      return;
    }
    if (!midtransItems.length) {
      alert("Your cart is empty.");
      return;
    }
    if (!window.snap) {
      alert("Midtrans Snap is not ready yet. Please try again in a moment.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/midtrans/snap-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: midtransItems,
          // TODO: replace with real customer form fields
          customer: {
            first_name: "Cookie",
            last_name: "Doh",
            email: "customer@example.com",
            phone: "08123456789",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create Snap token.");

      const { token, order_id } = data as { token: string; order_id: string };

      window.snap.pay(token, {
        onSuccess: () => router.push(`/checkout/success?order_id=${encodeURIComponent(order_id)}`),
        onPending: () => router.push(`/checkout/pending?order_id=${encodeURIComponent(order_id)}`),
        onError: () => router.push(`/checkout/failed?order_id=${encodeURIComponent(order_id)}`),
        onClose: () => {
          // user closed popup; keep them on checkout
        },
      });
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Script
        src={snapSrc}
        data-client-key={clientKey}
        strategy="afterInteractive"
        onLoad={() => setSnapReady(true)}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h1 style={{ marginBottom: 16 }}>Checkout</h1>

        {!clientKey && (
          <div
            style={{
              border: "1px solid #f3c",
              padding: 12,
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <strong>Env missing:</strong> NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Left: items */}
          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Order Items</h2>

            {midtransItems.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.75 }}>
                Your cart is empty.{" "}
                <button
                  type="button"
                  onClick={() => router.push("/build")}
                  style={{
                    border: "none",
                    background: "transparent",
                    textDecoration: "underline",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Build a box
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {midtransItems.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.03)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.name}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        {formatIDR(it.price)} × {it.quantity}
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      {formatIDR(it.price * it.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => router.push("/cart")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                ← Back to cart
              </button>
            </div>
          </div>

          {/* Right: summary */}
          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Summary</h2>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span>Boxes</span>
              <span>{totals.totalQty}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700 }}>{formatIDR(totals.subtotal)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span>Shipping</span>
              <span style={{ fontWeight: 700 }}>
                {totals.shipping === 0 ? "Free" : formatIDR(totals.shipping)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span>Total</span>
              <span style={{ fontWeight: 800 }}>{formatIDR(totals.total)}</span>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
              Payment popup: {snapReady ? "Ready ✅" : "Loading…"}
            </div>

            <button
              type="button"
              onClick={handlePay}
              disabled={loading || !snapReady || !clientKey || midtransItems.length === 0}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: loading ? "wait" : "pointer",
                opacity: loading || !snapReady || !clientKey || midtransItems.length === 0 ? 0.6 : 1,
                fontWeight: 800,
              }}
            >
              {loading ? "Processing…" : "Pay with Midtrans"}
            </button>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
              Tip: Don’t fulfill from “Success page”. Use Midtrans notification/webhook to confirm settlement.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
