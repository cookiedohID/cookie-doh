// web/app/build/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProductCard, { FlavorUI } from "@/components/ProductCard";
import { addBoxToCart } from "@/lib/cart";
import build from "next/dist/build";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type BoxSize = 3 | 6 | 12;

const BOX_OPTIONS: { size: BoxSize; title: string; desc: string }[] = [
  { size: 3, title: "3 cookies", desc: "Perfect for a little treat" },
  { size: 6, title: "6 cookies", desc: "Just right for sharing" },
  { size: 12, title: "12 cookies", desc: "For serious cookie lovers" },
];

// ✅ Replace this list with your real flavors if you already have FLAVORS.
// If you already have `FLAVORS` somewhere, you can swap this constant to import it.
const FLAVORS: FlavorUI[] = [
  {
    id: "the-one",
    name: "The One",
    image: "/flavors/the-one.jpg",
    ingredients:
      "European butter, white chocolate, extra dark cocoa, bourbon vanilla, sea salt flakes",
    textureTags: ["Soft", "Chewy"],
    intensity: { chocolate: 5, sweetness: 3 },
    price: 30000,
    badges: ["Bestseller", "Classic"],
  },
  {
    id: "the-other-one",
    name: "The Other One",
    image: "/flavors/the-other-one.jpg",
    ingredients: "European butter, mixed chocolate chips, vanilla, sea salt",
    textureTags: ["Earthy", "Creamy"],
    intensity: { chocolate: 4, sweetness: 4 },
    price: 30000,
    badges: ["Fan Favorite"],
  },
  // Add your other flavors here...
];

export default function BuildABoxPage() {
  const router = useRouter();

  const [boxSize, setBoxSize] = useState<BoxSize>(6);
  const [qty, setQty] = useState<Record<string, number>>({});

  const totalCount = useMemo(
    () => Object.values(qty).reduce((a, b) => a + b, 0),
    [qty]
  );

  const remaining = Math.max(0, boxSize - totalCount);

  const totalPrice = useMemo(() => {
    let sum = 0;
    for (const f of FLAVORS) sum += (qty[f.id] ?? 0) * f.price;
    return sum;
  }, [qty]);

  const canAddMore = totalCount < boxSize;

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
    if (totalCount === 0) return;

    // Normalize items
    const items = FLAVORS.filter((f) => (qty[f.id] ?? 0) > 0).map((f) => ({
      id: f.id,
      name: f.name,
      price: f.price,
      quantity: qty[f.id] ?? 0,
      image: f.image,
    }));

    addBoxToCart({
      boxSize,
      items,
      total: totalPrice,
    });

    router.push("/cart");
  };

  return (
    <main style={{ background: "#fff", minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 120px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "#101010" }}>
            Build your cookie box
          </h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>
            Mix and match your favorites. Freshly baked, packed with care.
          </p>
        </header>

        {/* Box size cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 18,
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
                }}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: active ? "2px solid #0052CC" : "1px solid rgba(0,0,0,0.10)",
                  background: active ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, color: "#101010" }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </section>

        {/* Progress */}
        <section style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#3C3C3C" }}>
            <div style={{ fontWeight: 600 }}>
              You’ve added {totalCount} of {boxSize} cookies
            </div>
            <div style={{ color: "#6B6B6B" }}>{remaining} more</div>
          </div>
          <div
            style={{
              marginTop: 10,
              height: 10,
              borderRadius: 999,
              background: "rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (totalCount / boxSize) * 100)}%`,
                background: "#0052CC",
                borderRadius: 999,
              }}
            />
          </div>

          {!canAddMore && (
            <div style={{ marginTop: 10, color: "#6B6B6B" }}>
              Your box is full 🤍 Remove one cookie to add another.
            </div>
          )}
        </section>

        {/* Grid */}
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
          background: "#fff",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.05)",
          padding: "12px 14px",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 700, color: "#101010" }}>
              Box of {boxSize} • Choose {Math.max(0, boxSize - totalCount)} more
            </div>
            <div style={{ color: "#6B6B6B" }}>Total: {formatIDR(totalPrice)}</div>
          </div>

          <button
            onClick={onAddToCart}
            disabled={totalCount === 0}
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: totalCount === 0 ? "not-allowed" : "pointer",
              background: totalCount === 0 ? "rgba(0,82,204,0.45)" : "#0052CC",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
            }}
          >
            Add to cart
          </button>
        </div>
      </div>
    </main>
  );
}
