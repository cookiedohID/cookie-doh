"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BOX_PRICES, FLAVORS, formatIDR } from "@/lib/catalog";

type CartItem = {
  boxSize: number;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
  giftNote?: string;
};

const CART_KEY = "cookieDohCart";

function clampSize(v: string | string[] | undefined): 1 | 3 | 6 | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  if (n === 1 || n === 3 || n === 6) return n;
  return null;
}

export default function BuildSizePage() {
  const router = useRouter();
  const params = useParams();
  const size = clampSize(params?.size);

  const [qtyByFlavor, setQtyByFlavor] = useState<Record<string, number>>({});

  const pickedCount = useMemo(() => {
    return Object.values(qtyByFlavor).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }, [qtyByFlavor]);

  const remaining = (size ?? 0) - pickedCount;

  const selections = useMemo(() => {
    return Object.entries(qtyByFlavor)
      .filter(([, q]) => (q || 0) > 0)
      .map(([flavorId, qty]) => ({ flavorId, qty }));
  }, [qtyByFlavor]);

  function inc(flavorId: string) {
    if (!size) return;
    if (remaining <= 0) return;
    setQtyByFlavor((prev) => ({ ...prev, [flavorId]: (prev[flavorId] || 0) + 1 }));
  }

  function dec(flavorId: string) {
    setQtyByFlavor((prev) => {
      const next = { ...prev };
      const cur = next[flavorId] || 0;
      if (cur <= 1) delete next[flavorId];
      else next[flavorId] = cur - 1;
      return next;
    });
  }

  function addToCart() {
    if (!size) return;
    if (pickedCount !== size) return;

    const item: CartItem = {
      boxSize: size,
      items: selections,
      price: BOX_PRICES[size],
      createdAt: Date.now(),
    };

    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const current: CartItem[] = Array.isArray(parsed) ? parsed : [];
      localStorage.setItem(CART_KEY, JSON.stringify([item, ...current]));
    } catch {
      // if storage fails, still try to proceed
    }

    router.push("/cart");
  }

  if (!size) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>Build your box</h1>
        <p>Invalid size.</p>
        <Link href="/build" style={{ color: "var(--brand-blue)" }}>
          ← Back to sizes
        </Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Box of {size}</h1>
          <div style={{ color: "#444" }}>
            Price: <strong>IDR {formatIDR(BOX_PRICES[size])}</strong>
          </div>
          <div style={{ marginTop: 6, color: remaining >= 0 ? "#444" : "crimson" }}>
            Pick {size} cookies. Remaining: <strong>{remaining}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/build"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            ← Change size
          </Link>

          <button
            type="button"
            onClick={addToCart}
            disabled={pickedCount !== size}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "var(--brand-blue)",
              color: "#fff",
              fontWeight: 800,
              cursor: pickedCount === size ? "pointer" : "not-allowed",
              opacity: pickedCount === size ? 1 : 0.6,
            }}
          >
            Add to cart
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {FLAVORS.map((f) => {
          const q = qtyByFlavor[f.id] || 0;
          return (
            <div
              key={f.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800 }}>{f.name}</div>
              {f.description && <div style={{ color: "#444", fontSize: 14 }}>{f.description}</div>}

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={() => dec(f.id)}
                  disabled={q === 0}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: q === 0 ? "not-allowed" : "pointer",
                    opacity: q === 0 ? 0.5 : 1,
                    fontWeight: 900,
                  }}
                >
                  −
                </button>

                <div style={{ minWidth: 24, textAlign: "center", fontWeight: 800 }}>{q}</div>

                <button
                  type="button"
                  onClick={() => inc(f.id)}
                  disabled={remaining <= 0}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: remaining <= 0 ? "not-allowed" : "pointer",
                    opacity: remaining <= 0 ? 0.5 : 1,
                    fontWeight: 900,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
