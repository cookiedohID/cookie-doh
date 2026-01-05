"use client";

import { useMemo, useState } from "react";
import { BOX_PRICES, FLAVORS, formatIDR } from "@/lib/catalog";
import { useParams, useRouter } from "next/navigation";

type CartItem = {
  boxSize: number;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
};

function getSizeParam(size: string | string[] | undefined): number {
  const s = Array.isArray(size) ? size[0] : size;
  const n = Number(s);
  return [1, 3, 6].includes(n) ? n : 6;
}

export default function BuildPage() {
  const params = useParams<{ size: string }>();
  const router = useRouter();
  const boxSize = getSizeParam(params?.size);
  const price = BOX_PRICES[boxSize];

  const [showLimited, setShowLimited] = useState(false);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const visibleFlavors = useMemo(() => {
    return FLAVORS.filter((f) => showLimited || f.badge !== "limited");
  }, [showLimited]);

  const selectedCount = useMemo(() => {
    return Object.values(qtyMap).reduce((a, b) => a + b, 0);
  }, [qtyMap]);

  const canAddMore = selectedCount < boxSize;

  function inc(id: string) {
    setQtyMap((prev) => {
      const current = prev[id] ?? 0;
      if (!canAddMore) return prev;
      return { ...prev, [id]: current + 1 };
    });
  }

  function dec(id: string) {
    setQtyMap((prev) => {
      const current = prev[id] ?? 0;
      if (current <= 0) return prev;
      const next = { ...prev, [id]: current - 1 };
      if (next[id] === 0) delete next[id];
      return next;
    });
  }

  const summaryLines = useMemo(() => {
    const lines: { label: string; qty: number }[] = [];
    for (const [flavorId, qty] of Object.entries(qtyMap)) {
      const flavor = FLAVORS.find((f) => f.id === flavorId);
      if (flavor && qty > 0) lines.push({ label: flavor.name, qty });
    }
    // keep stable order by FLAVORS
    lines.sort(
      (a, b) =>
        FLAVORS.findIndex((f) => f.name === a.label) -
        FLAVORS.findIndex((f) => f.name === b.label)
    );
    return lines;
  }, [qtyMap]);

  function addToCart() {
    if (selectedCount !== boxSize) return;

    const item: CartItem = {
      boxSize,
      price,
      items: Object.entries(qtyMap).map(([flavorId, qty]) => ({
        flavorId,
        qty,
      })),
      createdAt: Date.now(),
    };

    const key = "cookieDohCart";
    const existingRaw = localStorage.getItem(key);
    const existing = existingRaw ? (JSON.parse(existingRaw) as CartItem[]) : [];
    localStorage.setItem(key, JSON.stringify([item, ...existing]));

    router.push("/cart");
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ position: "sticky", top: 0, background: "#fff", paddingTop: 12, paddingBottom: 12, zIndex: 10 }}>
        <h1 style={{ margin: 0 }}>Build your box ✨</h1>
        <p style={{ margin: "8px 0 12px" }}>
          Free choice. Duplicate favorites welcome.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>
            Selected:{" "}
            <span style={{ color: selectedCount === boxSize ? "var(--brand-blue)" : "inherit" }}>
              {selectedCount} / {boxSize}
            </span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowLimited(false)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: showLimited ? "#fff" : "var(--brand-blue)",
                color: showLimited ? "#111" : "#fff",
                cursor: "pointer",
              }}
            >
              Regular
            </button>
            <button
              onClick={() => setShowLimited(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: showLimited ? "var(--brand-blue)" : "#fff",
                color: showLimited ? "#fff" : "#111",
                cursor: "pointer",
              }}
            >
              🌸 Limited
            </button>
          </div>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 18,
        }}
      >
        {visibleFlavors.map((f) => {
          const q = qtyMap[f.id] ?? 0;
          const isLimited = f.badge === "limited";
          const isBest = f.badge === "best";
          return (
            <div
              key={f.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{f.name}</strong>
                {isBest && (
                  <span
                    style={{
                      border: "1px solid var(--brand-blue)",
                      color: "var(--brand-blue)",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ⭐ Best Seller
                  </span>
                )}
                {isLimited && (
                  <span
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    🌸 Limited
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => dec(f.id)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: q > 0 ? "pointer" : "not-allowed",
                    opacity: q > 0 ? 1 : 0.5,
                  }}
                  disabled={q === 0}
                >
                  –
                </button>
                <div style={{ minWidth: 22, textAlign: "center", fontWeight: 700 }}>
                  {q}
                </div>
                <button
                  onClick={() => inc(f.id)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: canAddMore ? "var(--brand-blue)" : "#eee",
                    color: canAddMore ? "#fff" : "#888",
                    cursor: canAddMore ? "pointer" : "not-allowed",
                  }}
                  disabled={!canAddMore}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Sticky bottom summary */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 24,
          background: "#fff",
          borderTop: "1px solid #eee",
          padding: "14px 0",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px" }}>
            <div style={{ fontWeight: 700 }}>Your box</div>
            {summaryLines.length === 0 ? (
              <div style={{ color: "#666" }}>Your box is waiting…</div>
            ) : (
              <div style={{ color: "#333" }}>
                {summaryLines.map((l) => (
                  <div key={l.label}>
                    {l.qty}× {l.label}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Made without nuts as ingredients. Prepared in a kitchen that also handles nuts.
            </div>
          </div>

          <div style={{ minWidth: 220, textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              IDR {formatIDR(price)}
            </div>
            <button
              onClick={addToCart}
              disabled={selectedCount !== boxSize}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "none",
                background: selectedCount === boxSize ? "var(--brand-blue)" : "#eee",
                color: selectedCount === boxSize ? "#fff" : "#777",
                fontWeight: 700,
                cursor: selectedCount === boxSize ? "pointer" : "not-allowed",
              }}
            >
              {selectedCount === boxSize
                ? "Add to cart"
                : `Select ${boxSize - selectedCount} more cookies 😌`}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
