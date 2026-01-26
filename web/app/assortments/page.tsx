// web/app/assortments/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";
import { addBoxToCart, type CartBox } from "@/lib/cart";

type BoxSize = 3 | 6;
type PresetItem = { flavorId: string; qty: number };

type Preset = {
  key: string;
  title: string;
  badge: string;
  boxSize: BoxSize;
  items: PresetItem[];
  note?: string;
};

const COLORS = {
  blue: "#0052CC",
  orange: "#FF5A00",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

const COOKIE_PRICE = 32500;

// YYYY-MM-DD in Asia/Jakarta
function jakartaTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function inRange(today: string, start: string, end: string) {
  return today >= start && today <= end;
}

function safeGetName(id: string) {
  const f = FLAVORS.find((x: any) => x.id === id);
  return f?.name ?? id;
}

function presetToCartBox(boxSize: BoxSize, items: PresetItem[]): CartBox {
  const cartItems = items
    .map((x) => {
      const f = FLAVORS.find((ff: any) => ff.id === x.flavorId);
      if (!f) return null;
      return {
        id: String(f.id),
        name: String(f.name),
        image: String(f.image ?? ""),
        quantity: Number(x.qty),
        price: COOKIE_PRICE,
      };
    })
    .filter(Boolean) as CartBox["items"];

  return {
    boxSize,
    items: cartItems,
    total: BOX_PRICES[boxSize], // ✅ typed
  };
}

export default function AssortmentsPage() {
  const router = useRouter();
  const today = useMemo(() => jakartaTodayYMD(), []);

  const basePresets: Preset[] = useMemo(
    () => [
      {
        key: "box3-crowd",
        title: "Box of 3 · Crowd Favorites",
        badge: "Bestseller",
        boxSize: 3,
        items: [
          { flavorId: "the-one", qty: 1 },
          { flavorId: "the-other-one", qty: 1 },
          { flavorId: "matcha-magic", qty: 1 },
        ],
      },
      {
        key: "box6-bestmix",
        title: "Box of 6 · Best Mix",
        badge: "Fan Favorite",
        boxSize: 6,
        items: [
          { flavorId: "the-one", qty: 2 },
          { flavorId: "the-other-one", qty: 2 },
          { flavorId: "matcha-magic", qty: 1 },
          { flavorId: "the-comfort", qty: 1 },
        ],
      },
    ],
    []
  );

  // Seasonal logic (example dates; edit anytime)
  const seasonalPreset = useMemo(() => {
    const seasonStart = "2026-01-15";
    const seasonEnd = "2026-02-20";
    const active = inRange(today, seasonStart, seasonEnd);

    const preset: Preset = {
      key: "seasonal-limited",
      title: "Seasonal · Limited Assortment",
      badge: "Limited",
      boxSize: 6,
      items: [
        { flavorId: "the-one", qty: 2 },
        { flavorId: "the-other-one", qty: 2 },
        { flavorId: "orange-in-the-dark", qty: 1 },
        { flavorId: "the-comfort", qty: 1 },
      ],
      note: "Limited window — while batches last.",
    };

    return { active, seasonStart, seasonEnd, preset };
  }, [today]);

  const presets: Preset[] = useMemo(() => {
    const out = [...basePresets];
    if (seasonalPreset.active) out.unshift(seasonalPreset.preset);
    return out;
  }, [basePresets, seasonalPreset]);

  function addPreset(boxSize: BoxSize, items: PresetItem[]) {
    const box = presetToCartBox(boxSize, items);
    addBoxToCart(box);
    router.push("/cart");
  }

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: COLORS.black }}>
            Assortments
          </h1>
          <p style={{ marginTop: 6, color: "#6B6B6B" }}>
            Ready-made boxes — easy choices, crowd favorites.
          </p>
        </header>

        {/* Seasonal banner (only when active) */}
        {seasonalPreset.active && (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,90,0,0.08)",
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 950, color: COLORS.black }}>Seasonal drop is live</div>
            <div style={{ marginTop: 6, color: "rgba(0,0,0,0.70)", lineHeight: 1.5 }}>
              Limited window: {seasonalPreset.seasonStart} → {seasonalPreset.seasonEnd}
            </div>
          </section>
        )}

        <section style={{ display: "grid", gap: 14 }}>
          {presets.map((p) => (
            <article
              key={p.key}
              style={{
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                background: COLORS.sand,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950, fontSize: 16, color: COLORS.black }}>
                    {p.title}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.70)", lineHeight: 1.4 }}>
                    {p.items
                      .map((i) => `${safeGetName(i.flavorId)}${i.qty > 1 ? ` ×${i.qty}` : ""}`)
                      .join(" • ")}
                  </div>

                  {p.note ? (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.65)" }}>
                      {p.note}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 950,
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.badge}
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 950, color: COLORS.black }}>
                  IDR {BOX_PRICES[p.boxSize].toLocaleString("id-ID")}
                </div>

                <button
                  onClick={() => addPreset(p.boxSize, p.items)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "12px 16px",
                    background: COLORS.blue,
                    color: COLORS.white,
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  Add to cart
                </button>
              </div>
            </article>
          ))}
        </section>

        <div style={{ marginTop: 24 }}>
          <Link href="/build" style={{ color: COLORS.blue, fontWeight: 950, textDecoration: "none" }}>
            Want full control? Build your own box →
          </Link>
        </div>
      </div>
    </main>
  );
}
