"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addCartItem } from "@/lib/cart";

type Flavor = {
  id: string;
  name: string;
  price: number; // IDR per cookie (MVP)
};

// ✅ MVP flavour list (edit later if you want)
const FLAVORS: Flavor[] = [
  { id: "choco-bliss", name: "Choco Bliss", price: 25000 },
  { id: "comfort-oat-raisin", name: "The Comfort (Oat & Raisin)", price: 23000 },
  { id: "matcha-magic", name: "Matcha Magic", price: 26000 },
  { id: "red-velvet", name: "Red Velvet", price: 26000 },
  { id: "double-choco", name: "Double Choco", price: 27000 },
  { id: "salted-caramel", name: "Salted Caramel", price: 27000 },
];

function formatIDR(n: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

export default function BuildSizePage({ params }: { params: { size: string } }) {
  const router = useRouter();

  const size = Math.max(1, Math.min(50, Number(params.size || 0) || 0));
  const allowedSizes = [3, 6, 12];
  const finalSize = allowedSizes.includes(size) ? size : 6;

  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");

  const selectedFlavors = useMemo(
    () => selected.map((id) => FLAVORS.find((f) => f.id === id)).filter(Boolean) as Flavor[],
    [selected]
  );

  const subtotal = useMemo(() => selectedFlavors.reduce((sum, f) => sum + f.price, 0), [selectedFlavors]);

  const remaining = finalSize - selected.length;

  function toggleFlavor(id: string) {
    setError("");
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= finalSize) return prev; // can't exceed
      return [...prev, id];
    });
  }

  function addToCartNow() {
    setError("");

    if (selected.length !== finalSize) {
      setError(`Please select exactly ${finalSize} flavours. Remaining: ${remaining}`);
      return;
    }

    const ts = Date.now();
    const boxId = `box-${finalSize}-${ts}`;

    const boxName = `Cookie Box (${finalSize}) - ${selectedFlavors.map((f) => f.name).join(", ")}`;

    addCartItem({
      id: boxId,
      name: boxName.slice(0, 180),
      price: subtotal,
      quantity: 1,
      meta: {
        size: finalSize,
        flavors: selectedFlavors.map((f) => ({ id: f.id, name: f.name, price: f.price })),
      },
    });

    router.push("/cart");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Build: Box of {finalSize}</h1>
            <div className="mt-1 text-sm text-gray-600">
              Pick exactly {finalSize} flavours. Remaining:{" "}
              <span className={remaining === 0 ? "font-semibold text-green-700" : "font-semibold"}>
                {remaining}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => router.push("/build")}
              type="button"
            >
              Change size
            </button>
            <button
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => router.push("/cart")}
              type="button"
            >
              Cart
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Flavour list */}
          <div className="md:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {FLAVORS.map((f) => {
                const active = selected.includes(f.id);
                const disabled = !active && selected.length >= finalSize;

                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleFlavor(f.id)}
                    className={`rounded-xl border p-4 text-left ${
                      active ? "border-black bg-gray-50" : "hover:bg-gray-50"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <div className="text-base font-medium">{f.name}</div>
                    <div className="mt-1 text-sm text-gray-600">IDR {formatIDR(f.price)} / cookie</div>
                    <div className="mt-3 text-xs text-gray-500">
                      {active ? "Selected" : disabled ? "Box is full" : "Tap to select"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border p-4">
            <div className="text-lg font-medium">Summary</div>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Box size</span>
                <span>{finalSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Selected</span>
                <span>{selected.length}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-medium">Subtotal</span>
                <span className="font-semibold">IDR {formatIDR(subtotal)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium">Your flavours</div>
              {selectedFlavors.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">No flavours selected yet.</div>
              ) : (
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                  {selectedFlavors.map((f) => (
                    <li key={f.id}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={addToCartNow}
              className={`mt-6 w-full rounded-md px-4 py-3 text-sm font-medium ${
                selected.length === finalSize ? "bg-black text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              Add to cart
            </button>

            <button
              type="button"
              onClick={() => router.push("/checkout")}
              className="mt-2 w-full rounded-md border px-4 py-3 text-sm"
            >
              Go to checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
