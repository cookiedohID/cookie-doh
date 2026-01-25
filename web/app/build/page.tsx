// web/app/build/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addBoxToCart } from "@/lib/cart";
import { BOX_PRICES, FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";

type BoxSize = 1 | 3 | 6;

const COLORS = {
  blue: "#0052CC", // Pantone 293C vibe
  black: "#101010",
  white: "#FFFFFF",
  orange: "#FF5A00", // Accent (021C-ish)
};

// Your current system prices cookies at 32,500 in the builder UI.
// If you later move to per-flavor pricing, we can replace this.
const COOKIE_PRICE = 32500;

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const BOX_OPTIONS: { size: BoxSize; title: string; desc: string }[] = [
  { size: 1, title: "1 cookie", desc: "Just one, just because" },
  { size: 3, title: "3 cookies", desc: "Perfect for a little treat" },
  { size: 6, title: "6 cookies", desc: "Just right for sharing" },
];

function toCardFlavor(f: any): CardFlavorUI {
  return {
    id: String(f.id),
    name: String(f.name ?? ""),
    image: String(f.image ?? ""),
    // ProductCard expects `ingredients` (we use catalog description)
    ingredients: String(f.description ?? ""),
    // ProductCard expects `textureTags` (we use catalog tags)
    textureTags: Array.isArray(f.tags) ? f.tags : [],
    intensity: f.intensity,
    badges: Array.isArray(f.badges) ? f.badges : [],
    price: COOKIE_PRICE,
    soldOut: Boolean(f.soldOut),
  };
}

export default function BuildABoxPage() {
  const router = useRouter();

  const [boxSize, setBoxSize] = useState<BoxSize>(6);
  const [qty, setQty] = useState<Record<string, number>>({});

  // pulse once on box selection (kept)
  const pulseKeyRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);

  const cardFlavors = useMemo(
    () => CATALOG_FLAVORS.map(toCardFlavor),
    []
  );

  const totalCount = useMemo(
    () => Object.values(qty).reduce((a, b) => a + b, 0),
    [qty]
  );

  const remaining = Math.max(0, boxSize - totalCount);
  const canAddMore = totalCount < boxSize;
  const isFull = remaining === 0;
  const isEmpty = totalCount === 0;

  const totalPrice = useMemo(() => {
    return isFull ? BOX_PRICES[boxSize] : 0;
  }, [boxSize, isFull]);

  const inc = (id: string) => {
    if (!canAddMore) return;
    setQty((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  const dec = (id: string) => {
    setQty((prev) => {
      const next = { ...prev };
      const v = next[id] ?? 0;
      if (v <= 1) delete next[id];
      else next[id] = v - 1;
      return next;
    });
  };

  const onAddToCart = () => {
    if (!isFull) return;

    const items = cardFlavors
      .filter((f) => (qty[f.id] ?? 0) > 0)
      .map((f) => ({
        id: String(f.id),
        name: String(f.name),
        price: Number(f.price ?? COOKIE_PRICE),
        quantity: Number(qty[f.id] ?? 0),
        image: String(f.image ?? ""),
      }));

    addBoxToCart({
      boxSize,
      items,
      total: BOX_PRICES[boxSize],
    });

    router.push("/cart");
  };

  // Lock B: ONLY "Add X more"
  const bannerText = isFull
    ? "Box complete"
    : isEmpty
      ? "Start adding cookies you love"
      : `Add ${remaining} more`;

  const bannerBg = isFull ? "rgba(0,0,0,0.03)" : "rgba(0,82,204,0.06)";
  const bannerBorder = isFull
    ? "1px solid rgba(0,0,0,0.10)"
    : "1px solid rgba(0,82,204,0.25)";

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <style>{`
        @keyframes cd_pulse {
          0% { transform: scale(0.985); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 140px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>
            Build your cookie box
          </h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>
            Mix and match your favourites. Freshly baked, packed with care.
          </p>
        </header>

        {/* Box size cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {BOX_OPTIONS.map((opt) => {
            const active = opt.size === boxSize;
            return (
              <button
                key={opt.size}
                onClick={() => {
                  setBoxSize(opt.size);
                  setQty({});
                  pulseKeyRef.current += 1;
                  setPulseKey(pulseKeyRef.current);
                }}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: active ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                  background: active ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800, color: COLORS.black }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>{opt.desc}</div>
              </button>
            );
          })}
        </section>

        {/* Progress banner */}
        <section style={{ marginBottom: 18 }}>
          <div
            key={pulseKey}
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              border: bannerBorder,
              background: bannerBg,
              fontWeight: 950,
              color: COLORS.black,
              animation: "cd_pulse 0.6s ease-out",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950 }}>Box of {boxSize}</div>
              <div style={{ color: "#3C3C3C", fontWeight: 900 }}>{bannerText}</div>
            </div>

            {!isFull && (
              <div style={{ fontWeight: 950, color: COLORS.orange, whiteSpace: "nowrap" }}>
                {remaining} left
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 10,
              height: 10,
              borderRadius: 999,
              background: "rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
            aria-label="Progress"
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (totalCount / boxSize) * 100)}%`,
                background: COLORS.orange,
                borderRadius: 999,
              }}
            />
          </div>

          {!canAddMore && (
            <div style={{ marginTop: 10, color: "#6B6B6B", fontWeight: 800 }}>
              Box is full. Remove one cookie to add another.
            </div>
          )}
        </section>

        {/* Flavor grid using ProductCard (soldOut now works from catalog.ts) */}
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
              quantity={qty[f.id] ?? 0}
              onAdd={() => inc(f.id)}
              onRemove={() => dec(f.id)}
              disabledAdd={!canAddMore}
              addLabel="Add to box"
            />
          ))}
        </section>
      </div>

      {/* Sticky bottom bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: COLORS.white,
          borderTop: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.05)",
          padding: "12px 14px",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 900, color: COLORS.black }}>
              {isFull ? "Box complete" : `Add ${remaining} more`}
            </div>

            <div style={{ color: "#6B6B6B", fontWeight: 900 }}>
              Total: {formatIDR(isFull ? totalPrice : 0)}
            </div>
          </div>

          <button
            onClick={onAddToCart}
            disabled={!isFull}
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: !isFull ? "not-allowed" : "pointer",
              background: !isFull ? "rgba(0,82,204,0.45)" : COLORS.blue,
              color: COLORS.white,
              fontWeight: 900,
              fontSize: 16,
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
            }}
          >
            Add box to cart
          </button>

          <div style={{ marginTop: 8, color: "#6B6B6B", fontWeight: 800, fontSize: 12, textAlign: "center" }}>
            Freshly baked · Packed with care · Gift-ready
          </div>
        </div>
      </div>
    </main>
  );
}
