// web/app/cookies/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { FLAVORS } from "@/lib/catalog";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";
import { COLORS } from "@/lib/theme";

export default function CookiesPage() {
  const router = useRouter();

  const cardFlavors = useMemo(() => {
    return FLAVORS.map((f: any) => {
      const out: CardFlavorUI = {
        id: String(f.id),
        name: String(f.name ?? ""),
        image: String(f.image ?? ""),
        image2: String(f.image2 ?? ""),
        ingredients: Array.isArray(f.ingredients)
          ? f.ingredients.map((x: any) => String(x))
          : [],
        textureTags: Array.isArray(f.tags) ? f.tags : [],
        intensity: f.intensity,
        badges: Array.isArray(f.badges) ? f.badges : [],
        soldOut: false,
      };
      return out;
    });
  }, []);

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px" }}>
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: COLORS.black }}>
            Cookies
          </h1>
          <p style={{ marginTop: 6, color: "#6B6B6B" }}>
            Explore our cookies. Tap any flavour to build your box.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          {cardFlavors.map((f) => (
            <ProductCard
              key={f.id}
              flavor={f}
              quantity={0}
              onAdd={() => router.push("/build")}
              onRemove={() => {}}
              disabledAdd={false}
              addLabel="Build a box"
              showQty={false}
            />
          ))}
        </section>

        <div style={{ marginTop: 24 }}>
          <Link href="/build" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
            Build your box →
          </Link>
        </div>
      </div>
    </main>
  );
}
