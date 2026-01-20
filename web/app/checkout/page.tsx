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
  price?: number;
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

  // ✅ touched states for inline errors
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);

  // Address validation state
  const [addressResolved, setAddressResolved] = useState(false);
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);

  // Address fields
  const [addressBase, setAddressBase] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  // Building & postal
  const [buildingName, setBuildingName] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Delivery method
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

  // ✅ Derived values MUST live here (not inside validate)
  const phoneCheck = validatePhone(phone);
  const phoneError = phoneTouched && !phoneCheck.ok ? phoneCheck.message : "";

  const addressError =
    addressTouched && (!addressBase.trim() || !addressResolved)
      ? "Please select a valid address from the suggestions."
      : "";

  const validate = () => {
    if (!name.trim()) return "Please add your name.";

    if (!phoneCheck.ok) return phoneCheck.message;

    if (!addressBase.trim()) return "Please choose your address from Google.";

    if (!addressResolved || addressLat === null || addressLng === null) {
      return "Please choose a valid address from the Google suggestions.";
    }

    return null;
  };

  const placeOrder = async () => {
    setErr(null);

    // show inline errors
    setPhoneTouched(true);
    setAddressTouched(true);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    if (isEmpty) {
      setErr("Your cart is empty. Please build a box first.");
      return;
    }

    const normalizedPhone = phoneCheck.normalized || normalizeIDPhone(phone);

    const fullAddress = addressDetail.trim()
      ? `${addressBase}\n${addressDetail.trim()}`
      : addressBase;

    setLoading(true);
    try {
      const payload = {
        customer: { name: name.trim(), phone: normalizedPhone },
        delivery: {
          method: delivery,
          address: fullAddress,
          addressBase,
          addressDetail,
          lat: addressLat,
          lng: addressLng,
          buildingName,
          postalCode,
        },
        notes,
        cart,
        total: subtotal,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(
          body ? `Checkout failed (HTTP ${res.status}). ${body}` : `Checkout failed (HTTP ${res.status}).`
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

          <section style={{ marginTop: 16, borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", background: "#FAF7F2", padding: 18 }}>
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

        <div style={{ display: "grid", gap: 14 }}>
          {/* CONTACT */}
          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Contact details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              We’ll use this to update you about your order.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} style={sameStyle} placeholder="Your name" />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>WhatsApp number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  style={sameStyle}
                  placeholder="e.g. 0812xxxxxxx or +62812xxxxxxx"
                />
                {phoneError ? (
                  <div style={{ fontSize: 12, color: "crimson", fontWeight: 700 }}>{phoneError}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                    We’ll send payment + delivery updates via WhatsApp.
                  </div>
                )}
              </label>
            </div>
          </section>

          {/* DELIVERY */}
          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Delivery details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              Please double-check your address to avoid delivery delays.{" "}
              <span style={{ color: "#3C3C3C" }}>Jakarta same-day available for selected areas ✨</span>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Address</div>

                <GoogleAddressInput
                  apiKey={mapsKey}
                  placeholder="Type building name or address…"
                  // IMPORTANT: do NOT pass types for building search in the same field
                  onResolved={(val: any) => {
                    const formatted = val?.formattedAddress || val?.formatted_address || "";
                    const lat = typeof val?.lat === "number" ? val.lat : null;
                    const lng = typeof val?.lng === "number" ? val.lng : null;

                    setAddressBase(String(formatted));
                    setAddressLat(lat);
                    setAddressLng(lng);

                    setAddressResolved(!!val?.isResolved || (lat !== null && lng !== null));
                    setAddressTouched(false);

                    const b1 = (val?.building || val?.name || "").toString().trim();
                    const b2 = String(formatted).split(",")[0].trim();
                    const finalBuilding = b1 || b2;
                    if (finalBuilding) setBuildingName(finalBuilding);

                    if (val?.postal) setPostalCode(String(val.postal));
                  }}
                />

                {addressError ? (
                  <div style={{ fontSize: 12, color: "crimson", fontWeight: 700 }}>
                    {addressError}
                  </div>
                ) : null}

                <input
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="Unit / floor / landmark (optional)"
                  style={sameStyle}
                />

                {!mapsKey && (
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                    (Autocomplete is off because Google Maps API key is not set.)
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="Building name (auto, editable)" style={sameStyle} />
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code (auto, editable)" style={sameStyle} />
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ minHeight: 90, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", outline: "none", resize: "vertical" }}
                  placeholder="Gift note, delivery timing, special instructions…"
                />
              </label>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Delivery method</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button type="button" onClick={() => setDelivery("standard")} style={{ textAlign: "left", borderRadius: 16, padding: 12, border: delivery === "standard" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)", background: delivery === "standard" ? "rgba(0,82,204,0.06)" : "#FAF7F2", cursor: "pointer" }}>
                    <div style={{ fontWeight: 900, color: "#101010" }}>Standard</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Reliable & safe</div>
                  </button>

                  <button type="button" onClick={() => setDelivery("sameday")} style={{ textAlign: "left", borderRadius: 16, padding: 12, border: delivery === "sameday" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)", background: delivery === "sameday" ? "rgba(0,82,204,0.06)" : "#FAF7F2", cursor: "pointer" }}>
                    <div style={{ fontWeight: 900, color: "#101010" }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>For when you need cookies now 🍪</div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ORDER SUMMARY */}
          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
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
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 -10px 30px rgba(0,0,0,0.05)", padding: "12px 14px" }}>
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

/*

// web/app/checkout/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GoogleAddressInput from "@/components/GoogleAddressInput";

type CartItem = { id: string; name: string; quantity: number; image?: string; price?: number };
type CartBox = { boxSize: number; items: CartItem[]; total: number };
type CartState = { boxes: CartBox[] };

const CART_KEY = "cookie_doh_cart_v1";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

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
      return { ok: false, normalized, message: "WhatsApp number looks invalid. Example: 0812xxxxxxx" };
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

  // Contact
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneCheck = useMemo(() => validatePhone(phone), [phone]);
  const phoneError = phoneTouched && !phoneCheck.ok ? phoneCheck.message : "";

  // Address (ONE field)
  const [addressBase, setAddressBase] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [addressResolved, setAddressResolved] = useState(false);
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);

  // Auto-filled but editable
  const [buildingName, setBuildingName] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Notes + delivery
  const [notes, setNotes] = useState("");
  const [delivery, setDelivery] = useState<"standard" | "sameday">("standard");

  useEffect(() => setCart(readCart()), []);

  const subtotal = useMemo(() => cart.boxes.reduce((s, b) => s + (b.total || 0), 0), [cart]);
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
    if (!phoneCheck.ok) return phoneCheck.message;

    if (!addressBase.trim()) return "Please choose your address from Google.";
    if (!addressResolved || addressLat === null || addressLng === null) {
      return "Please choose a valid address from the Google suggestions.";
    }
    return null;
  };

  const placeOrder = async () => {
    setErr(null);
    setPhoneTouched(true);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    if (isEmpty) {
      setErr("Your cart is empty. Please build a box first.");
      return;
    }

    const fullAddress = addressDetail.trim() ? `${addressBase}\n${addressDetail.trim()}` : addressBase;

    setLoading(true);
    try {
      const payload = {
        customer: { name: name.trim(), phone: phoneCheck.normalized || normalizeIDPhone(phone) },
        delivery: {
          method: delivery,
          address: fullAddress,
          addressBase,
          addressDetail,
          lat: addressLat,
          lng: addressLng,
          buildingName,
          postalCode,
        },
        notes,
        cart,
        total: subtotal,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(
          body ? `Checkout failed (HTTP ${res.status}). ${body}` : `Checkout failed (HTTP ${res.status}).`
        );
      }

      const data = await res.json().catch(() => ({} as any));
      const redirectUrl = data?.redirect_url || data?.redirectUrl;
      if (!redirectUrl) throw new Error(`Missing redirect_url from server: ${JSON.stringify(data)}`);

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

          <section style={{ marginTop: 16, borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", background: "#FAF7F2", padding: 18 }}>
            <div style={{ fontWeight: 900, color: "#101010" }}>Your box is waiting 🤍</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", lineHeight: 1.6 }}>Please build your cookie box first.</div>

            <Link href="/build" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "14px 22px", background: "#0052CC", color: "#fff", fontWeight: 900, textDecoration: "none", boxShadow: "0 10px 22px rgba(0,0,0,0.08)" }}>
              Build your box 🍪
            </Link>

            <div style={{ marginTop: 12 }}>
              <Link href="/cart" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>← Back to cart</Link>
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
          {/* CONTACT */ 
 /*         <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Contact details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>We’ll use this to update you about your order.</div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} style={sameStyle} placeholder="Your name" />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>WhatsApp number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  style={sameStyle}
                  placeholder="e.g. 0812xxxxxxx or +62812xxxxxxx"
                />
                {phoneError ? (
                  <div style={{ fontSize: 12, color: "crimson", fontWeight: 700 }}>{phoneError}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>We’ll send payment + delivery updates via WhatsApp.</div>
                )}
              </label>
            </div>
          </section>

          {/* DELIVERY */
/*          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Delivery details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              Please double-check your address to avoid delivery delays.{" "}
              <span style={{ color: "#3C3C3C" }}>Jakarta same-day available for selected areas ✨</span>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Address</div>

                {/* ONLY ONE Google input. Do not pass types. */
/*                <GoogleAddressInput
                  apiKey={mapsKey}
                  placeholder="Type building name or address…"
                  onResolved={(val: any) => {
                    const formatted = val?.formattedAddress || val?.formatted_address || "";
                    const lat = typeof val?.lat === "number" ? val.lat : null;
                    const lng = typeof val?.lng === "number" ? val.lng : null;

                    setAddressBase(String(formatted));
                    setAddressLat(lat);
                    setAddressLng(lng);
                    setAddressResolved(!!val?.isResolved || (lat !== null && lng !== null));

                    const b = (val?.building || val?.name || "").toString().trim();
                    if (b) setBuildingName(b);
                    if (val?.postal) setPostalCode(String(val.postal));
                  }}
                />

                <input
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="Unit / floor / landmark (optional)"
                  style={sameStyle}
                />

                {!mapsKey && (
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>(Autocomplete is off because Google Maps API key is not set.)</div>
                )}

                <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                  Detected building: <b>{buildingName || "-"}</b>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="Building name (auto, editable)" style={sameStyle} />
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code (auto, editable)" style={sameStyle} />
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Notes (optional)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 90, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", outline: "none", resize: "vertical" }} placeholder="Gift note, delivery timing, special instructions…" />
              </label>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Delivery method</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button type="button" onClick={() => setDelivery("standard")} style={{ textAlign: "left", borderRadius: 16, padding: 12, border: delivery === "standard" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)", background: delivery === "standard" ? "rgba(0,82,204,0.06)" : "#FAF7F2", cursor: "pointer" }}>
                    <div style={{ fontWeight: 900, color: "#101010" }}>Standard</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Reliable & safe</div>
                  </button>

                  <button type="button" onClick={() => setDelivery("sameday")} style={{ textAlign: "left", borderRadius: 16, padding: 12, border: delivery === "sameday" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)", background: delivery === "sameday" ? "rgba(0,82,204,0.06)" : "#FAF7F2", cursor: "pointer" }}>
                    <div style={{ fontWeight: 900, color: "#101010" }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>For when you need cookies now 🍪</div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ORDER SUMMARY */
/*          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
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
              <Link href="/cart" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>← Back to cart</Link>
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

      {/* Sticky Place Order */
/*      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 -10px 30px rgba(0,0,0,0.05)", padding: "12px 14px" }}>
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


*/