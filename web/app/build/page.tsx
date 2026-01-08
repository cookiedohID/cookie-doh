"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BOX_PRICES, formatIDR } from "@/lib/catalog";

const SIZES = [
  { size: 1, label: "Box of 1" },
  { size: 3, label: "Box of 3" },
  { size: 6, label: "Box of 6" },
];

export default function BuildPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Build a box</h1>
            <p className="mt-1 text-sm text-gray-600">
              Choose your box size, pick flavours (duplicates allowed), then checkout.
            </p>
          </div>

          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() => router.push("/cart")}
            type="button"
          >
            Cart
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {SIZES.map((s) => (
            <button
              key={s.size}
              type="button"
              className="rounded-2xl border p-5 text-left hover:bg-gray-50"
              onClick={() => router.push(`/build/${s.size}`)}
            >
              <div className="text-lg font-semibold">{s.label}</div>
              <div className="mt-1 text-sm text-gray-600">
                Fixed price: <span className="font-medium">IDR {formatIDR(BOX_PRICES[s.size])}</span>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Pick exactly {s.size} cookies • Repeat flavours if you want
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border bg-gray-50 p-5">
          <div className="text-sm font-semibold">Tip</div>
          <div className="mt-1 text-sm text-gray-700">
            Make sure your flavour images exist at <code className="px-1">web/public/flavors/</code>{" "}
            and match the paths in <code className="px-1">catalog.ts</code> (e.g.{" "}
            <code className="px-1">/flavors/the-one.jpg</code>).
          </div>
        </div>
      </div>
    </div>
  );
}
