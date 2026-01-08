"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

type CourierPref = "lalamove" | "paxel";

type ShippingForm = {
  receiver_name: string;
  receiver_phone: string;
  receiver_email: string;

  address: string; // from Google autocomplete
  notes: string;

  area_id: string; // Biteship area id
  area_label: string;

  postal_code: string;

  lat: number | null;
  lng: number | null;

  courier_preference: CourierPref;
};

declare global {
  interface Window {
    google?: any;
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
    const parts = (box.items || []).map((x) => {
      const f = FLAVORS.find((ff) => ff.id === x.flavorId);
      const name = f?.name ?? x.flavorId;
      return `${name} x${x.qty}`;
    });
    const name = parts.length ? `Box of ${box.boxSize}: ${parts.join(", ")}` : `Box of ${box.boxSize}`;

    items.push({
      id: `box-${box.createdAt}`,
      name,
      price: Math.max(0, Math.round(Number(box.price) || 0)),
      quantity: 1,
    });
  }
  return items;
}

function isJakartaLabel(label: string) {
  const s = (label || "").toLowerCase();
  return s.includes("jakarta") || s.includes("dki");
}

function FieldLabel({ children }: { children: any }) {
  return <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>{children}</div>;
}

function InputBase(props: any) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: 12,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        outline: "none",
        background: "#fff",
        ...(props.style || {}),
      }}
    />
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <section
      style={{
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 18,
        background: "#fff",
        padding: 16,
      }}
    >
      <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <div style={{ fontWeight: 950, fontSize: 16 }}>{title}</div>
        {subtitle && <div style={{ color: "rgba(0,0,0,0.70)", fontSize: 13, lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

export default function CheckoutPage() {
  const router = useRouter();

  // Cart
  const [legacyCart, setLegacyCart] = useState<LegacyCartItem[]>([]);

  // Midtrans
  const [snapReady, setSnapReady] = useState(false);
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const isProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
  const snapSrc = isProduction ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js";

  // Google Places
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [mapsReady, setMapsReady] = useState(false);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);

  // Biteship area search
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<any[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);

  // Form
  const [shipping, setShipping] = useState<ShippingForm>({
    receiver_name: "",
    receiver_phone: "",
    receiver_email: "",
    address: "",
    notes: "",
    area_id: "",
    area_label: "",
    postal_code: "",
    lat: null,
    lng: null,
    courier_preference: "lalamove",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(CART_KEY);
    setLegacyCart(safeParseCart(raw));
  }, []);

  const midtransItems = useMemo(() => legacyCartToMidtransItems(legacyCart), [legacyCart]);

  const totals = useMemo(() => {
    const subtotal = midtransItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const boxes = midtransItems.reduce((sum, it) => sum + it.quantity, 0);
    const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 20000; // placeholder
    const total = subtotal + shippingFee;
    return { subtotal, shippingFee, total, boxes };
  }, [midtransItems]);

  const isJakarta = useMemo(() => isJakartaLabel(shipping.area_label), [shipping.area_label]);

  // Force Paxel outside Jakarta
  useEffect(() => {
    if (!shipping.area_label) return;
    if (!isJakarta && shipping.courier_preference !== "paxel") {
      setShipping((p) => ({ ...p, courier_preference: "paxel" }));
    }
  }, [isJakarta, shipping.area_label]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init Google autocomplete
  useEffect(() => {
    if (!mapsReady) return;
    if (!window.google?.maps?.places) return;
    if (!addressInputRef.current) return;
    if (autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: "id" },
      fields: ["formatted_address", "geometry", "address_components"],
      types: ["address"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace?.();
      const formatted = place?.formatted_address ?? "";
      const lat = place?.geometry?.location?.lat?.() ?? null;
      const lng = place?.geometry?.location?.lng?.() ?? null;

      let postal = "";
      const comps = place?.address_components || [];
      for (const c of comps) {
        if (c?.types?.includes("postal_code")) postal = c?.long_name ?? "";
      }

      setShipping((prev) => ({
        ...prev,
        address: formatted,
        lat,
        lng,
        postal_code: prev.postal_code || postal,
      }));
    });

    autocompleteRef.current = ac;
  }, [mapsReady]);

  // Debounced Biteship area search
  useEffect(() => {
    const q = areaQuery.trim();
    if (q.length < 3) {
      setAreaResults([]);
      return;
    }

    const t = window.setTimeout(async () => {
      setAreaLoading(true);
      try {
        const res = await fetch(`/api/biteship/areas?input=${encodeURIComponent(q)}`);
        const data = await res.json();

        const results: any[] = Array.isArray(data?.areas)
          ? data.areas
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        setAreaResults(results);
      } catch {
        setAreaResults([]);
      } finally {
        setAreaLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(t);
  }, [areaQuery]);

  function validateBeforePay() {
    if (!midtransItems.length) return "Your cart is empty.";
    if (!clientKey) return "Payment is not configured (missing client key).";
    if (!window.snap) return "Payment system is still loading. Please try again in a moment.";

    if (!shipping.receiver_name.trim()) return "Please fill receiver name.";
    if (!shipping.receiver_phone.trim()) return "Please fill phone number.";
    if (!shipping.receiver_email.trim()) return "Please fill email address.";

    if (!shipping.address.trim()) return "Please pick an exact address from Google suggestions.";
    if (!shipping.area_id) return "Please select Kecamatan/Kelurahan from the dropdown.";
    if (shipping.lat == null || shipping.lng == null) return "Please pick an address from suggestions (pin required).";

    return null;
  }

  async function handlePay() {
    const err = validateBeforePay();
    if (err) {
      alert(err);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/midtrans/snap-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: midtransItems,
          customer: {
            first_name: shipping.receiver_name,
            last_name: "",
            email: shipping.receiver_email,
            phone: shipping.receiver_phone,
          },
          shipping: {
            address: shipping.address,
            notes: shipping.notes,
            destination_area_id: shipping.area_id,
            destination_area_label: shipping.area_label,
            destination_postal_code: shipping.postal_code,
            destination_lat: shipping.lat,
            destination_lng: shipping.lng,
            courier_preference: shipping.courier_preference,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Token API failed (${res.status})`;
        throw new Error(msg);
      }

      const { token, order_id } = data as { token: string; order_id: string };

      window.snap!.pay(token, {
        onSuccess: () => router.push(`/checkout/success?order_id=${encodeURIComponent(order_id)}`),
        onPending: () => router.push(`/checkout/pending?order_id=${encodeURIComponent(order_id)}`),
        onError: () => router.push(`/checkout/failed?order_id=${encodeURIComponent(order_id)}`),
        onClose: () => {},
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
      {/* Midtrans Snap */}
      <Script src={snapSrc} data-client-key={clientKey} strategy="afterInteractive" onLoad={() => setSnapReady(true)} />

      {/* Google Places */}
      {googleKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
        />
      )}

      <main style={{ padding: 24, maxWidth: 1080, margin: "0 auto", paddingBottom: 110 }}>
        <header style={{ marginBottom: 14 }}>
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
            🔒 COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Secure Checkout</span>
          </div>

          <h1 style={{ margin: "12px 0 6px", fontSize: 30, letterSpacing: -0.3 }}>Almost there</h1>
          <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.5, maxWidth: 760 }}>
            Fill in delivery details, choose your courier, then pay securely.
          </p>

          {!googleKey && (
            <div style={{ marginTop: 12, border: "1px solid #f3c", padding: 12, borderRadius: 12 }}>
              <strong>Missing env:</strong> NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </div>
          )}
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
          {/* Left column */}
          <div style={{ display: "grid", gap: 16 }}>
            <SectionCard
              title="Delivery details"
              subtitle="Use Google suggestions for exact address. Then select Kecamatan/Kelurahan for shipping accuracy."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Receiver name</FieldLabel>
                  <InputBase
                    value={shipping.receiver_name}
                    onChange={(e: any) => setShipping((p) => ({ ...p, receiver_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <FieldLabel>Phone</FieldLabel>
                    <InputBase
                      value={shipping.receiver_phone}
                      onChange={(e: any) => setShipping((p) => ({ ...p, receiver_phone: e.target.value }))}
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <FieldLabel>Email</FieldLabel>
                    <InputBase
                      value={shipping.receiver_email}
                      onChange={(e: any) => setShipping((p) => ({ ...p, receiver_email: e.target.value }))}
                      placeholder="you@email.com"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Exact address (Google suggestions)</FieldLabel>
                  <InputBase
                    ref={addressInputRef}
                    value={shipping.address}
                    onChange={(e: any) => setShipping((p) => ({ ...p, address: e.target.value }))}
                    placeholder={mapsReady ? "Type your address…" : "Loading Google…"}
                  />
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    Pin: {shipping.lat ?? "—"}, {shipping.lng ?? "—"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Kecamatan / Kelurahan (auto)</FieldLabel>
                  <InputBase
                    value={areaQuery}
                    onChange={(e: any) => setAreaQuery(e.target.value)}
                    placeholder="Type: Kemang / Bangka / Mampang Prapatan / etc"
                  />

                  {areaLoading && <div style={{ fontSize: 12, opacity: 0.7 }}>Searching…</div>}

                  {!!areaResults.length && (
                    <div style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 14, overflow: "hidden" }}>
                      {areaResults.slice(0, 8).map((r: any, idx: number) => {
                        const id = String(r?.id ?? r?.area_id ?? "");
                        const joined = [
                          r?.administrative_division_level_1,
                          r?.administrative_division_level_2,
                          r?.administrative_division_level_3,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        const label = String(r?.name ?? r?.label ?? joined ?? id);

                        return (
                          <button
                            key={`${id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setShipping((p) => ({ ...p, area_id: id, area_label: label }));
                              setAreaResults([]);
                              setAreaQuery(label);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              border: "none",
                              background: idx % 2 === 0 ? "rgba(0,0,0,0.02)" : "#fff",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 13 }}>{label}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {shipping.area_id && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Selected: <strong>{shipping.area_label}</strong>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <FieldLabel>Postal code (optional)</FieldLabel>
                    <InputBase
                      value={shipping.postal_code}
                      onChange={(e: any) => setShipping((p) => ({ ...p, postal_code: e.target.value }))}
                      placeholder="12730"
                    />
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <FieldLabel>Notes (optional)</FieldLabel>
                    <InputBase
                      value={shipping.notes}
                      onChange={(e: any) => setShipping((p) => ({ ...p, notes: e.target.value }))}
                      placeholder="Tower / unit / patokan / satpam / etc"
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Courier"
              subtitle="Jakarta: choose Lalamove or Paxel. Outside Jakarta: Paxel only."
            >
              {!shipping.area_label ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Select Kecamatan/Kelurahan first to unlock courier options.
                </div>
              ) : isJakarta ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="courier"
                      checked={shipping.courier_preference === "lalamove"}
                      onChange={() => setShipping((p) => ({ ...p, courier_preference: "lalamove" }))}
                    />
                    <div>
                      <div style={{ fontWeight: 950 }}>Lalamove</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Instant courier (Jakarta)</div>
                    </div>
                  </label>

                  <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="courier"
                      checked={shipping.courier_preference === "paxel"}
                      onChange={() => setShipping((p) => ({ ...p, courier_preference: "paxel" }))}
                    />
                    <div>
                      <div style={{ fontWeight: 950 }}>Paxel</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Jakarta delivery</div>
                    </div>
                  </label>

                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Detected: <strong>Jakarta</strong>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 950 }}>Paxel only</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Detected: <strong>Outside Jakarta</strong> — Paxel is enforced automatically.
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Your items" subtitle="Review your boxes before paying.">
              {midtransItems.length === 0 ? (
                <div style={{ opacity: 0.75 }}>
                  Your cart is empty.{" "}
                  <Link href="/build/6" style={{ textDecoration: "underline", color: "inherit" }}>
                    Build a box
                  </Link>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {midtransItems.map((it) => (
                    <div
                      key={it.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: "rgba(0,0,0,0.03)",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{it.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {formatIDR(it.price)} × {it.quantity}
                        </div>
                      </div>
                      <div style={{ fontWeight: 950, whiteSpace: "nowrap" }}>{formatIDR(it.price * it.quantity)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => router.push("/cart")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "rgba(0,0,0,0.02)",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  ← Back to cart
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Right column summary */}
          <aside
            style={{
              position: "sticky",
              top: 18,
              alignSelf: "start",
              display: "grid",
              gap: 12,
            }}
          >
            <SectionCard
              title="Summary"
              subtitle="Secure payment powered by Midtrans. You’ll see a payment popup."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.75 }}>Boxes</span>
                  <strong>{totals.boxes}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.75 }}>Subtotal</span>
                  <strong>{formatIDR(totals.subtotal)}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.75 }}>Shipping</span>
                  <strong>{totals.shippingFee === 0 ? "Free" : formatIDR(totals.shippingFee)}</strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: 10,
                    borderTop: "1px solid rgba(0,0,0,0.10)",
                  }}
                >
                  <span style={{ fontWeight: 950 }}>Total</span>
                  <span style={{ fontWeight: 1000 }}>{formatIDR(totals.total)}</span>
                </div>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Payment popup: <strong>{snapReady ? "Ready ✅" : "Loading…"}</strong>
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
                    background: "var(--brand-blue)",
                    color: "#fff",
                    fontWeight: 1000,
                    cursor: loading ? "wait" : "pointer",
                    opacity: loading || !snapReady || !clientKey || midtransItems.length === 0 ? 0.6 : 1,
                  }}
                >
                  {loading ? "Processing…" : "Pay securely"}
                </button>

                <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>
                  By paying, you confirm your delivery details are correct.
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Need help?" subtitle="We’ll reply fast on WhatsApp.">
              <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
                If you’re unsure about address details or courier choice, message us before paying.
              </div>
            </SectionCard>
          </aside>
        </div>
      </main>
    </>
  );
}
