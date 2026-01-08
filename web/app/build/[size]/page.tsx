"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { addCartItem } from "@/lib/cart";

type Flavor = {
  id: string;
  name: string;
  price: number; // IDR per cookie
  image?: string; // /flavors/<id>.jpg
};

function formatIDR(n: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

// ✅ Replace these with YOUR real flavours/prices
// Images: put files in /public/flavors/<id>.jpg (or .png) then set image path
const FLAVORS: Flavor[] = [
  { id: "choco-bliss", name: "Choco Bliss", price: 25000, image: "/flavors/choco-bliss.jpg" },
  { id: "comfort-oat-raisin", name: "The Comfort (Oat & Raisin)", price: 23000, image: "/flavors/comfort-oat-raisin.jpg" },
  { id: "matcha-magic", name: "Matcha Magic", price: 26000, image: "/flavors/matcha-magic.jpg" },
  { id: "red-velvet", name: "Red Velvet", price: 26000, image: "/flavors/red-velvet.jpg" },
  { id: "double-choco", name: "Double Choco", price: 27000, image: "/flavors/double-choco.jpg" },
  { id: "salted-caramel", name: "Salted Caramel", price: 27000, image: "/flavors/salted-caramel.jpg" },
];

export default function BuildSizePage() {
  const router = useRouter();
  const params = useParams();

  const raw = params?.size;
  const sizeNum = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
  const allowedSizes = [1, 3, 6];
  const boxSize = allowedSizes.includes(sizeNum) ? sizeNum : 6;

  // counts by flavor id
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const selectedCount = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [counts]
  );

  const remaining = boxSize - selectedCount;

  const selectedItems = useMemo(() => {
    const list: { flavor: Flavor; qty: number }[] = [];
    for (const f of FLAVORS) {
      const qty = Number(counts[f.id] || 0);
      if (qty > 0) list.push({ flavor: f, qty });
    }
    return list;
  }, [counts]);

  const subtotal = useMemo(() => {
    return selectedItems.reduce((sum, row) => sum + row.flavor.price * row.qty, 0);
  }, [selectedItems]);

  function inc(id: string) {
    setError("");
    if (remaining <= 0) return;
    setCounts((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  function dec(id: string) {
    setError("");
    setCounts((prev) => {
      const next = { ...prev };
      const cur = next[id] || 0;
      if (cur <= 1) delete next[id];
      else next[id] = cur - 1;
      return next;
    });
  }

  function addToCartNow() {
    setError("");

    if (selectedCount !== boxSize) {
      setError(`Please select exactly ${boxSize} cookies. Remaining: ${remaining}`);
      return;
    }

    const ts = Date.now();
    const boxId = `box-${boxSize}-${ts}`;

    const titleParts = selectedItems
      .map((row) => `${row.flavor.name} x${row.qty}`)
      .join(", ");

    addCartItem({
      id: boxId,
      name: `Cookie Box (${boxSize}) - ${titleParts}`.slice(0, 180),
      price: subtotal,
      quantity: 1,
      meta: {
        size: boxSize,
        flavors: selectedItems.map((row) => ({
          id: row.flavor.id,
          name: row.flavor.name,
          price: row.flavor.price,
          quantity: row.qty,
        })),
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
            <h1 className="text-2xl font-semibold">Build: Box of {boxSize}</h1>
            <div className="mt-1 text-sm text-gray-600">
              Remaining:{" "}
              <span className={remaining === 0 ? "font-semibold text-green-700" : "font-semibold"}>
                {remaining}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="rounded-md border px-4 py-2 text-sm" onClick={() => router.push("/build")} type="button">
              Change size
            </button>
            <button className="rounded-md border px-4 py-2 text-sm" onClick={() => router.push("/cart")} type="button">
              Cart
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Flavours */}
          <div className="md:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {FLAVORS.map((f) => {
                const qty = counts[f.id] || 0;
                const disableAdd = remaining <= 0;

                return (
                  <div key={f.id} className="rounded-xl border p-4">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 overflow-hidden rounded-lg border bg-gray-50">
                        {/* image is optional */}
                        {f.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.image} alt={f.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="text-base font-medium">{f.name}</div>
                        <div className="mt-1 text-sm text-gray-600">IDR {formatIDR(f.price)} / cookie</div>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            className="rounded-md border px-3 py-1 text-sm"
                            onClick={() => dec(f.id)}
                            type="button"
                            disabled={qty <= 0}
                          >
                            -
                          </button>

                          <div className="min-w-[36px] text-center text-sm font-semibold">{qty}</div>

                          <button
                            className={`rounded-md border px-3 py-1 text-sm ${disableAdd ? "opacity-40" : ""}`}
                            onClick={() => inc(f.id)}
                            type="button"
                            disabled={disableAdd}
                          >
                            +
                          </button>

                          <div className="ml-2 text-xs text-gray-500">
                            {disableAdd ? "Box full" : "Add"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                <span>{boxSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Selected</span>
                <span>{selectedCount}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-medium">Subtotal</span>
                <span className="font-semibold">IDR {formatIDR(subtotal)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium">Your flavours</div>
              {selectedItems.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">No flavours selected yet.</div>
              ) : (
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                  {selectedItems.map((row) => (
                    <li key={row.flavor.id}>
                      {row.flavor.name} x{row.qty}
                    </li>
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
                selectedCount === boxSize ? "bg-black text-white" : "bg-gray-200 text-gray-600"
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
