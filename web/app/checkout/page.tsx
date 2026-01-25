// web/app/checkout/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

// ✅ Clear cart storage AFTER successful "Place order"
function clearCartStorage() {
  try {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem("cart");
    localStorage.removeItem("cookie_doh_cart");
    localStorage.removeItem("cookie_doh_cart_v0");
    localStorage.removeItem("cart_items");
  } catch (e) {}
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

// --- Scheduling helpers ---
function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDays(n: number) {
  const out: { value: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const val = yyyyMmDd(d);
    const label = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    out.push({ value: val, label });
  }
  return out;
}

function jakartaHourNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value;
  return Number(h || "0");
}

const INSTANT_SLOTS = [
  { value: "10:00-15:00", label: "10:00 – 15:00" },
  { value: "15:00-18:00", label: "15:00 – 18:00" },
] as const;

const SAMEDAY_SLOT = { value: "08:00-22:00", label: "08:00 – 22:00" } as const;

type FulfillmentType = "delivery" | "pickup";
type DeliverySpeed = "instant" | "sameday";

type PickupPoint = { id: string; name: string; address: string; lat: number; lng: number };

function parsePickupPoints(raw: string | undefined): PickupPoint[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: any) => ({
        id: String(p.id || ""),
        name: String(p.name || ""),
        address: String(p.address || ""),
        lat: Number(p.lat),
        lng: Number(p.lng),
      }))
      .filter((p: PickupPoint) => p.id && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

function ceilToThousand(n: number) {
  return Math.ceil(n / 1000) * 1000;
}

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartState>({ boxes: [] });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Basic form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // touched states for inline errors
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [scheduleTouched, setScheduleTouched] = useState(false);

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

  // Fulfillment
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>("instant");

  // Schedule (next 30 days)
  const dateOptions = useMemo(() => nextDays(30), []);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");

  // Pickup points (editable via NEXT_PUBLIC_PICKUP_POINTS_JSON)
  const pickupPoints = useMemo(() => {
    const pts = parsePickupPoints(process.env.NEXT_PUBLIC_PICKUP_POINTS_JSON);
    return pts;
  }, []);
  const [pickupPointId, setPickupPointId] = useState<string>(() => pickupPoints[0]?.id || "");

  // Shipping quote (delivery only)
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<any>(null);

  const quoteAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCart(readCart());
  }, []);

  const subtotal = useMemo(
    () => cart.boxes.reduce((s, b) => s + (b.total || 0), 0),
    [cart]
  );

  const isEmpty = cart.boxes.length === 0;

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const sameStyle: CSSProperties = {
    height: 46,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "0 12px",
    outline: "none",
  };

  const phoneCheck = validatePhone(phone);
  const phoneError = phoneTouched && !phoneCheck.ok ? phoneCheck.message : "";

  const addressError =
    fulfillment === "delivery" &&
    addressTouched &&
    (!addressBase.trim() || !addressResolved)
      ? "Please select a valid address from the suggestions."
      : "";

  const scheduleError =
    scheduleTouched && (!scheduleDate || !scheduleTime)
      ? "Please choose date and time."
      : "";

  // Same-day cutoff
  const isAfterNoonJakarta = jakartaHourNow() >= 12;
  const samedayDisabled = isAfterNoonJakarta;

  // auto-switch away from sameday if it becomes invalid
  useEffect(() => {
    if (deliverySpeed === "sameday" && samedayDisabled) {
      setDeliverySpeed("instant");
    }
  }, [deliverySpeed, samedayDisabled]);

  // Reset schedule when switching fulfillment
  useEffect(() => {
    setScheduleDate("");
    setScheduleTime("");
    setScheduleTouched(false);
  }, [fulfillment, deliverySpeed]);

  // Quote function
  const fetchQuote = async () => {
    if (fulfillment !== "delivery") return;
    if (!addressResolved || addressLat === null || addressLng === null) return;

    quoteAbortRef.current?.abort();
    const ac = new AbortController();
    quoteAbortRef.current = ac;

    setShippingLoading(true);
    setShippingError(null);

    try {
      const res = await fetch("/api/shipping/lalamove/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          lat: addressLat,
          lng: addressLng,
          speed: deliverySpeed, // "instant" | "sameday"
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to calculate delivery fee");

      const price = Number(j?.price);
      if (!Number.isFinite(price)) throw new Error("Invalid quote price");

      setShippingCost(ceilToThousand(price));
      setQuoteMeta({
        provider: "lalamove",
        speed: deliverySpeed,
        serviceType: j?.serviceType || null,
        origin: j?.origin || null,
        rawPrice: j?.rawPrice || null,
        roundedPrice: price,
        quotedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setShippingCost(null);
      setQuoteMeta(null);
      setShippingError(e?.message || "Unable to calculate delivery fee");
    } finally {
      setShippingLoading(false);
    }
  };

  // Auto re-quote on address/speed change (debounced)
  useEffect(() => {
    if (fulfillment !== "delivery") {
      setShippingCost(0);
      setShippingError(null);
      setShippingLoading(false);
      setQuoteMeta(null);
      return;
    }
    if (!addressResolved || addressLat === null || addressLng === null) return;

    const t = setTimeout(() => {
      fetchQuote();
    }, 450);

    return () => clearTimeout(t);
  }, [fulfillment, deliverySpeed, addressResolved, addressLat, addressLng]);

  const deliveryFee = fulfillment === "delivery" ? shippingCost : 0;
  const grandTotal = subtotal + (deliveryFee || 0);

  const validate = () => {
    if (!name.trim()) return "Please add your name.";
    if (!phoneCheck.ok) return phoneCheck.message;

    if (fulfillment === "delivery") {
      if (!addressBase.trim()) return "Please choose your address from Google.";
      if (!addressResolved || addressLat === null || addressLng === null) {
        return "Please choose a valid address from the Google suggestions.";
      }
      if (shippingCost == null) return "Delivery fee unavailable. Please reselect your address.";
    }

    if (!scheduleDate || !scheduleTime) {
      return "Please choose delivery/pickup date and time.";
    }

    if (fulfillment === "pickup" && !pickupPointId) {
      return "Please choose a pickup point.";
    }

    return null;
  };

  const placeOrder = async () => {
    setErr(null);
    setPhoneTouched(true);
    setAddressTouched(true);
    setScheduleTouched(true);

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
      const pickupPoint = pickupPoints.find((p) => p.id === pickupPointId) || null;

      const payload: any = {
        customer: { name: name.trim(), phone: normalizedPhone },

        fulfillment: {
          type: fulfillment, // delivery | pickup
          scheduleDate,
          scheduleTime,
          deliverySpeed: fulfillment === "delivery" ? deliverySpeed : null,
        },

        delivery:
          fulfillment === "delivery"
            ? {
                address: fullAddress,
                addressBase,
                addressDetail,
                lat: addressLat,
                lng: addressLng,
                buildingName,
                postalCode,
                speed: deliverySpeed,
              }
            : null,

        pickup:
          fulfillment === "pickup"
            ? {
                pointId: pickupPoint?.id || pickupPointId,
                pointName: pickupPoint?.name || "",
                pointAddress: pickupPoint?.address || "",
              }
            : null,

        notes,
        cart,
        shipping_cost_idr: fulfillment === "delivery" ? shippingCost : 0,
        total: grandTotal,

        // pass quote meta so backend can store origin/service used
        meta: {
          quote: quoteMeta,
        },
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

      clearCartStorage();
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
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, "");
                    setPhone(digitsOnly);
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  style={sameStyle}
                  placeholder="e.g. 0812xxxxxxx"
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

          {/* Fulfillment */}
          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Fulfillment</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              Choose delivery or pickup, then select date & time.
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setFulfillment("delivery")}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: fulfillment === "delivery" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "delivery" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: "#101010" }}>Delivery</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>We deliver to your address</div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment("pickup")}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: fulfillment === "pickup" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "pickup" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: "#101010" }}>Pickup</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Collect at our pickup point</div>
              </button>
            </div>

            {/* Delivery speed (only when delivery) */}
            {fulfillment === "delivery" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Delivery type</div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setDeliverySpeed("instant")}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: deliverySpeed === "instant" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: deliverySpeed === "instant" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Instant</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Two time slots</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => !samedayDisabled && setDeliverySpeed("sameday")}
                    disabled={samedayDisabled}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: deliverySpeed === "sameday" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: deliverySpeed === "sameday" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: samedayDisabled ? "not-allowed" : "pointer",
                      opacity: samedayDisabled ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                      08:00 – 22:00 {samedayDisabled ? "• Cutoff 12:00" : ""}
                    </div>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Schedule */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  {fulfillment === "pickup" ? "Pickup date" : "Delivery date"}
                </span>
                <select
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  onBlur={() => setScheduleTouched(true)}
                  style={sameStyle}
                >
                  <option value="">Select date</option>
                  {dateOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  {fulfillment === "pickup" ? "Pickup time" : "Delivery time"}
                </span>

                {fulfillment === "delivery" && deliverySpeed === "sameday" ? (
                  <select
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    onBlur={() => setScheduleTouched(true)}
                    style={sameStyle}
                  >
                    <option value="">Select time</option>
                    <option value={SAMEDAY_SLOT.value}>{SAMEDAY_SLOT.label}</option>
                  </select>
                ) : (
                  <select
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    onBlur={() => setScheduleTouched(true)}
                    style={sameStyle}
                  >
                    <option value="">Select time</option>
                    {INSTANT_SLOTS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>

            {scheduleError ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "crimson", fontWeight: 700 }}>
                {scheduleError}
              </div>
            ) : null}

            {/* Pickup points */}
            {fulfillment === "pickup" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Pickup point</div>

                {!pickupPoints.length ? (
                  <div style={{ marginTop: 8, color: "crimson", fontWeight: 800, fontSize: 12 }}>
                    Missing pickup points. Set NEXT_PUBLIC_PICKUP_POINTS_JSON.
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                    {pickupPoints.map((p) => {
                      const active = p.id === pickupPointId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPickupPointId(p.id)}
                          style={{
                            textAlign: "left",
                            borderRadius: 16,
                            padding: 12,
                            border: active ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                            background: active ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: "#101010" }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>{p.address}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* Delivery details */}
          {fulfillment === "delivery" ? (
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
              <div style={{ fontWeight: 950, color: "#101010" }}>Delivery details</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Please double-check your address to avoid delivery delays.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Address</div>

                  <GoogleAddressInput
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
              </div>
            </section>
          ) : (
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
              <div style={{ fontWeight: 950, color: "#101010" }}>Pickup notes (optional)</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Tell us anything we should know for pickup.
              </div>

              <label style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ minHeight: 90, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", outline: "none", resize: "vertical" }}
                  placeholder="Pickup instructions…"
                />
              </label>
            </section>
          )}

          {/* Order summary */}
          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Your order 🤍</div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6B6B6B", fontWeight: 800 }}>
                <div>Subtotal</div>
                <div>{formatIDR(subtotal)}</div>
              </div>

              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", color: "#6B6B6B", fontWeight: 800 }}>
                <div>Delivery fee</div>
                <div>
                  {fulfillment === "pickup"
                    ? formatIDR(0)
                    : shippingLoading
                    ? "Calculating…"
                    : shippingCost != null
                    ? formatIDR(shippingCost)
                    : "—"}
                </div>
              </div>

              {fulfillment === "delivery" && shippingError ? (
                <div style={{ marginTop: 6, color: "crimson", fontWeight: 900, fontSize: 12 }}>
                  {shippingError} (please reselect address)
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: "#101010", fontWeight: 950 }}>
                <div>Total</div>
                <div>{formatIDR(grandTotal)}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: "#6B6B6B", fontWeight: 800 }}>
                <div>{fulfillment === "pickup" ? "Pickup schedule" : "Delivery schedule"}</div>
                <div>
                  {scheduleDate && scheduleTime ? `${scheduleDate} • ${scheduleTime}` : "Select schedule"}
                </div>
              </div>

              {fulfillment === "pickup" && pickupPointId ? (
                <div style={{ marginTop: 6, color: "#6B6B6B", fontWeight: 800 }}>
                  Pickup point: {pickupPoints.find((p) => p.id === pickupPointId)?.name || "—"}
                </div>
              ) : null}
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
            disabled={
              loading ||
              (fulfillment === "delivery" && (shippingCost == null || !!shippingError || shippingLoading))
            }
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
              opacity:
                (fulfillment === "delivery" && (shippingCost == null || !!shippingError || shippingLoading)) ? 0.6 : 1,
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

// ✅ Clear cart storage AFTER successful "Place order"
function clearCartStorage() {
  try {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem("cart");
    localStorage.removeItem("cookie_doh_cart");
    localStorage.removeItem("cookie_doh_cart_v0");
    localStorage.removeItem("cart_items");
  } catch (e) {}
}

/** Normalize Indonesian phone/WA numbers to +62XXXXXXXXXXX */

/*
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

// --- Scheduling helpers ---
function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildNextDays(n: number) {
  const out: { value: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const val = yyyyMmDd(d);
    const label = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    out.push({ value: val, label });
  }
  return out;
}

const DELIVERY_TIME_SLOTS = [
  { value: "10:00-13:00", label: "10:00 – 13:00" },
  { value: "13:00-16:00", label: "13:00 – 16:00" },
  { value: "16:00-19:00", label: "16:00 – 19:00" },
] as const;

const PICKUP_POINTS = [
  {
    id: "kemang-village",
    name: "Kemang Village (Main Lobby)",
    address: "Kemang Village, Jakarta Selatan",
  },
  {
    id: "pik",
    name: "PIK (Pickup Spot)",
    address: "Pantai Indah Kapuk, Jakarta Utara",
  },
  {
    id: "cbd",
    name: "CBD (Pickup Spot)",
    address: "Jakarta Pusat",
  },
] as const;

type FulfillmentType = "delivery" | "pickup";
type DeliverySpeed = "standard" | "sameday";

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
  const [scheduleTouched, setScheduleTouched] = useState(false);

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

  // ✅ NEW: fulfillment type (delivery or pickup)
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");

  // ✅ NEW: delivery speed (standard/sameday) - only relevant if fulfillment === "delivery"
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>("standard");

  // ✅ NEW: schedule date + time
  const deliveryDateOptions = useMemo(() => {
    // standard: next 7 days starting tomorrow
    // sameday: show today + tomorrow (you can tweak)
    const days = deliverySpeed === "sameday" ? buildNextDays(2) : buildNextDays(7).slice(1);
    return days.length ? days : buildNextDays(7);
  }, [deliverySpeed]);

  const pickupDateOptions = useMemo(() => {
    // pickup: next 14 days starting tomorrow
    return buildNextDays(14).slice(1);
  }, []);

  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");

  // ✅ NEW: pickup point selection
  const [pickupPointId, setPickupPointId] = useState<string>(PICKUP_POINTS[0]?.id || "");

  useEffect(() => {
    setCart(readCart());
  }, []);

  const subtotal = useMemo(
    () => cart.boxes.reduce((s, b) => s + (b.total || 0), 0),
    [cart]
  );
  const isEmpty = cart.boxes.length === 0;

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
    fulfillment === "delivery" &&
    addressTouched &&
    (!addressBase.trim() || !addressResolved)
      ? "Please select a valid address from the suggestions."
      : "";

  const scheduleError =
    scheduleTouched && (!scheduleDate || !scheduleTime)
      ? "Please choose delivery/pickup date and time."
      : "";

  // Reset schedule when switching types
  useEffect(() => {
    setScheduleDate("");
    setScheduleTime("");
    setScheduleTouched(false);
  }, [fulfillment, deliverySpeed]);

  const validate = () => {
    if (!name.trim()) return "Please add your name.";
    if (!phoneCheck.ok) return phoneCheck.message;

    if (fulfillment === "delivery") {
      if (!addressBase.trim()) return "Please choose your address from Google.";
      if (!addressResolved || addressLat === null || addressLng === null) {
        return "Please choose a valid address from the Google suggestions.";
      }
    }

    if (!scheduleDate || !scheduleTime) {
      return "Please choose delivery/pickup date and time.";
    }

    if (fulfillment === "pickup" && !pickupPointId) {
      return "Please choose a pickup point.";
    }

    return null;
  };

  const placeOrder = async () => {
    setErr(null);

    // show inline errors
    setPhoneTouched(true);
    setAddressTouched(true);
    setScheduleTouched(true);

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
      const pickupPoint = PICKUP_POINTS.find((p) => p.id === pickupPointId) || null;

      const payload = {
        customer: { name: name.trim(), phone: normalizedPhone },

        fulfillment: {
          type: fulfillment, // "delivery" | "pickup"
          scheduleDate,      // "YYYY-MM-DD"
          scheduleTime,      // "10:00-13:00"
        },

        delivery: fulfillment === "delivery"
          ? {
              speed: deliverySpeed, // "standard" | "sameday"
              address: fullAddress,
              addressBase,
              addressDetail,
              lat: addressLat,
              lng: addressLng,
              buildingName,
              postalCode,
            }
          : null,

        pickup: fulfillment === "pickup"
          ? {
              pointId: pickupPoint?.id || pickupPointId,
              pointName: pickupPoint?.name || "",
              pointAddress: pickupPoint?.address || "",
            }
          : null,

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
          body
            ? `Checkout failed (HTTP ${res.status}). ${body}`
            : `Checkout failed (HTTP ${res.status}).`
        );
      }

      const data = await res.json().catch(() => ({} as any));
      const redirectUrl = data?.redirect_url || data?.redirectUrl;

      if (!redirectUrl) {
        throw new Error(`Missing redirect_url from server: ${JSON.stringify(data)}`);
      }

      // ✅ SUCCESS: clear cart right before redirect (after order creation succeeded)
      clearCartStorage();

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
/*
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
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, "");
                    setPhone(digitsOnly);
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  style={sameStyle}
                  placeholder="e.g. 0812xxxxxxx"
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

          {/* ✅ NEW: DELIVERY vs PICKUP */}
/*          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Fulfillment</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              Choose delivery or pickup, then select date & time.
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setFulfillment("delivery")}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: fulfillment === "delivery" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "delivery" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: "#101010" }}>Delivery</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>We deliver to your address</div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment("pickup")}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: fulfillment === "pickup" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "pickup" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: "#101010" }}>Pickup</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Collect at our pickup point</div>
              </button>
            </div>

            {/* Schedule */}
/*
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  {fulfillment === "pickup" ? "Pickup date" : "Delivery date"}
                </span>
                <select
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  onBlur={() => setScheduleTouched(true)}
                  style={sameStyle}
                >
                  <option value="">Select date</option>
                  {(fulfillment === "pickup" ? pickupDateOptions : deliveryDateOptions).map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>
                  {fulfillment === "pickup" ? "Pickup time" : "Delivery time"}
                </span>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  onBlur={() => setScheduleTouched(true)}
                  style={sameStyle}
                >
                  <option value="">Select time</option>
                  {DELIVERY_TIME_SLOTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {scheduleError ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "crimson", fontWeight: 700 }}>
                {scheduleError}
              </div>
            ) : null}

            {/* Delivery speed (only when delivery) */}
/*            {fulfillment === "delivery" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Delivery speed</div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setDeliverySpeed("standard")}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: deliverySpeed === "standard" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: deliverySpeed === "standard" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Standard</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Reliable & safe</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliverySpeed("sameday")}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: deliverySpeed === "sameday" ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                      background: deliverySpeed === "sameday" ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#101010" }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>Selected areas only ✨</div>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Pickup points (only when pickup) */}
/*            {fulfillment === "pickup" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Pickup point</div>
                <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                  {PICKUP_POINTS.map((p) => {
                    const active = p.id === pickupPointId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPickupPointId(p.id)}
                        style={{
                          textAlign: "left",
                          borderRadius: 16,
                          padding: 12,
                          border: active ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                          background: active ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#101010" }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>{p.address}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {/* DELIVERY DETAILS (only if delivery) */}
/*          {fulfillment === "delivery" ? (
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
              <div style={{ fontWeight: 950, color: "#101010" }}>Delivery details</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Please double-check your address to avoid delivery delays.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Address</div>

                  <GoogleAddressInput
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
              </div>
            </section>
          ) : (
            // Pickup notes
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
              <div style={{ fontWeight: 950, color: "#101010" }}>Pickup notes (optional)</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Tell us anything we should know for pickup.
              </div>

              <label style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#101010" }}>Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ minHeight: 90, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", outline: "none", resize: "vertical" }}
                  placeholder="Pickup instructions…"
                />
              </label>
            </section>
          )}

          {/* ORDER SUMMARY */}
/*          <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff", boxShadow: "0 10px 26px rgba(0,0,0,0.04)" }}>
            <div style={{ fontWeight: 950, color: "#101010" }}>Your order 🤍</div>

            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              {cart.boxes.map((box, idx) => {
                const boxCount = (box.items || []).reduce((s, it) => s + (it.quantity || 0), 0);

                return (
                  <div key={idx} style={{ borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)", background: "#FAF7F2", padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontWeight: 900, color: "#101010" }}>
                        Box of {box.boxSize}{" "}
                        <span style={{ color: "#6B6B6B", fontWeight: 700 }}>({boxCount} cookies)</span>
                      </div>
                      <div style={{ fontWeight: 900, color: "#101010" }}>{formatIDR(box.total || 0)}</div>
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {(box.items || []).map((it, i2) => (
                        <div key={`${it.id}-${i2}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ color: "#101010", fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.name}{" "}
                            <span style={{ color: "#6B6B6B", fontWeight: 700 }}>×{it.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6B6B6B" }}>
                <div>Subtotal</div>
                <div>{formatIDR(subtotal)}</div>
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", color: "#6B6B6B" }}>
                <div>{fulfillment === "pickup" ? "Pickup" : "Delivery"}</div>
                <div>
                  {scheduleDate && scheduleTime ? `${scheduleDate} • ${scheduleTime}` : "Select schedule"}
                </div>
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