"use client";

// web/app/build/BuildClient.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addBoxToCart } from "@/lib/cart";
import { BOX_PRICES, FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";

type BoxSize = 3 | 6;

const COLORS = {
  blue: "#0014A7",
  black: "#101010",
  white: "#FFFFFF",
  orange: "#FF5A00",
};

const COOKIE_PRICE = 32500;

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const BOX_OPTIONS: { size: BoxSize; title: string; desc: string }[] = [
  { size: 3, title: "3 cookies", desc: "Perfect for a little treat" },
  { size: 6, title: "6 cookies", desc: "Just right for sharing" },
];

export default function BuildClient({ initialBoxSize = 6 }: { initialBoxSize?: BoxSize }) {
  const router = useRouter();

  // ✅ Hard lock to Kemang for go-live
  const STORE_ID = "kemang";

  const [stock, setStock] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStockLoading(true);
      setStockError(null);
      try {
        const res = await fetch(`/api/stock/availability?store_id=${STORE_ID}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok !== true) throw new Error(j?.error || "Failed to load stock");
        setStock(j?.stock && typeof j.stock === "object" ? j.stock : {});
      } catch (e: any) {
        setStock({});
        setStockError(e?.message || "Failed to load stock");
      } finally {
        setStockLoading(false);
      }
    })();
  }, []);

  const [boxSize, setBoxSize] = useState<BoxSize>(initialBoxSize);
  const [qty, setQty] = useState<Record<string, number>>({});

  const pulseKeyRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);

  const cardFlavors = useMemo(() => {
    return CATALOG_FLAVORS.map((f: any) => {
      const fid = String(f.id);
      const available = Number(stock?.[fid] ?? 0);
      const soldOut = stockLoading ? true : available <= 0;

      const out: CardFlavorUI = {
        id: fid,
        name: String(f.name ?? ""),
        image: String(f.image ?? ""),
        ingredients: String(f.description ?? ""),
        textureTags: Array.isArray(f.tags) ? f.tags : [],
        intensity: f.intensity,
        badges: Array.isArray(f.badges) ? f.badges : [],
        price: COOKIE_PRICE,
        soldOut,
      };
      return out;
    });
  }, [stock, stockLoading]);

  // When stock loads, remove selections that became unavailable
  useEffect(() => {
    if (stockLoading) return;
    setQty((prev) => {
      const next: Record<string, number> = { ...prev };
      let changed = false;
      for (const fid of Object.keys(next)) {
        const selected = next[fid] ?? 0;
        if (selected <= 0) continue;
        const available = Number(stock?.[fid] ?? 0);
        if (available <= 0) {
          delete next[fid];
          changed = true;
        } else if (selected > available) {
          next[fid] = available;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stockLoading, stock]);

  const totalCount = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  const remaining = Math.max(0, boxSize - totalCount);
  const canAddMore = totalCount < boxSize;
  const isFull = remaining === 0;
  const isEmpty = totalCount === 0;

  const totalPrice = useMemo(() => (isFull ? BOX_PRICES[boxSize] : 0), [boxSize, isFull]);

  const inc = (id: string) => {
    if (!canAddMore) return;
    if (stockLoading) return;

    const available = Number(stock?.[id] ?? 0);
    const current = qty[id] ?? 0;

    if (available <= 0) return;
    if (current + 1 > available) return;

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
    if (stockLoading) return;

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

  const bannerText = isFull
    ? "Box complete"
    : isEmpty
      ? "Start adding cookies you love"
      : `Add ${remaining} more`;

  const bannerBg = isFull ? "rgba(0,0,0,0.03)" : "rgba(0,20,167,0.06)";
  const bannerBorder = isFull ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(0,20,167,0.25)";

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <style>{`
        @keyframes cd_pulse { 0% { transform: scale(0.985); } 100% { transform: scale(1); } }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 140px" }}>
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Build your cookie box</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>
            Mix and match your favourites. Freshly baked, packed with care.
          </p>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 12 }}>
            Stock is currently based on: <b>Kemang</b>
          </div>

          {stockError ? (
            <div style={{ marginTop: 10, color: "crimson", fontWeight: 900 }}>
              Stock error: {stockError}
            </div>
          ) : null}
        </header>

        {/* Box size cards */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
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
                  background: active ? "rgba(0,20,167,0.06)" : "#FAF7F2",
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
              <div style={{ color: "#3C3C3C", fontWeight: 900 }}>
                {stockLoading ? "Checking stock…" : bannerText}
              </div>
            </div>

            {!isFull && !stockLoading && (
              <div style={{ fontWeight: 950, color: COLORS.orange, whiteSpace: "nowrap" }}>
                {remaining} left
              </div>
            )}
          </div>
        </section>

        {/* Flavor grid */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {cardFlavors.map((f) => {
            const available = Number(stock?.[f.id] ?? 0);
            const selected = qty[f.id] ?? 0;
            const hitLimit = !stockLoading && available > 0 && selected >= available;

            return (
              <ProductCard
                key={f.id}
                flavor={f}
                quantity={selected}
                onAdd={() => inc(f.id)}
                onRemove={() => dec(f.id)}
                disabledAdd={stockLoading || !canAddMore || f.soldOut || hitLimit}
                addLabel={stockLoading ? "Loading…" : f.soldOut ? "Sold out" : hitLimit ? "Limit reached" : "Add to box"}
              />
            );
          })}
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
              {stockLoading ? "Checking stock…" : isFull ? "Box complete" : `Add ${remaining} more`}
            </div>

            <div style={{ color: "#6B6B6B", fontWeight: 900 }}>
              Total: {formatIDR(!stockLoading && isFull ? totalPrice : 0)}
            </div>
          </div>

          <button
            onClick={onAddToCart}
            disabled={stockLoading || !isFull}
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 999,
              height: 52,
              border: "none",
              cursor: stockLoading || !isFull ? "not-allowed" : "pointer",
              background: stockLoading || !isFull ? "rgba(0,20,167,0.45)" : COLORS.blue,
              color: COLORS.white,
              fontWeight: 900,
              fontSize: 16,
              boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
            }}
          >
            Add box to cart
          </button>

          <div style={{ marginTop: 8, color: "#6B6B6B", fontWeight: 800, fontSize: 12, textAlign: "center" }}>
            Stock is based on Kemang for initial go-live.
          </div>
        </div>
      </div>
    </main>
  );
}
