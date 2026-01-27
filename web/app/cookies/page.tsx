// web/app/cookies/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { FLAVORS } from "@/lib/catalog";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";
import { parsePickupPoints, useStoreStock } from "@/lib/storeStock";

const COLORS = {
  blue: "#0014a7",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

export default function CookiesPage() {
  const router = useRouter();

  const points = useMemo(() => parsePickupPoints(process.env.NEXT_PUBLIC_PICKUP_POINTS_JSON), []);
  const { storeId, setStore, storeName, stock, loading } = useStoreStock(points);

  const cardFlavors = useMemo(() => {
    return FLAVORS.map((f: any) => {
      const fid = String(f.id);
      const available = Number(stock?.[fid] ?? 0);
      const soldOut = available <= 0;

      const out: CardFlavorUI = {
        id: fid,
        name: String(f.name ?? ""),
        image: String(f.image ?? ""),
        ingredients: String(f.description ?? ""),
        textureTags: Array.isArray(f.tags) ? f.tags : [],
        intensity: f.intensity,
        badges: Array.isArray(f.badges) ? f.badges : [],
        soldOut,
      };
      return out;
    });
  }, [stock]);

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px" }}>
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: COLORS.black }}>
            Cookies
          </h1>
          <p style={{ marginTop: 6, color: "#6B6B6B" }}>
            Explore our cookies. Stock reflects your selected store.
          </p>
        </header>

        {/* Store selector */}
        <section
          style={{
            marginBottom: 14,
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            background: COLORS.sand,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 950, color: COLORS.black }}>Store</div>
            <div style={{ color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
              {loading ? "Checking stock…" : `Stock for: ${storeName}`}
            </div>
          </div>

          <select
            value={storeId}
            onChange={(e) => setStore(e.target.value)}
            style={{
              marginTop: 10,
              width: "100%",
              height: 46,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              padding: "0 12px",
              outline: "none",
              background: "#fff",
              fontWeight: 900,
            }}
          >
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {cardFlavors.map((f) => (
            <ProductCard
              key={f.id}
              flavor={f}
              quantity={0}
              onAdd={() => router.push("/build")}
              onRemove={() => {}}
              disabledAdd={!!f.soldOut}
              addLabel={f.soldOut ? "Sold out" : "Build a box"}
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
