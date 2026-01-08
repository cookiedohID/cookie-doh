"use client";

import React from "react";
import { useRouter } from "next/navigation";

const SIZES = [
  { size: 3, label: "Box of 3" },
  { size: 6, label: "Box of 6" },
  { size: 12, label: "Box of 12" },
];

export default function BuildPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Build a box</h1>
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
              className="rounded-xl border p-5 text-left hover:bg-gray-50"
              onClick={() => router.push(`/build/${s.size}`)}
            >
              <div className="text-lg font-medium">{s.label}</div>
              <div className="mt-1 text-sm text-gray-600">
                Choose {s.size} flavours, add to cart, then checkout.
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-medium">How it works</div>
          <ul className="mt-2 list-disc pl-5">
            <li>Select a box size</li>
            <li>Pick flavours (exactly the number of cookies)</li>
            <li>Add to cart</li>
            <li>Checkout + pay with Midtrans</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
