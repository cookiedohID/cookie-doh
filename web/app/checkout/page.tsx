"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartItem, calcSubtotal, getCart } from "@/lib/cart";

type Area = {
  id: string;
  name: string;
  postal_code?: number;
};

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

function formatIDR(n: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

function isJakartaLabel(label: string) {
  const s = (label || "").toLowerCase();
  return s.includes("jakarta") || s.includes("dki");
}

export default function CheckoutPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Shipping
  const [address, setAddress] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  // Courier
  const [courierCompany, setCourierCompany] = useState<"paxel" | "lalamove" | "">("");
  const [courierType, setCourierType] = useState<string>("");
  const [courierService, setCourierService] = useState<string>("");

  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setCart(getCart());
  }, []);

  const boxes = useMemo(() => cart.reduce((sum, it) => sum + (it.quantity || 0), 0), [cart]);
  const subtotal = useMemo(() => calcSubtotal(cart), [cart]);
  const shippingFee = 0; // MVP
  const total = subtotal + shippingFee;

  const inJakarta = useMemo(() => isJakartaLabel(selectedArea?.name ?? ""), [selectedArea?.name]);

  useEffect(() => {
    if (!selectedArea) {
      setCourierCompany("");
      setCourierType("");
      setCourierService("");
      return;
    }

    if (!inJakarta) {
      setCourierCompany("paxel");
      setCourierType("standard");
      setCourierService("small_package");
      return;
    }

    if (!courierCompany) {
      setCourierCompany("lalamove");
      setCourierType("instant");
      setCourierService("motorbike");
    }
  }, [selectedArea, inJakarta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedArea || !inJakarta) return;

    if (courierCompany === "lalamove") {
      setCourierType("instant");
      setCourierService("motorbike");
    } else if (courierCompany === "paxel") {
      setCourierType("instant");
      setCourierService("small_package");
    }
  }, [courierCompany, selectedArea, inJakarta]);

  useEffect(() => {
    let alive = true;
    const q = areaQuery.trim();

    if (!q) {
      setAreas([]);
      return;
    }

    setAreaLoading(true);
    setError("");

    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/biteship/areas?q=${encodeURIComponent(q)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const json = await resp.json().catch(() => ({}));
        const list = Array.isArray(json?.areas) ? (json.areas as Area[]) : [];

        if (!resp.ok) {
          if (alive) {
            setAreas([]);
            setError(json?.error ? String(json.error) : "Failed to search areas");
          }
          return;
        }

        if (alive) setAreas(list);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Area search failed");
      } finally {
        if (alive) setAreaLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [areaQuery]);

  useEffect(() => {
    const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
    if (!clientKey) return;

    const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
    const src = isProd
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return;

    const s = document.createElement("script");
    s.src = src;
    s.setAttribute("data-client-key", clientKey);
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const phoneOk = useMemo(() => phone.replace(/\D/g, "").length >= 9, [phone]);

  const canPay = useMemo(() => {
    if (!cart.length) return false;
    if (!fullName.trim()) return false;
    if (!phoneOk) return false;
    if (!address.trim()) return false;
    if (!selectedArea?.id) return false;
    if (!courierCompany) return false;
    if (!courierType) return false;
    return true;
  }, [cart.length, fullName, phoneOk, address, selectedArea?.id, courierCompany, courierType]);

  async function onPay() {
    setError("");

    if (!window.snap) {
      setError("Midtrans Snap is not loaded. Check NEXT_PUBLIC_MIDTRANS_CLIENT_KEY and reload.");
      return;
    }

    if (!canPay) {
      setError("Please fill customer + shipping details first.");
      return;
    }

    setPaying(true);

    try {
      const payload = {
        items: cart.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
        })),
        customer: {
          name: fullName.trim(),
          phone: phone.trim(),
        },
        shipping: {
          address: address.trim(),
          destination_area_id: selectedArea?.id,
          destination_area_label: selectedArea?.name,
          postal_code: selectedArea?.postal_code ?? null,

          courier_company: courierCompany,
          courier_type: courierType,
          courier_service: courierService,
        },
      };

      const resp = await fetch("/api/midtrans/snap-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to create Midtrans token");
      }

      const token = String(json?.token || "");
      if (!token) throw new Error("No token returned from snap-token API");

      window.snap.pay(token, {
        onSuccess: () => router.push("/build"),
        onPending: () => router.push("/build"),
        onError: (r) => {
          console.error("midtrans error:", r);
          setError("Payment failed. Please try again.");
        },
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <button className="text-sm underline" onClick={() => router.push("/cart")} type="button">
            Back to Cart
          </button>
        </div>

        {!cart.length ? (
          <div className="rounded-lg border p-4">
            <p className="mb-3">Your cart is empty.</p>
            <button className="rounded-md border px-4 py-2" onClick={() => router.push("/build")} type="button">
              Build a box
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Left */}
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">Customer details</h2>

                <label className="mb-1 block text-sm">Full name *</label>
                <input
                  className="mb-3 w-full rounded-md border px-3 py-2"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Angel Tan"
                />

                <label className="mb-1 block text-sm">Phone number *</label>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0812xxxxxxx"
                />
                {!phoneOk && phone.trim().length > 0 && (
                  <p className="mt-1 text-xs text-red-600">Please enter a valid phone number.</p>
                )}
              </div>

              <div className="rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">Shipping</h2>

                <label className="mb-1 block text-sm">Delivery address *</label>
                <textarea
                  className="mb-3 w-full rounded-md border px-3 py-2"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, building, unit, notes..."
                  rows={3}
                />

                <label className="mb-1 block text-sm">Area (Biteship) *</label>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={areaQuery}
                  onChange={(e) => {
                    setAreaQuery(e.target.value);
                    setSelectedArea(null);
                  }}
                  placeholder="Type your area, e.g. Kemang"
                />

                {areaLoading && <p className="mt-2 text-xs text-gray-600">Searching…</p>}

                {!selectedArea && areas.length > 0 && (
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                    {areas.slice(0, 12).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setSelectedArea(a);
                          setAreaQuery(a.name);
                          setAreas([]);
                        }}
                      >
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-gray-600">{a.id}</div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedArea && (
                  <div className="mt-2 rounded-md bg-gray-50 p-3 text-sm">
                    <div className="font-medium">Selected area</div>
                    <div className="mt-1">{selectedArea.name}</div>
                    <div className="mt-1 text-xs text-gray-600">{selectedArea.id}</div>
                  </div>
                )}

                <div className="mt-4 rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">Courier *</div>

                  {!selectedArea ? (
                    <p className="text-xs text-gray-600">Select an area first to choose courier.</p>
                  ) : inJakarta ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600">Jakarta detected → choose Paxel or Lalamove.</p>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`rounded-md border px-3 py-2 text-sm ${
                            courierCompany === "lalamove" ? "bg-black text-white" : ""
                          }`}
                          onClick={() => setCourierCompany("lalamove")}
                        >
                          Lalamove
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-3 py-2 text-sm ${
                            courierCompany === "paxel" ? "bg-black text-white" : ""
                          }`}
                          onClick={() => setCourierCompany("paxel")}
                        >
                          Paxel
                        </button>
                      </div>

                      <div className="mt-2 text-xs text-gray-600">
                        Current: {courierCompany || "-"} / {courierType || "-"} / {courierService || "-"}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600">Outside Jakarta → Paxel only (auto-selected).</p>
                      <div className="mt-2 text-xs text-gray-600">
                        Current: {courierCompany || "-"} / {courierType || "-"} / {courierService || "-"}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Right */}
            <div className="rounded-lg border p-4">
              <h2 className="mb-4 text-lg font-medium">Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Boxes</span>
                  <span>{boxes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Shipping</span>
                  <span>{shippingFee === 0 ? "Free" : formatIDR(shippingFee)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatIDR(total)}</span>
                </div>
              </div>

              <button
                type="button"
                className={`mt-6 w-full rounded-md px-4 py-3 text-sm font-medium ${
                  canPay && !paying ? "bg-black text-white" : "cursor-not-allowed bg-gray-200 text-gray-600"
                }`}
                disabled={!canPay || paying}
                onClick={onPay}
              >
                {paying ? "Preparing payment…" : "Pay with Midtrans"}
              </button>

              <p className="mt-3 text-xs text-gray-600">
                Pay button unlocks after: name, phone, address, area, courier.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
