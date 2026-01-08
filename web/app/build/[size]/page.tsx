"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { addCartItem } from "@/lib/cart";
import { BOX_PRICES, FLAVORS, formatIDR, type FlavorBadge } from "@/lib/catalog";

function Badge({ b }: { b: FlavorBadge }) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  return <span className={base}>{b}</span>;
}

function Meter({ label, value }: { label: string; value?: 1 | 2 | 3 | 4 | 5 }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-2.5 w-2.5 rounded-full border ${n <= v ? "bg-black" : "bg-white"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function BuildSizePage() {
  const router = useRouter();
  const params = useParams();

  const raw = params?.size;
  const sizeNum = Array.isArray(raw) ? Number(raw[0]) : Number(raw);

  const allowedSizes = [1, 3, 6];
  const boxSize = allowedSizes.includes(sizeNum) ? sizeNum : 6;

  // counts by flavor id (duplicates allowed)
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const selectedCount = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [counts]
  );

  const remaining = boxSize - selectedCount;
  const boxPrice = BOX_PRICES[boxSize];

  const selectedItems = useMemo(() => {
    return FLAVORS.map((f) => {
      const qty = Number(counts[f.id] || 0);
      return qty > 0 ? { flavor: f, qty } : null;
    }).filter(Boolean) as { flavor: (typeof FLAVORS)[number]; qty: number }[];
  }, [counts]);

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

  function reset() {
    setCounts({});
    setError("");
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
      price: boxPrice, // ✅ fixed box price
      quantity: 1,
      meta: {
        size: boxSize,
        selections: selectedItems.map((row) => ({
          id: row.flavor.id,
          name: row.flavor.name,
          quantity: row.qty,
          image: row.flavor.image ?? null,
        })),
      },
    });

    router.push("/cart");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Build: Box of {boxSize}</h1>
            <div className="mt-1 text-sm text-gray-600">
              Fixed price: <span className="font-semibold">IDR {formatIDR(boxPrice)}</span>
              <span className="mx-2">•</span>
              Remaining slots:{" "}
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

        {/* Progress */}
        <div className="mb-6">
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-black"
              style={{ width: `${Math.min(100, (selectedCount / boxSize) * 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {selectedCount}/{boxSize} selected
            <button className="ml-3 underline" type="button" onClick={reset}>
              reset
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Flavours */}
          <div className="md:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {FLAVORS.map((f) => {
                const qty = counts[f.id] || 0;
                const disableAdd = remaining <= 0;

                return (
                  <div key={f.id} className="rounded-2xl border p-4">
                    <div className="flex gap-3">
                      <div className="relative h-20 w-20 overflow-hidden rounded-xl border bg-gray-50">
                        {f.image ? (
                          <Image src={f.image} alt={f.name} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-500">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="text-base font-semibold">{f.name}</div>
                        {f.description && (
                          <div className="mt-1 text-xs leading-relaxed text-gray-600">
                            {f.description}
                          </div>
                        )}

                        {!!(f.badges?.length) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {f.badges.map((b) => (
                              <Badge key={b} b={b} />
                            ))}
                          </div>
                        )}

                        {!!(f.tags?.length) && (
                          <div className="mt-2 text-xs text-gray-600">
                            {f.tags.join(" • ")}
                          </div>
                        )}

                        <div className="mt-3 space-y-1">
                          <Meter label="Chocolate" value={f.intensity?.chocolate} />
                          <Meter label="Sweetness" value={f.intensity?.sweetness} />
                        </div>

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

          {/* Sticky Summary */}
          <div className="md:sticky md:top-6 h-fit rounded-2xl border p-4">
            <div className="text-lg font-semibold">Summary</div>

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
                <span className="font-medium">Price</span>
                <span className="font-semibold">IDR {formatIDR(boxPrice)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium">Your flavours</div>
              {selectedItems.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">Pick your cookies on the left.</div>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {selectedItems.map((row) => (
                    <li key={row.flavor.id} className="flex items-center justify-between">
                      <span className="pr-2">{row.flavor.name}</span>
                      <span className="font-semibold">x{row.qty}</span>
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
              className={`mt-6 w-full rounded-md px-4 py-3 text-sm font-semibold ${
                selectedCount === boxSize ? "bg-black text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              Add to cart
            </button>

            <button
              type="button"
              onClick={() => router.push("/cart")}
              className="mt-2 w-full rounded-md border px-4 py-3 text-sm"
            >
              Go to cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
