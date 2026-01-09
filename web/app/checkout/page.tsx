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

  address: string;
  notes: string;

  area_id: string;
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

const SUPPORT_WA = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "6281932181818";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@cookiedoh.co.id";

// ✅ EDIT THESE to your real bank/QRIS
const PAYMENT_INSTRUCTIONS = [
  "Manual Payment Instructions",
  "",
  "1) Transfer to:",
  "   BCA: 1234567890 a/n Cookie Doh (CHANGE THIS)",
  "   OR QRIS: (CHANGE THIS)",
  "",
  "2) Send proof of transfer to WhatsApp:",
  `   wa.me/6281932181818`,
  "",
  "3) We will confirm & process your order after payment is received.",
].join("\n");

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
        boxSizing: "border-box",
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
        boxSizing: "border-box",
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

function getComp(place: any, type: string): string {
  const comps = place?.address_components || [];
  for (const c of comps) {
    if (c?.types?.includes(type)) return c?.long_name || c?.short_name || "";
  }
  return "";
}

export default function CheckoutPage() {
  const router = useRouter();

  // ✅ Responsive
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const checkoutMode = process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans";
  const isManual = checkoutMode === "manual";

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

  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!shipping.area_label) return;
    if (!isJakarta && shipping.courier_preference !== "paxel") {
      setShipping((p) => ({ ...p, courier_preference: "paxel" }));
    }
  }, [isJakarta, shipping.area_label]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = addressInputRef.current;
    if (!el) return;
    if (el.value !== shipping.address) el.value = shipping.address;
  }, [shipping.address]);

  async function resolveBiteshipAreaFromPlace(place: any) {
    const admin2 = getComp(place, "administrative_area_level_2");
    const admin3 = getComp(place, "administrative_area_level_3");
    const admin4 = getComp(place, "administrative_area_level_4");
    const sub1 = getComp(place, "sublocality_level_1");
    const neighborhood = getComp(place, "neighborhood");
    const locality = getComp(place, "locality");

    const candidates = [
      [admin4, admin3, admin2].filter(Boolean).join(" "),
      [sub1, admin3, admin2].filter(Boolean).join(" "),
      [neighborhood, sub1, admin2].filter(Boolean).join(" "),
      [admin3, admin2].filter(Boolean).join(" "),
      [admin2 || locality].filter(Boolean).join(" "),
    ]
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);

    if (!candidates.length) throw new Error("Unable to derive area from address.");

    setAreaLoading(true);
    setAreaError(null);

    for (const q of candidates) {
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

        if (!results.length) continue;

        const r = results[0];
        const id = String(r?.id ?? r?.area_id ?? "");
        const joined = [r?.administrative_division_level_1, r?.administrative_division_level_2, r?.administrative_division_level_3]
          .filter(Boolean)
          .join(", ");
        const label = String(r?.name ?? r?.label ?? joined ?? id);

        if (id) {
          setShipping((p) => ({ ...p, area_id: id, area_label: label }));
          setAreaLoading(false);
          return;
        }
      } catch {}
    }

    setAreaLoading(false);
    throw new Error("Could not detect Kecamatan/Kelurahan. Please choose a more specific address.");
  }

  useEffect(() => {
    if (!mapsReady) return;
    if (!window.google?.maps?.places) return;
    if (!addressInputRef.current) return;
    if (autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: "id" },
      fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
    });

    ac.addListener("place_changed", async () => {
      const place = ac.getPlace?.();
      const formatted = place?.formatted_address ?? place?.name ?? "";
      const lat = place?.geometry?.location?.lat?.() ?? null;
      const lng = place?.geometry?.location?.lng?.() ?? null;
      const postal = getComp(place, "postal_code") || "";

      setShipping((prev) => ({
        ...prev,
        address: formatted,
        lat,
        lng,
        postal_code: postal,
        area_id: "",
        area_label: "",
      }));

      try {
        await resolveBiteshipAreaFromPlace(place);
      } catch (e: any) {
        setAreaError(e?.message ?? "Failed to detect area.");
      }
    });

    autocompleteRef.current = ac;
  }, [mapsReady]);

  function validateCore() {
    if (!midtransItems.length) return "Your cart is empty.";

    if (!shipping.receiver_name.trim()) return "Please fill receiver name.";
    if (!shipping.receiver_phone.trim()) return "Please fill phone number.";
    if (!shipping.receiver_email.trim()) return "Please fill email address.";

    if (!shipping.address.trim()) return "Please select an address from Google suggestions.";
    if (shipping.lat == null || shipping.lng == null) return "Please select an address from Google suggestions (pin required).";

    if (!shipping.postal_code.trim()) return "Postal code not detected. Please select a more specific address.";
    if (!shipping.area_id) return "Area not detected yet. Please wait a moment or select a more specific address.";
    if (areaLoading) return "Still detecting area… please wait.";

    return null;
  }

  async function handleManualOrder() {
    const err = validateCore();
    if (err) return alert(err);

    setLoading(true);
    try {
      const res = await fetch("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: shipping.receiver_name,
          customer_phone: shipping.receiver_phone,
          email: shipping.receiver_email,

          shipping_address: shipping.address,
          destination_area_id: shipping.area_id,
          destination_area_label: shipping.area_label,
          postal: shipping.postal_code,

          notes: shipping.notes,

          subtotal_idr: totals.subtotal,
          shipping_cost_idr: totals.shippingFee,
          total_idr: totals.total,

          courier_company: shipping.courier_preference,
          courier_type: shipping.courier_preference === "lalamove" ? "instant" : "next_day",

          items_json: midtransItems,
          customer_json: {
            receiver_name: shipping.receiver_name,
            receiver_phone: shipping.receiver_phone,
            receiver_email: shipping.receiver_email,
          },
          shipping_json: {
            destination_lat: shipping.lat,
            destination_lng: shipping.lng,
            destination_postal_code: shipping.postal_code,
            destination_area_id: shipping.area_id,
            courier_preference: shipping.courier_preference,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to place order");

      const orderId = String(data.order_id ?? "");
      router.push(`/checkout/pending?order_id=${encodeURIComponent(orderId)}`);
    } catch (e: any) {
      alert(e?.message ?? "Failed to place order");
    } finally {
      setLoading(false);
    }
  }

  async function handleMidtransPay() {
    const err = validateCore();
    if (err) return alert(err);

    if (!clientKey) return alert("Payment is not configured (missing client key).");
    if (!window.snap) return alert("Payment system is still loading. Please try again in a moment.";

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
      if (!res.ok) throw new Error(data?.error ? String(data.error) : `Token API failed (${res.status})`);

      const { token, order_id } = data as { token: string; order_id: string };

      window.snap!.pay(token, {
        onSuccess: () => router.push(`/checkout/success?order_id=${encodeURIComponent(order_id)}`),
        onPending: () => router.push(`/checkout/pending?order_id=${encodeURIComponent(order_id)}`),
        onError: () => router.push(`/checkout/failed?order_id=${encodeURIComponent(order_id)}`),
        onClose: () => {},
      });
    } catch (e: any) {
      alert(e?.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  const actionDisabled =
    loading ||
    midtransItems.length === 0 ||
    areaLoading ||
    (!isManual && (!snapReady || !clientKey));

  return (
    <>
      <Script src={snapSrc} data-client-key={clientKey} strategy="afterInteractive" onLoad={() => setSnapReady(true)} />

      {googleKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${googleKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
        />
      )}

      <main
        style={{
          padding: isMobile ? 14 : 24,
          maxWidth: 1080,
          margin: "0 auto",
          paddingBottom: isMobile ? 90 : 110,
          boxSizing: "border-box",
        }}
      >
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
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          >
            🔒 COOKIE DOH <span style={{ opacity: 0.65, fontWeight: 900 }}>Secure Checkout</span>
          </div>

          <h1 style={{ margin: "12px 0 6px", fontSize: isMobile ? 24 : 30, letterSpacing: -0.3 }}>Almost there</h1>
          <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.5, maxWidth: 760 }}>
            Select your address from Google suggestions. We auto-detect area + postal. Add notes if needed.
          </p>

          {isManual && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                padding: 12,
                borderRadius: 12,
                background: "rgba(0,0,0,0.02)",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 6 }}>Manual payment mode (temporary)</div>
              <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>{PAYMENT_INSTRUCTIONS}</div>
            </div>
          )}
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 360px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {/* Delivery + courier + items blocks unchanged from your version */}
            {/* ... your existing SectionCards remain the same ... */}
          </div>

          <aside
            style={{
              position: isMobile ? "static" : "sticky",
              top: isMobile ? undefined : 18,
              alignSelf: "start",
              display: "grid",
              gap: 12,
              minWidth: 0,
            }}
          >
            {/* Summary card unchanged */}
          </aside>
        </div>
      </main>
    </>
  );
}
