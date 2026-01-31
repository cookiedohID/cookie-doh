"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { FLAVORS } from "@/lib/catalog";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";

const COOKIE_PRICE = 32500;

function toCardFlavor(f: any): CardFlavorUI {
  return {
    id: String(f.id),
    name: String(f.name ?? ""),
    image: String(f.image ?? ""),
    ingredients: String(f.description ?? ""),
    textureTags: Array.isArray(f.tags) ? f.tags : [],
    intensity: f.intensity,
    badges: Array.isArray(f.badges) ? f.badges : [],
    price: COOKIE_PRICE,
    soldOut: Boolean((f as any).soldOut),
  };
}

export default function FlavorsPage() {
  const router = useRouter();
  const cardFlavors = useMemo(() => FLAVORS.map(toCardFlavor), []);

  return (
    <main className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black">Explore flavours</h1>
            <p className="mt-2 max-w-xl text-black/60">
              Tap any flavour to start building your box.
            </p>
          </div>

          <Link href="/build" className="font-semibold text-[#0014a7]">
            Build a box →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {cardFlavors.map((f) => (
            <ProductCard
              key={f.id}
              flavor={f}
              quantity={0}
              onAdd={() => router.push("/build")}
              onRemove={() => {}}
              disabledAdd={false}
              addLabel="Build a box"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
