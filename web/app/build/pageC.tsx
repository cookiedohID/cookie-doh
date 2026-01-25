
/*
// web/app/build/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { addBoxToCart } from "@/lib/cart";

type BoxSize = 1 | 3 | 6;

type FlavorUI = {
  id: string;
  name: string;
  image?: string;
  ingredients?: string;
  textureTags?: string[];
  intensity?: { chocolate?: number; sweetness?: number };
  price?: number;
  badges?: string[];
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

const FLAVORS: FlavorUI[] = [
  {
    id: "the-one",
    name: "The One",
    image: "/flavors/the-one.jpg",
    ingredients:
      "Decadent dark cookie studded with creamy white Belgian chocolate chips - a bold, blissful contrast in every bite",
    textureTags: ["Soft", "Chewy"],
    intensity: { chocolate: 5, sweetness: 3 },
    price: 32500,
    badges: ["Bestseller", "Classic"],
  },
  {
    id: "the-other-one",
    name: "The Other One",
    image: "/flavors/the-other-one.jpg",
    ingredients:
      "Sinfully rich chocolate cookie loaded with dark + milk Belgian chocolate chips - pure bliss in every bite",
    textureTags: ["Earthy", "Creamy"],
    intensity: { chocolate: 4, sweetness: 4 },
    price: 32500,
    badges: ["Fan Favorite"],
  },
  {
    id: "the-comfort",
    name: "The Comfort",
    image: "/flavors/the-comfort.jpg",
    ingredients:
      "Hearty oats, plump raisins, and a warm cinnamon hug - chewy, golden and baked with old fashioned love.",
    textureTags: ["Earthy", "Creamy"],
    intensity: { chocolate: 0, sweetness: 3 },
    price: 32500,
    badges: ["The Classic"],
  },
  {
    id: "matcha-magic",
    name: "Matcha Magic",
    image: "/flavors/matcha-magic.jpg",
    ingredients:
      "Like a serene Japanese garden in cookie form: vibrant matcha, sweet chocolate clouds and pure melt-in-your-mouth magic.",
    textureTags: ["Earthy", "Creamy"],
    intensity: { chocolate: 2, sweetness: 3 },
    price: 32500,
    badges: ["Matcha Lover"],
  },
  {
    id: "orange-in-the-dark",
    name: "Orange In The Dark",
    image: "/flavors/orange-in-the-dark.jpg",
    ingredients:
      "Rich, fudgy chocolate cookie packed with dark chocolate chips and a citrusy twist of orange peel - decadence with a zing.",
    textureTags: ["Citrusy", "Creamy"],
    intensity: { chocolate: 3, sweetness: 4 },
    price: 32500,
    badges: ["Classic with a twist"],
  },
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
  const canAddMore = totalCount < boxSize;

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

  const onAddToCart = () => {
    if (totalCount === 0) return;

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

  const QtyControls = ({ id }: { id: string }) => {
    const v = qty[id] ?? 0;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* MINUS */}
/*
        <button
          type="button"
          onClick={() => dec(id)}
          disabled={v === 0}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            fontWeight: 900,
            cursor: v === 0 ? "not-allowed" : "pointer",
            opacity: v === 0 ? 0.45 : 1,
          }}
          aria-label="Decrease quantity"
        >
          −
        </button>

        {/* PLUS WITH COUNT RIGHT NEXT TO IT */}
/*
        <button
          type="button"
          onClick={() => inc(id)}
          disabled={!canAddMore}
          style={{
            height: 38,
            padding: "0 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            fontWeight: 900,
            cursor: !canAddMore ? "not-allowed" : "pointer",
            opacity: !canAddMore ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
          aria-label="Increase quantity"
        >
          <span style={{ fontSize: 16 }}>+</span>

          {/* COUNT BADGE */}
/*
          <span
            style={{
              minWidth: 26,
              height: 26,
              padding: "0 8px",
              borderRadius: 999,
              background: "#0052CC",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {v}
          </span>
        </button>
      </div>
    );
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
/*
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
                <div style={{ fontWeight: 800, color: "#101010" }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 4 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </section>

        {/* Progress */}
/*
        <section style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#3C3C3C" }}>
            <div style={{ fontWeight: 800 }}>
              You’ve added {totalCount} of {boxSize} cookies
            </div>
            <div style={{ color: "#6B6B6B", fontWeight: 800 }}>{remaining} more</div>
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
            <div style={{ marginTop: 10, color: "#6B6B6B", fontWeight: 700 }}>
              Your box is full 🤍 Remove one cookie to add another.
            </div>
          )}
        </section>

        {/* Flavor grid (inline cards) */}
/*
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {FLAVORS.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 18,
                overflow: "hidden",
                background: "#fff",
                boxShadow: "0 10px 22px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ position: "relative", width: "100%", height: 160, background: "#F5F5F5" }}>
                {f.image ? (
                  <Image
                    src={f.image}
                    alt={f.name}
                    fill
                    sizes="(max-width: 980px) 50vw, 420px"
                    style={{ objectFit: "cover" }}
                  />
                ) : null}
              </div>

              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, color: "#101010", fontSize: 16 }}>
                    {f.name}
                  </div>
                  <div style={{ fontWeight: 900, color: "#0052CC" }}>
                    {formatIDR(f.price ?? 0)}
                  </div>
                </div>

                {f.ingredients ? (
                  <div style={{ marginTop: 6, color: "#6B6B6B", fontWeight: 700, fontSize: 12, lineHeight: 1.35 }}>
                    {f.ingredients}
                  </div>
                ) : null}

                {f.textureTags?.length ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {f.textureTags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "rgba(0,82,204,0.08)",
                          border: "1px solid rgba(0,0,0,0.08)",
                          color: "#101010",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <QtyControls id={f.id} />
                  <div style={{ fontWeight: 900, color: "#6B6B6B", fontSize: 12 }}>
                    Selected: {qty[f.id] ?? 0}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Sticky bottom bar */}
/*
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
            <div style={{ fontWeight: 900, color: "#101010" }}>
              Box of {boxSize} • Choose {Math.max(0, boxSize - totalCount)} more
            </div>

            <div style={{ color: "#6B6B6B", fontWeight: 900 }}>
              Total: {formatIDR(totalCount === boxSize ? totalPrice : 0)}
            </div>
          </div>

          <button
            onClick={onAddToCart}
            disabled={totalCount !== boxSize}
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: totalCount !== boxSize ? "not-allowed" : "pointer",
              background: totalCount !== boxSize ? "rgba(0,82,204,0.45)" : "#0052CC",
              color: "#fff",
              fontWeight: 900,
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
*/