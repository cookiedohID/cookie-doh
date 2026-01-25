// web/app/build/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addBoxToCart } from "@/lib/cart";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";

type BoxSize = 1 | 3 | 6;

const COLORS = {
  blue: "#0052CC", // Pantone 293C vibe
  black: "#101010",
  white: "#FFFFFF",
  orange: "#FF5A00", // Accent (021C-ish)
};

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const BOX_PRICE: Record<BoxSize, number> = {
  1: 32500,
  3: 90000,
  6: 180000,
};

const BOX_OPTIONS: { size: BoxSize; title: string; desc: string }[] = [
  { size: 1, title: "1 cookie", desc: "Just one, just because" },
  { size: 3, title: "3 cookies", desc: "Perfect for a little treat" },
  { size: 6, title: "6 cookies", desc: "Just right for sharing" },
];

/**
 * IMPORTANT:
 * ProductCard expects:
 * - image (string)
 * - ingredients (string)
 * - textureTags (string[])
 *
 * If you don’t want textureTags in Build, we still pass a tiny default so UI stays consistent.
 */
const FLAVORS: CardFlavorUI[] = [
  {
    id: "the-one",
    name: "The One",
    image: "/flavors/the-one.jpg",
    price: 32500,
    ingredients: "Bold dark cookie + white chocolate chips.",
    textureTags: ["Chewy", "Chunky"],
    badges: ["Bestseller", "Classic"],
  },
  {
    id: "the-other-one",
    name: "The Other One",
    image: "/flavors/the-other-one.jpg",
    price: 32500,
    ingredients: "Dark + milk chocolate chips.",
    textureTags: ["Gooey", "Rich"],
    badges: ["Fan Favorite"],
  },
  {
    id: "the-comfort",
    name: "The Comfort",
    image: "/flavors/the-comfort.jpg",
    price: 32500,
    ingredients: "Oats, raisins, cinnamon hug.",
    textureTags: ["Soft", "Buttery"],
    badges: ["Classic"],
  },
  {
    id: "matcha-magic",
    name: "Matcha Magic",
    image: "/flavors/matcha-magic.jpg",
    price: 32500,
    ingredients: "Vibrant matcha + sweet clouds.",
    textureTags: ["Smooth", "Creamy"],
    badges: ["New"],
    // soldOut: true, // ✅ toggle to test sold-out behavior
  },
  {
    id: "orange-in-the-dark",
    name: "Orange In The Dark",
    image: "/flavors/orange-in-the-dark.jpg",
    price: 32500,
    ingredients: "Chocolate + orange peel twist.",
    textureTags: ["Bold", "Zesty"],
    badges: ["Limited"],
  },
];

// ✅ Quick pick combos (editable anytime)
const QUICK_PICKS: Record<
  BoxSize,
  { title: string; desc: string; picks: Record<string, number> }[]
> = {
  1: [
    { title: "Classic Bestie", desc: "The One ×1", picks: { "the-one": 1 } },
    { title: "Comfort Solo", desc: "The Comfort ×1", picks: { "the-comfort": 1 } },
  ],
  3: [
    {
      title: "Crowd Pleaser",
      desc: "The One ×2 + The Other One ×1",
      picks: { "the-one": 2, "the-other-one": 1 },
    },
    {
      title: "Balanced Trio",
      desc: "The One ×1 + The Other One ×1 + The Comfort ×1",
      picks: { "the-one": 1, "the-other-one": 1, "the-comfort": 1 },
    },
  ],
  6: [
    {
      title: "Best Seller Mix",
      desc: "The One ×2 + The Other One ×2 + The Comfort ×1 + Matcha ×1",
      picks: {
        "the-one": 2,
        "the-other-one": 2,
        "the-comfort": 1,
        "matcha-magic": 1,
      },
    },
    {
      title: "Choco Lover",
      desc: "The One ×3 + The Other One ×3",
      picks: { "the-one": 3, "the-other-one": 3 },
    },
    {
      title: "Adventure Box",
      desc: "Mix everything",
      picks: {
        "the-one": 1,
        "the-other-one": 2,
        "the-comfort": 1,
        "matcha-magic": 1,
        "orange-in-the-dark": 1,
      },
    },
  ],
};

export default function BuildABoxPage() {
  const router = useRouter();

  const [boxSize, setBoxSize] = useState<BoxSize>(6);
  const [qty, setQty] = useState<Record<string, number>>({});

  // Progress pulse (kept from your original)
  const pulseKeyRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);

  const totalCount = useMemo(
    () => Object.values(qty).reduce((a, b) => a + b, 0),
    [qty]
  );

  const remaining = Math.max(0, boxSize - totalCount);
  const canAddMore = totalCount < boxSize;
  const isFull = remaining === 0;
  const isEmpty = totalCount === 0;

  const totalPrice = useMemo(() => {
    if (totalCount === boxSize) return BOX_PRICE[boxSize];
    return 0;
  }, [boxSize, totalCount]);

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

  const applyQuickPick = (picks: Record<string, number>) => {
    setQty(picks);
  };

  const onAddToCart = () => {
    if (!isFull) return; // guarded

    const items = FLAVORS.filter((f) => (qty[f.id] ?? 0) > 0).map((f) => ({
      id: String(f.id),
      name: String(f.name),
      price: Number(f.price ?? 0),
      quantity: Number(qty[f.id] ?? 0),
      image: String(f.image ?? ""),
    }));

    addBoxToCart({
      boxSize,
      items,
      total: BOX_PRICE[boxSize],
    });

    router.push("/cart");
  };

  // Lock B: ONLY "Add X more" (no 3/12)
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
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </section>

        {/* Quick Picks */}
        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 950, color: COLORS.black }}>Quick picks</div>
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            {QUICK_PICKS[boxSize].map((qp) => (
              <button
                key={qp.title}
                type="button"
                onClick={() => applyQuickPick(qp.picks)}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: COLORS.white,
                  cursor: "pointer",
                  boxShadow: "0 10px 22px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontWeight: 900, color: COLORS.black }}>{qp.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#6B6B6B", fontWeight: 800 }}>
                  {qp.desc}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Progress banner (pulse once on box selection) */}
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

        {/* Flavor grid (now using ProductCard) */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {FLAVORS.map((f) => (
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
