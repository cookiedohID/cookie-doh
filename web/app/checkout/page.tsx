// web/app/checkout/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GoogleAddressInput from "@/components/GoogleAddressInput";
import { clearCart, getCart, CART_KEY } from "@/lib/cart";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        opts?: {
          onSuccess?: (result: any) => void;
          onPending?: (result: any) => void;
          onError?: (result: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

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

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Clear cart storage AFTER successful payment success
function clearCartStorage() {
  try {
    clearCart();

    // legacy cleanup
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem("cart");
    localStorage.removeItem("cookie_doh_cart");
    localStorage.removeItem("cookie_doh_cart_v0");
    localStorage.removeItem("cart_items");
    localStorage.removeItem("cookieDohCart");
  } catch {}
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

  if (!normalized)
    return { ok: false, normalized: "", message: "Please add your WhatsApp number." };

  // Must be an Indonesian mobile number: starts with 08 or +628
  // (both normalize to +628…).
  if (!normalized.startsWith("+628")) {
    return {
      ok: false,
      normalized,
      message: "Number must start with 08 or +628.",
    };
  }

  // Local form 08XXXXXXXX — require at least 10 digits.
  const localDigits = ("0" + normalized.slice(3)).replace(/\D/g, "");
  if (localDigits.length < 10) {
    return {
      ok: false,
      normalized,
      message: "Number is too short — at least 10 digits (e.g. 0812xxxxxxx).",
    };
  }
  if (localDigits.length > 14) {
    return { ok: false, normalized, message: "Number looks too long." };
  }

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

/** Jakarta YYYY-MM-DD */
function jakartaTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

/** Jakarta minutes now */
function jakartaMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value || "0");
  return hh * 60 + mm;
}

function fmtTimeHm(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// --- Scheduling helpers ---
function yyyyMmDdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


const BLOCKED_DATES = new Set([
  // Holidays / closed production days
  "2026-05-21",
]);

function nextDays(n: number) {
  const out: { value: string; label: string }[] = [];
  const today = new Date();

  // D+1 only (tomorrow onwards)
  let offset = 1;

  while (out.length < n) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);

    const val = yyyyMmDdLocal(d);

    // Hide blocked dates
    if (!BLOCKED_DATES.has(val)) {
      const label = d.toLocaleDateString("en-GB", {
        timeZone: "Asia/Jakarta",
        weekday: "short",
        day: "2-digit",
        month: "short",
      });

      out.push({ value: val, label });
    }

    offset++;
  }

  return out;
}

const INSTANT_SLOTS = [
  { value: "10:00-15:00", label: "10:00 – 15:00", endMin: 15 * 60 },
  { value: "15:00-18:00", label: "15:00 – 18:00", endMin: 18 * 60 },
] as const;

const SAMEDAY_SLOT = { value: "08:00-22:00", label: "08:00 – 22:00" } as const;

// Same-day (Lalamove) covers ~Greater Jakarta + Bekasi; beyond this we switch to
// intercity (Biteship next-day couriers).
const JKT_LAT = -6.2;
const JKT_LNG = 106.83;
const SAMEDAY_RADIUS_KM = 90;
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

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
  const router = useRouter();

  const [cart, setCart] = useState<CartState>({ boxes: [] });
  const [booting, setBooting] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Basic form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  // Loyalty rewards available to a logged-in member, + their redemption picks.
  const [availFreeCookies, setAvailFreeCookies] = useState(0);
  const [availFreeDrinks, setAvailFreeDrinks] = useState(0);
  const [redeemCookieId, setRedeemCookieId] = useState("");
  const [redeemCookieQty, setRedeemCookieQty] = useState(0);
  const [redeemDrinkId, setRedeemDrinkId] = useState("");
  const [redeemDrinkQty, setRedeemDrinkQty] = useState(0);

  // Gift: send with a handwritten card.
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftTo, setGiftTo] = useState("");
  const [giftFrom, setGiftFrom] = useState("");

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

  // Saved addresses (members only) — purely a convenience picker that fills the
  // fields below. The order payload is unchanged.
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [pickedAddressId, setPickedAddressId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let hydrated = false;
    const supabase = getSupabaseBrowser();

    async function hydrate(token: string) {
      if (hydrated || cancelled) return;
      hydrated = true;
      const auth = { Authorization: `Bearer ${token}` };

      // Pre-fill the member's name + phone (only if still empty, so typed input
      // wins). Independent of the address fetch so one can't block the other.
      try {
        const meRes = await fetch("/api/account/me", { headers: auth, cache: "no-store" });
        const meJ = await meRes.json().catch(() => ({}));
        if (!cancelled && meJ?.member) {
          if (meJ.member.name) setName((cur) => cur || meJ.member.name);
          if (meJ.member.phone) setPhone((cur) => cur || meJ.member.phone);
          if (meJ.member.loyalty) {
            setAvailFreeCookies(Math.max(0, Number(meJ.member.loyalty.freeCookies || 0)));
            setAvailFreeDrinks(Math.max(0, Number(meJ.member.loyalty.freeDrinks || 0)));
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch("/api/account/addresses", { headers: auth, cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!cancelled && j?.ok && Array.isArray(j.addresses)) setSavedAddresses(j.addresses);
      } catch { /* ignore */ }
    }

    // Try immediately, and again when auth state resolves (handles the case where
    // the session isn't hydrated the instant this effect first runs).
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token;
      if (t) hydrate(t);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const t = session?.access_token;
      if (t) hydrate(t);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  function applySavedAddress(a: any) {
    setPickedAddressId(a.id);
    setAddressBase(String(a.address || ""));
    setAddressLat(typeof a.lat === "number" ? a.lat : null);
    setAddressLng(typeof a.lng === "number" ? a.lng : null);
    setAddressResolved(a.lat != null && a.lng != null);
    setAddressTouched(false);
    if (a.building_name) setBuildingName(String(a.building_name));
    if (a.postal) setPostalCode(String(a.postal));
  }

  // Fulfillment
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>("sameday");

  // Schedule
  const dateOptions = useMemo(() => nextDays(30), []);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");

  // Pickup points
  const pickupPoints = useMemo(
    () => parsePickupPoints(process.env.NEXT_PUBLIC_PICKUP_POINTS_JSON),
    []
  );
  const [pickupPointId, setPickupPointId] = useState<string>(() => pickupPoints[0]?.id || "");

  // Shipping quote
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<any>(null);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<Date | null>(null);

  // Delivery mode: same-day (Lalamove, Greater Jakarta+Bekasi) vs intercity
  // (Biteship next-day couriers). 'unavailable' = Biteship can't reach the address.
  const [deliveryMode, setDeliveryMode] = useState<"sameday" | "intercity" | "unavailable" | null>(null);
  const [intercityRates, setIntercityRates] = useState<any[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<any>(null);

  const quoteAbortRef = useRef<AbortController | null>(null);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // Reserve space for the sticky bottom "Place order" bar so the floating
  // WhatsApp button clears it (see WhatsAppButton + globals.css --cd-bottombar-h).
  useEffect(() => {
    document.documentElement.style.setProperty("--cd-bottombar-h", "92px");
    return () => {
      document.documentElement.style.removeProperty("--cd-bottombar-h");
    };
  }, []);

  useEffect(() => {
    const c = getCart() as any;
    const next: CartState = c && Array.isArray(c.boxes) ? c : { boxes: [] };
    setCart(next);

    const empty = !next.boxes || next.boxes.length === 0;
    if (empty) {
      router.replace("/build");
      return;
    }

    setBooting(false);
  }, [router]);

  const subtotal = useMemo(
    () => cart.boxes.reduce((s, b) => s + (b.total || 0), 0),
    [cart]
  );
  const isEmpty = cart.boxes.length === 0;

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
    fulfillment === "delivery" && addressTouched && (!addressBase.trim() || !addressResolved)
      ? "Please select a valid address from the suggestions."
      : "";

  // ✅ Jakarta-based slot rules
  const todayJakarta = useMemo(() => jakartaTodayYMD(), []);
  const nowMinJakarta = useMemo(() => jakartaMinutesNow(), [scheduleDate, deliverySpeed]);
  const isScheduleTodayJakarta = !!scheduleDate && scheduleDate === todayJakarta;

  // ✅ Same-day disabled ONLY if scheduleDate is today AND after 12:00
  const samedayDisabled = false;

  // ✅ Instant slots filtered for today only
  const instantSlotOptions = useMemo(() => {
    if (!isScheduleTodayJakarta)
      return INSTANT_SLOTS.map((s) => ({ value: s.value, label: s.label }));
    return INSTANT_SLOTS.filter((s) => nowMinJakarta < s.endMin).map((s) => ({
      value: s.value,
      label: s.label,
    }));
  }, [isScheduleTodayJakarta, nowMinJakarta]);

  const noSlotsLeftToday = false;


  const scheduleError =
    scheduleTouched && (!scheduleDate || !scheduleTime)
      ? "Please choose date and time."
      : noSlotsLeftToday
      ? "No delivery slots left for today. Please choose another date."
      : "";

  // Quote function
  const canQuote =
    fulfillment === "delivery" && addressResolved && addressLat !== null && addressLng !== null;

  const fetchQuote = async (opts?: { manual?: boolean }) => {
    if (fulfillment !== "delivery") return;
    if (!addressResolved || addressLat === null || addressLng === null) return;

    quoteAbortRef.current?.abort();
    const ac = new AbortController();
    quoteAbortRef.current = ac;

    setShippingLoading(true);
    setShippingError(null);

    const distKm = haversineKm(addressLat, addressLng, JKT_LAT, JKT_LNG);

    // ---- Same-day zone (Greater Jakarta + Bekasi): Lalamove. Unchanged behaviour. ----
    if (distKm <= SAMEDAY_RADIUS_KM) {
      setDeliveryMode("sameday");
      setIntercityRates([]);
      setSelectedCourier(null);
      try {
        const res = await fetch("/api/shipping/lalamove/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({ lat: addressLat, lng: addressLng, speed: deliverySpeed }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to calculate delivery fee");
        const price = Number(j?.price);
        if (!Number.isFinite(price)) throw new Error("Invalid quote price");
        setShippingCost(ceilToThousand(price));
        setQuoteMeta(j);
        setQuoteUpdatedAt(j?.quoteAt ? new Date(String(j.quoteAt)) : new Date());
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setShippingCost(null); setQuoteMeta(null); setQuoteUpdatedAt(null);
        setShippingError(e?.message || "Unable to calculate delivery fee");
      } finally {
        setShippingLoading(false);
      }
      return;
    }

    // ---- Intercity zone: Biteship next-day couriers, quoted by postal code. ----
    setDeliveryMode("intercity");
    setQuoteMeta(null);
    setQuoteUpdatedAt(null);
    const pc = String(postalCode || "").trim();
    if (!/^\d{5}$/.test(pc)) {
      setIntercityRates([]); setSelectedCourier(null); setShippingCost(null);
      setShippingError("Enter your 5-digit postal code for intercity delivery.");
      setShippingLoading(false);
      return;
    }
    try {
      const totalUnits = Array.isArray((cart as any)?.boxes)
        ? (cart as any).boxes.reduce((s: number, b: any) => s + (b.items || []).reduce((ss: number, it: any) => ss + (it.quantity || 0), 0), 0)
        : 0;
      const weight = Math.max(500, totalUnits * 180 + 200);
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ destination_postal_code: Number(pc), value: 180000, weight }),
      });
      const j = await res.json().catch(() => ({}));
      const rawRates: any[] = Array.isArray(j?.data?.pricing) ? j.data.pricing : [];
      // Only keep options with a real numeric price (guards against a NaN total).
      const rates = rawRates.filter((x) => Number.isFinite(Number(x?.price)));
      if (!res.ok || rates.length === 0) {
        setDeliveryMode("unavailable");
        setIntercityRates([]); setSelectedCourier(null); setShippingCost(null);
        setShippingError("Sorry — we can't ship to this address yet. Try pickup or a closer address.");
        return;
      }
      const sorted = rates.slice().sort((a, b) => Number(a.price) - Number(b.price));
      setIntercityRates(sorted);
      setSelectedCourier(sorted[0]);
      setShippingCost(Number(sorted[0].price));
      setShippingError(null);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setIntercityRates([]); setSelectedCourier(null); setShippingCost(null);
      setShippingError("Couldn't load delivery options — please try again.");
    } finally {
      setShippingLoading(false);
    }
  };

  // Auto re-quote on address/speed/postal change (debounced)
  useEffect(() => {
    if (fulfillment !== "delivery") {
      setShippingCost(0);
      setShippingError(null);
      setShippingLoading(false);
      setQuoteMeta(null);
      setQuoteUpdatedAt(null);
      setDeliveryMode(null);
      setIntercityRates([]);
      setSelectedCourier(null);
      return;
    }
    if (!canQuote) return;

    const t = setTimeout(() => {
      fetchQuote({ manual: false });
    }, 450);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, deliverySpeed, addressResolved, addressLat, addressLng, postalCode]);

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
      if (deliveryMode === "unavailable")
        return "Sorry, we can't ship to this address. Please choose pickup or a closer address.";
      if (deliveryMode === "intercity" && !selectedCourier)
        return "Please choose a courier for intercity delivery.";
      if (shippingCost == null)
        return "Delivery fee unavailable. Please recalculate delivery fee.";
      if (deliveryMode !== "intercity" && noSlotsLeftToday)
        return "No delivery slots left for today. Please choose another date.";
    }

    if (!scheduleDate || !scheduleTime)
      return "Please choose delivery/pickup date and time.";
    if (fulfillment === "pickup" && !pickupPointId) return "Please choose a pickup point.";

    return null;
  };

  const placeOrder = async () => {
    setErr(null);
    setPhoneTouched(true);
    setAddressTouched(true);
    setScheduleTouched(true);

    const v = validate();
    if (v) return setErr(v);
    if (isEmpty) return setErr("Your cart is empty. Please build a box first.");

    // Midtrans Snap popup must exist
    if (
      (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase() === "midtrans" &&
      (!window.snap || typeof window.snap.pay !== "function")
    ) {
      return setErr(
        "Payment system is still loading. Please refresh the page and try again."
      );
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
          type: fulfillment,
          scheduleDate,
          scheduleTime,
          deliverySpeed: fulfillment === "delivery" ? "sameday" : null,
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

        // Intercity courier (Biteship). Null for same-day/pickup.
        courier_company: deliveryMode === "intercity" && selectedCourier ? selectedCourier.courier_code : null,
        courier_type: deliveryMode === "intercity" && selectedCourier ? selectedCourier.courier_service_code : null,
        courier_service: deliveryMode === "intercity" && selectedCourier ? selectedCourier.courier_service_name : null,

        notes,
        gift: isGift ? { message: giftMessage.trim(), to: giftTo.trim(), from: giftFrom.trim() } : null,
        redeem: [
          redeemCookieId && redeemCookieQty > 0 ? { id: redeemCookieId, name: FLAVORS.find((f: any) => f.id === redeemCookieId)?.name || "Cookie", kind: "cookie", quantity: Math.min(redeemCookieQty, availFreeCookies) } : null,
          redeemDrinkId && redeemDrinkQty > 0 ? { id: redeemDrinkId, name: SMOOTHIES.find((s: any) => s.id === redeemDrinkId)?.name || "Drink", kind: "drink", quantity: Math.min(redeemDrinkQty, availFreeDrinks) } : null,
        ].filter(Boolean),
        cart,
        shipping_cost_idr: fulfillment === "delivery" ? shippingCost : 0,
        total: grandTotal,
        meta: {
          quote: quoteMeta,
          delivery_mode: fulfillment === "delivery" ? deliveryMode : null,
          courier: deliveryMode === "intercity" ? selectedCourier : null,
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
          body
            ? `Checkout failed (HTTP ${res.status}). ${body}`
            : `Checkout failed (HTTP ${res.status}).`
        );
      }

      const data = await res.json().catch(() => ({} as any));

      // ✅ Midtrans POPUP flow
      if (data?.mode === "midtrans" && data?.snap_token) {
        const token = String(data.snap_token);

        // These are returned by your /api/checkout
        const dbOrderId = String(data.order_id || "");
        const orderNo = String(data.order_no || "");
        const midtransOrderId = String(data.midtrans_order_id || "");

        const buildItemsTextFromCart = () => {
        try {
          const lines: string[] = [];
          for (const b of (cart?.boxes || [])) {
            for (const it of (b.items || [])) {
              const name = String(it?.name || "").trim();
              const qty = Number(it?.quantity || 0);
              if (!name || !Number.isFinite(qty) || qty <= 0) continue;
              lines.push(`• ${name} ×${qty}`);
            }
          }
          return lines.length ? lines.join("\n") : "";
        } catch {
          return "";
        }
      };


        window.snap?.pay(token, {
          
       onSuccess: (result: any) => {
        const itemsText = buildItemsTextFromCart();
        if (itemsText) (result as any).__items_text = itemsText;

        router.push(`/checkout/success?order_id=${dbOrderId}`);

      },




          onPending: () => {
            setErr("Payment is pending. Please complete the payment, then refresh this page.");
          },

          onError: (result: any) => {
            setErr(result?.status_message || "Payment failed. Please try again.");
          },
          onClose: () => {
            setErr("Payment popup was closed.");
          },
        });

        return; // ⛔ stop here
      }


      // ✅ Manual / redirect fallback
      const redirectUrl = data?.redirect_url || data?.redirectUrl;
      if (!redirectUrl) {
        throw new Error(
          `Checkout succeeded but missing payment response. Server response: ${JSON.stringify(data)}`
        );
      }

      throw new Error("Manual redirect is disabled. Please try again.");

    } catch (e: any) {
      setErr(e?.message || "Something went wrong — let’s try again.");
    } finally {
      setLoading(false);
    }
  };

  const shownLabel = useMemo(() => {
    if (fulfillment !== "delivery") return null;
    const apiLabel = typeof quoteMeta?.liveQuoteLabel === "string" ? quoteMeta.liveQuoteLabel : null;
    if (apiLabel) return apiLabel;

    const provider = quoteMeta?.provider ? String(quoteMeta.provider).toUpperCase() : "LALAMOVE";
    const speed = deliverySpeed === "instant" ? "Instant" : "Same-day";
    const svc = quoteMeta?.serviceType ? ` • ${String(quoteMeta.serviceType)}` : "";
    return `Live quote (${provider}) • ${speed}${svc}`;
  }, [fulfillment, quoteMeta, deliverySpeed]);

  if (booting) {
    return (
      <main style={{ minHeight: "100vh", background: "#fff" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px" }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Checkout</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>Checking your cart…</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px 120px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Checkout</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>You’re almost there 🤍</p>
        </header>

        <div style={{ display: "grid", gap: 14 }}>
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
            <div style={{ fontWeight: 950, color: COLORS.black }}>Contact details</div>
            <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
              We’ll use this to update you about your order.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={sameStyle}
                  placeholder="Your name"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>
                  WhatsApp number
                </span>
                <input
                  value={phone}
                  onChange={(e) => {
                    // Allow digits and a single leading "+" (for +628…).
                    let v = e.target.value.replace(/[^\d+]/g, "");
                    v = v.replace(/(?!^)\+/g, "");
                    setPhone(v);
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  inputMode="tel"
                  style={sameStyle}
                  placeholder="08xx or +628xx"
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

          {/* Loyalty rewards (members only) */}
          {(availFreeCookies > 0 || availFreeDrinks > 0) ? (
            <section
              style={{
                borderRadius: 18,
                border: (redeemCookieQty > 0 || redeemDrinkQty > 0) ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                padding: 14,
                background: "#fff",
                boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontWeight: 950, color: COLORS.black }}>🎁 Your free rewards</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                You have {availFreeCookies} free cookie{availFreeCookies !== 1 ? "s" : ""} and {availFreeDrinks} free drink{availFreeDrinks !== 1 ? "s" : ""}. Add them to this order at no charge.
              </div>

              {availFreeCookies > 0 ? (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Free cookie flavour</span>
                    <select value={redeemCookieId} onChange={(e) => { setRedeemCookieId(e.target.value); if (e.target.value && redeemCookieQty === 0) setRedeemCookieQty(1); if (!e.target.value) setRedeemCookieQty(0); }} style={sameStyle}>
                      <option value="">Don&apos;t use</option>
                      {FLAVORS.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Qty (max {availFreeCookies})</span>
                    <input type="number" min={0} max={availFreeCookies} value={redeemCookieQty} disabled={!redeemCookieId}
                      onChange={(e) => setRedeemCookieQty(Math.max(0, Math.min(availFreeCookies, Math.floor(Number(e.target.value) || 0))))} style={sameStyle} />
                  </label>
                </div>
              ) : null}

              {availFreeDrinks > 0 ? (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Free drink flavour</span>
                    <select value={redeemDrinkId} onChange={(e) => { setRedeemDrinkId(e.target.value); if (e.target.value && redeemDrinkQty === 0) setRedeemDrinkQty(1); if (!e.target.value) setRedeemDrinkQty(0); }} style={sameStyle}>
                      <option value="">Don&apos;t use</option>
                      {SMOOTHIES.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Qty (max {availFreeDrinks})</span>
                    <input type="number" min={0} max={availFreeDrinks} value={redeemDrinkQty} disabled={!redeemDrinkId}
                      onChange={(e) => setRedeemDrinkQty(Math.max(0, Math.min(availFreeDrinks, Math.floor(Number(e.target.value) || 0))))} style={sameStyle} />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Gift */}
          <section
            style={{
              borderRadius: 18,
              border: isGift ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
              <span>
                <span style={{ fontWeight: 950, color: COLORS.black }}>🎁 Send as a gift</span>
                <span style={{ display: "block", marginTop: 4, color: "#6B6B6B", fontSize: 13 }}>We&apos;ll include a handwritten card and leave prices off the box.</span>
              </span>
              <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} style={{ width: 22, height: 22, flex: "0 0 auto", cursor: "pointer" }} />
            </label>

            {isGift ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>To</span>
                    <input value={giftTo} onChange={(e) => setGiftTo(e.target.value)} style={sameStyle} placeholder="Recipient's name" />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>From</span>
                    <input value={giftFrom} onChange={(e) => setGiftFrom(e.target.value)} style={sameStyle} placeholder="Your name" />
                  </label>
                </div>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Card message</span>
                  <textarea
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value.slice(0, 300))}
                    maxLength={300}
                    style={{ minHeight: 90, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", padding: "10px 12px", outline: "none", resize: "vertical" }}
                    placeholder="Write your message — we'll handwrite it on the card 🤍"
                  />
                  <span style={{ fontSize: 11, color: "#6B6B6B", textAlign: "right" }}>{giftMessage.length}/300</span>
                </label>
              </div>
            ) : null}
          </section>

          {/* Fulfillment */}
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, color: COLORS.black }}>Fulfillment</div>
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
                  border:
                    fulfillment === "delivery"
                      ? `2px solid ${COLORS.blue}`
                      : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "delivery" ? "rgba(0,20,167,0.06)" : COLORS.sand,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: COLORS.black }}>Delivery</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                  We deliver to your address
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment("pickup")}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border:
                    fulfillment === "pickup"
                      ? `2px solid ${COLORS.blue}`
                      : "1px solid rgba(0,0,0,0.10)",
                  background: fulfillment === "pickup" ? "rgba(0,20,167,0.06)" : COLORS.sand,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 900, color: COLORS.black }}>Pickup</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                  Collect at our pickup point
                </div>
              </button>
            </div>

            {fulfillment === "delivery" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Delivery type</div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>

                  <button
                    type="button"
                    onClick={() => !samedayDisabled && setDeliverySpeed("sameday")}
                    disabled={samedayDisabled}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border:
                        deliverySpeed === "sameday"
                          ? `2px solid ${COLORS.blue}`
                          : "1px solid rgba(0,0,0,0.10)",
                      background: deliverySpeed === "sameday" ? "rgba(0,20,167,0.06)" : COLORS.sand,
                      cursor: samedayDisabled ? "not-allowed" : "pointer",
                      opacity: samedayDisabled ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: COLORS.black }}>Same-day</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                      08:00 – 22:00 
                    </div>
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "#6B6B6B", fontWeight: 700 }}>
                  Earliest delivery is tomorrow. Closed dates are automatically hidden.
                </div>
              </div>
            ) : null}

            {/* Schedule */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>
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
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>
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
                    {instantSlotOptions.map((t) => (
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
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Pickup point</div>

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
                            border: active ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                            background: active ? "rgba(0,20,167,0.06)" : COLORS.sand,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: COLORS.black }}>{p.name}</div>
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
            <section
              style={{
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: 14,
                background: "#fff",
                boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontWeight: 950, color: COLORS.black }}>Delivery details</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Please double-check your address to avoid delivery delays.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Address</div>

                  {savedAddresses.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      {savedAddresses.map((a) => {
                        const active = pickedAddressId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => applySavedAddress(a)}
                            style={{
                              border: active ? `1.5px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.15)",
                              background: active ? "#EAF2FF" : "#fff",
                              color: active ? COLORS.blue : COLORS.black,
                              fontWeight: 700, fontSize: 12, padding: "7px 12px", borderRadius: 999, cursor: "pointer", maxWidth: 220, textAlign: "left",
                            }}
                            title={a.address}
                          >
                            📍 {a.label || (a.address ? String(a.address).split(",")[0] : "Saved")}{a.is_default ? " · default" : ""}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

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
                    <div style={{ fontSize: 12, color: "crimson", fontWeight: 700 }}>{addressError}</div>
                  ) : null}

                  <input
                    value={addressDetail}
                    onChange={(e) => setAddressDetail(e.target.value)}
                    placeholder="Unit / floor / landmark (optional)"
                    style={sameStyle}
                  />

                  {!mapsKey ? (
                    <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                      (Autocomplete is off because Google Maps API key is not set.)
                    </div>
                  ) : null}
                </div>

                {/* Live quote controls */}
                <div
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: COLORS.sand,
                    padding: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontWeight: 950, color: COLORS.black }}>
                      {deliveryMode === "intercity" ? "🚚 Next-day / intercity" : (shownLabel || "Live quote (Lalamove)")}
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchQuote({ manual: true })}
                      disabled={!canQuote || shippingLoading}
                      style={{
                        border: "1px solid rgba(0,0,0,0.12)",
                        background: "#fff",
                        borderRadius: 999,
                        padding: "10px 12px",
                        fontWeight: 900,
                        cursor: !canQuote || shippingLoading ? "not-allowed" : "pointer",
                        opacity: !canQuote || shippingLoading ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shippingLoading ? "Recalculating…" : "Recalculate"}
                    </button>
                  </div>

                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
                      {quoteUpdatedAt ? `Updated ${fmtTimeHm(quoteUpdatedAt)}` : "Select an address to get a live quote"}
                    </div>
                    <div style={{ fontWeight: 950, color: COLORS.black }}>
                      {shippingLoading ? "Calculating…" : shippingCost != null ? formatIDR(shippingCost) : "—"}
                    </div>
                  </div>

                  {quoteMeta?.etaHint || quoteMeta?.distanceKm ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {quoteMeta?.etaHint ? (
                        <div style={{ color: "rgba(0,0,0,0.70)", fontWeight: 800, fontSize: 12 }}>
                          {String(quoteMeta.etaHint)}
                        </div>
                      ) : null}
                      {quoteMeta?.distanceKm != null ? (
                        <div style={{ color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
                          Distance: ~{Number(quoteMeta.distanceKm)} km
                        </div>
                      ) : null}
                      {quoteMeta?.requestId ? (
                        <div style={{ color: "rgba(0,0,0,0.45)", fontWeight: 800, fontSize: 11 }}>
                          Quote ID: {String(quoteMeta.requestId)}
                        </div>
                      ) : null}
                      {quoteMeta?.origin?.name ? (
                        <div style={{ color: "rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 11 }}>
                          From: {String(quoteMeta.origin.name)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {shippingError ? (
                    <div style={{ marginTop: 8, color: "crimson", fontWeight: 900, fontSize: 12, lineHeight: 1.4 }}>
                      {shippingError}
                      <span style={{ color: "rgba(0,0,0,0.55)", fontWeight: 800 }}>
                        {" "}— try “Recalculate” or reselect your address.
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, color: "#6B6B6B", fontWeight: 700, fontSize: 12 }}>
                      Live quote may change based on traffic and driver availability.
                    </div>
                  )}
                </div>

                {/* Intercity courier picker (out-of-zone addresses) */}
                {deliveryMode === "intercity" && intercityRates.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Choose your courier</div>
                    <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                      {intercityRates.map((r: any, i: number) => {
                        const active = !!selectedCourier && selectedCourier.courier_code === r.courier_code && selectedCourier.courier_service_code === r.courier_service_code;
                        const nextDay = /^\s*1\s*-\s*1/.test(String(r.duration || ""));
                        return (
                          <button key={i} type="button" onClick={() => { setSelectedCourier(r); setShippingCost(Number(r.price)); }}
                            style={{ textAlign: "left", borderRadius: 12, border: active ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.12)", background: active ? "rgba(0,20,167,0.06)" : "#fff", padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 900, color: COLORS.black }}>{r.courier_name} — {r.courier_service_name}</span>
                              <span style={{ display: "block", fontSize: 12, color: "#6B6B6B", marginTop: 2 }}>{String(r.duration || "")}{nextDay ? " · next-day ⚡" : ""}</span>
                            </span>
                            <span style={{ fontWeight: 950, color: COLORS.black, whiteSpace: "nowrap" }}>{formatIDR(Number(r.price))}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    value={buildingName}
                    onChange={(e) => setBuildingName(e.target.value)}
                    placeholder="Building name (auto, editable)"
                    style={sameStyle}
                  />
                  <input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Postal code (auto, editable)"
                    style={sameStyle}
                  />
                </div>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Notes (optional)</span>
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
              </div>
            </section>
          ) : (
            <section
              style={{
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: 14,
                background: "#fff",
                boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontWeight: 950, color: COLORS.black }}>Pickup notes (optional)</div>
              <div style={{ marginTop: 6, color: "#6B6B6B", fontSize: 13 }}>
                Tell us anything we should know for pickup.
              </div>

              <label style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.black }}>Notes</span>
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
                  placeholder="Pickup instructions…"
                />
              </label>
            </section>
          )}

          {/* Order summary */}
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 14,
              background: "#fff",
              boxShadow: "0 10px 26px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, color: COLORS.black }}>Your order 🤍</div>

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
                  Delivery quote failed. Please press <b>Recalculate</b> in Delivery details.
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: COLORS.black, fontWeight: 950 }}>
                <div>Total</div>
                <div>{formatIDR(grandTotal)}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: "#6B6B6B", fontWeight: 800 }}>
                <div>{fulfillment === "pickup" ? "Pickup schedule" : "Delivery schedule"}</div>
                <div>{scheduleDate && scheduleTime ? `${scheduleDate} • ${scheduleTime}` : "Select schedule"}</div>
              </div>

              {fulfillment === "pickup" && pickupPointId ? (
                <div style={{ marginTop: 6, color: "#6B6B6B", fontWeight: 800 }}>
                  Pickup point: {pickupPoints.find((p) => p.id === pickupPointId)?.name || "—"}
                </div>
              ) : null}

              <div style={{ marginTop: 10, color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
                Secure checkout via Midtrans.
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Link href="/cart" style={{ color: COLORS.blue, fontWeight: 800, textDecoration: "none" }}>
                ← Back to cart
              </Link>
            </div>
          </section>

          {err && (
            <section style={{ borderRadius: 18, border: "1px solid rgba(0,0,0,0.10)", padding: 14, background: "#fff" }}>
              <div style={{ fontWeight: 950, color: COLORS.black }}>Hmm, something doesn’t look right.</div>
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
            disabled={
              loading ||
              (fulfillment === "delivery" &&
                (shippingCost == null || !!shippingError || shippingLoading || noSlotsLeftToday))
            }
            style={{
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "rgba(0,20,167,0.55)" : COLORS.blue,
              color: "#fff",
              fontWeight: 950,
              fontSize: 16,
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
              opacity:
                (fulfillment === "delivery" &&
                  (shippingCost == null || !!shippingError || shippingLoading || noSlotsLeftToday))
                  ? 0.6
                  : 1,
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
