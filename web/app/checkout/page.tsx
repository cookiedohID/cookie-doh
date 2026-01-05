"use client";

import { formatIDR, FREE_SHIPPING_THRESHOLD } from "@/lib/catalog";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CartItem = { price: number };

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const subtotal = useMemo(() => cart.reduce((s, it) => s + (it.price || 0), 0), [cart]);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 20000;
  const total = subtotal + shipping;

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    postalCode: "",
    notes: "",
  });

  useEffect(() => {
    const raw = localStorage.getItem("cookieDohCart");
    setCart(raw ? JSON.parse(raw) : []);
  }, []);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function proceed() {
    alert("Next: Midtrans payment (we’ll wire it next).");
  }

  if (cart.length === 0) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link href="/build">Build a box</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1>Almost there</h1>
      <p>Delivery details — we’ll take care of the rest.</p>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr", marginTop: 18 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Delivery details</h2>

          <div style={{ display: "grid", gap: 12 }}>
            <input placeholder="Full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
            <input placeholder="WhatsApp number" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            <input placeholder="Email (optional)" value={form.email} onChange={(e) => update("email", e.target.value)} />
            <textarea placeholder="Address" value={form.address} onChange={(e) => update("address", e.target.value)} style={{ minHeight: 90 }} />
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <input placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
              <input placeholder="Postal code" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
            </div>
            <textarea placeholder="Order notes (optional)" value={form.notes} onChange={(e) => update("notes", e.target.value)} style={{ minHeight: 70 }} />
          </div>
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Order summary</h2>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <span>Subtotal</span>
            <strong>IDR {formatIDR(subtotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>Shipping</span>
            <strong>{shipping === 0 ? "Free" : `IDR ${formatIDR(shipping)}`}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 18 }}>
            <span>Total</span>
            <strong>IDR {formatIDR(total)}</strong>
          </div>

          <button
            onClick={proceed}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "var(--brand-blue)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Pay with Midtrans
          </button>

          <p style={{ marginTop: 10, color: "#555" }}>
            Secure checkout. We’ve got you.
          </p>
        </section>
      </div>
    </main>
  );
}
