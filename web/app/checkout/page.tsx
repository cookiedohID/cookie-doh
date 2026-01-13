// web/app/checkout/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GoogleAddressInput from "@/components/GoogleAddressInput";

type CartItem = {
  id: string;
  name: string;
  quantity: number;
  image?: string;
  price?: number; // ignored (box pricing)
};

type CartBox = {
  boxSize: number;
  items: CartItem[];
  total: number; // fixed box price
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

/** Normalize Indonesian phone/WA numbers to +62XXXXXXXXXXX */
function normalizeIDPhone(input: string) {
  const raw = (input || "").trim();
  const digits = raw.replace(/[^\d+]/g, "");
  let cleaned = digits;

  if (!cleaned.startsWith("+") && cleaned.startsWith("62")) cleaned = `+${cleaned}`;
  if (cleaned.startsWith("08")) cleaned = `+62${cleaned.slice(1)}`;

  return cleaned;
}

function validatePhone(input: string) {
  const normalized = normalizeIDPhone(input);

  if (!normalized) return { ok: false, normalized: "", message: "Please add your WhatsApp number." };

  if (normalized.startsWith("+62")) {
    const onlyDigits = normalized.replace(/[^\d]/g, "");
    if (onlyDigits.length < 11 || onlyDigits.length > 14) {
      return {
        ok: false,
        normalized,
        message: "WhatsApp number looks too short/long. Example: 0812xxxxxxx",
      };
    }
    return { ok: true, normalized, message: "" };
  }

  const digitCount = normalized.replace(/[^\d]/g, "").length;
  if (digitCount < 8) return { ok: false, normalized, message: "WhatsApp number looks invalid." };

  return { ok: true, normalized, message: "" };
}

async function readErrorBody(res: Response) {
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = await res.json();
      return j?.error || j?.message || JSON.stringify(j);
    }
  } catch {}
  try {
    const t = await res.text();
    return t || null;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartState>({ boxes: [] });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Basic form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Address fields
  const [addressResolved, setAddressResolved] = useState(false);

  const [addressText, setAddressText] = useState("");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);

  // Building & postal
  const [buildingName, setBuildingName] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Delivery method cards
  const [delivery, setDelivery] = useState<"standard" | "sameday">("standard");

  useEffect(() => {
    setCart(readCart());
  }, []);

  const subtotal = useMemo(
    () => cart.boxes.reduce((s, b) => s + (b.total || 0), 0),
    [cart]
  );

  const isEmpty = cart.boxes.length === 0;

  const allItems = useMemo(() => {
    const items: CartItem[] = [];
    cart.boxes.forEach((b) => b.items.forEach((it) => items.push(it)));
    return items;
  }, [cart]);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const sameStyle: CSSProperties = {
    height: 46,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "0 12px",
    outline: "none",
  };

  const validate = () => {
    if (!name.trim()) return "Please add your name.";

    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.ok) return phoneCheck.message;

    if (!addressText.trim()) return "Please add your delivery address.";

    // Must be selected from Google (valid lat/lng)
    if (!addressResolved || addressLat === null || addressLng === null) {
      return "Please choose a valid address from the Google suggestions.";
    }

    return null;
  };

  const placeOrder = async () => {
    setErr(null);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    if (isEmpty) {
      setErr("Your cart is empty. Please build a box first.");
      return;
    }

    const phoneCheck = validatePhone(phone);
    const normalizedPhone = phoneCheck.normalized || phone;

    setLoading(true);
    try {
      // We always POST to /api/checkout.
      // Server decides manual/midtrans via NEXT_PUBLIC_CHECKOUT_MODE.
      const payload = {
        customer: { name: name.trim(), phone: normalizedPhone },
        delivery: {
          method: delivery,
          address: addressText,
          lat: addressLat,
          lng: addressLng,
          buildingName,
          postalCode,
        },
        notes,
        cart,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(
          body
            ? `Checkout failed (HTTP ${res.status}). ${body}`
            : `Checkout failed (HTTP ${res.status}). Please try again.`
        );
      }

      const data = await res.json().catch(() => ({} as any));
      const redirectUrl = data?.redirect_url || data?.redirectUrl;

      if (!redirectUrl) {
        throw new Error(`Missing redirect_url from server: ${JSON.stringify(data)}`);
      }

      window.location.href = redirectUrl;
    } catch (e: any) {
      setErr(e?.message || "Something went wrong — let’s try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isEmpty) {
    return (
      <main style={{ minHeight: "100vh", background: "#fff" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px" }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "#101010" }}>Checkout</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>You’re almost there 🤍</p>

          <section
            style={{
              marginTop: 16,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "#FAF7F2",
              padding: 18,
            }}
          >
            <div style={{ fontWeight: 900, color: "#101010" }}>Your box is waiting 🤍</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", lineHeight: 1.6 }}>
              Please build your cookie box first.
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
                fontWeight: 900,
                textDecoration: "none",
                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              }}
            >
              Build your box 🍪
            </Link>

            <div style={{ marginTop: 12 }}>
              <Link href="/cart" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                ← Back to cart
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px 120px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "#101010" }}>Checkout</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>You’re almost there 🤍</p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {/* CONTACT */}
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, color: "#101010" }}>Contact details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              We’ll use this to update you about your order.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={sameStyle}
                  placeholder="Your name"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>WhatsApp number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={sameStyle}
                  placeholder="e.g. 0812xxxxxxx or +62812xxxxxxx"
                />
                <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                  We’ll send payment + delivery updates via WhatsApp.
                </div>
              </label>
            </div>
          </section>

          {/* DELIVERY */}
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, color: "#101010" }}>Delivery details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              Please double-check your address to avoid delivery delays.{" "}
              <span style={{ color: "#3C3C3C" }}>Jakarta same-day available for selected areas ✨</span>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {/* Address (Google required) */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  Address
                </div>

                <GoogleAddressInput
                  apiKey={mapsKey}
                  placeholder="Start typing your address…"
                  types={["geocode"]}
                  onResolved={(val: any) => {
                    // 1) best case: Google gives building / name
                    const b1 = val?.building || val?.name;

                    // 2) fallback: if Google only returns a formatted address,
                    // take the first part before the comma as "building-ish"
                    const fa = val?.formattedAddress || val?.formatted_address || "";
                    const b2 = fa ? String(fa).split(",")[0].trim() : "";

                    const finalBuilding = (b1 && String(b1).trim()) || b2;

                    if (finalBuilding) setBuildingName(finalBuilding);

                    // keep postal enrichment when available
                    if (val?.postal) setPostalCode(String(val.postal));
                  }}

                />

                <input
                  value={addressText}
                  onChange={(e) => {
                    setAddressText(e.target.value);
                    setAddressResolved(false); // manual edit -> not valid until Google selection again
                  }}
                  placeholder="Unit / floor / landmark (after selecting from Google)"
                  style={sameStyle}
                />

                {!mapsKey && (
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                    (Autocomplete is off because Google Maps API key is not set.)
                  </div>
                )}
              </div>

              {/* ✅ Building search (Google) — THIS IS THE KEY PART */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  Building / Apartment (optional)
                </div>

                {/* IMPORTANT:
                   Using `geocode` is more reliable in Indonesia than `establishment`.
                   We still capture building name from val.name/val.building.
                */}
                <GoogleAddressInput
                  apiKey={mapsKey}
                  placeholder="Search building name… (e.g. Kemang Village, Infinity Tower)"
                  types={["geocode"]}
                  onResolved={(val: any) => {
                    const b = val?.building || val?.name || "";
                    if (b) setBuildingName(String(b));
                    if (val?.postal) setPostalCode(String(val.postal));
                  }}
                />

                <input
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="Or type manually"
                  style={sameStyle}
                />
              </div>

              {/* Postal code */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  Postal code (optional)
                </div>
                <input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 12150"
                  style={sameStyle}
                />
              </div>

              {/* Notes */}
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    minHeight: 90,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "10px 12px",
                    outline: "none",
                    resize: "vertical",
                  }}
                  placeholder="Gift note, delivery timing, special instructions…"
                />
              </label>

              {/* Delivery method */}
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Delivery method</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setDelivery("standard")}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: delivery === "standard" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: delivery === "standard" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Standard</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Reliable & safe</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDelivery("sameday")}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: delivery === "sameday" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: delivery === "sameday" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>For when you need cookies now 🍪</div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ORDER SUMMARY */}
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, color: "#101010" }}>Your order 🤍</div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {allItems.map((it, i) => (
                <div key={`${it.id}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ color: "#101010", fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.name} <span style={{ color: "#6B6B6B", fontWeight: 700 }}>×{it.quantity}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6B6B6B" }}>
                <div>Subtotal</div>
                <div>{formatIDR(subtotal)}</div>
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", color: "#6B6B6B" }}>
                <div>Delivery</div>
                <div>Calculated at payment</div>
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 950, color: "#101010" }}>Total</div>
                <div style={{ fontWeight: 950, color: "#101010" }}>{formatIDR(subtotal)}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Link href="/cart" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                ← Back to cart
              </Link>
            </div>
          </section>

          {err && (
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff" }}>
              <div style={{ fontWeight: 950, color: "#101010" }}>Hmm, something doesn’t look right.</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{err}</div>
            </section>
          )}
        </div>
      </div>

      {/* Sticky Place Order */}
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
          <button
            onClick={placeOrder}
            disabled={loading}
            style={{
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "rgba(0,82,204,0.55)" : "#0052CC",
              color: "#fff",
              fontWeight: 950,
              fontSize: 16,
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
            }}
          >
            {loading ? "Preparing payment…" : "Place order"}
          </button>

          <div style={{ marginTop: 8, color: "#6B6B6B", fontSize: 12, textAlign: "center" }}>
            By placing your order, you agree to our terms.
          </div>
        </div>
      </div>
    </main>
  );
}
