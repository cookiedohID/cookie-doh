// web/app/assortments/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";
import { addBoxToCart, type CartBox } from "@/lib/cart";
import { parsePickupPoints, useStoreStock } from "@/lib/storeStock";

type BoxSize = 3 | 6;
type PresetItem = { flavorId: string; qty: number };
type Preset = { key: string; title: string; badge: string; boxSize: BoxSize; items: PresetItem[]; note?: string };

type SeasonalSettings = { enabled: boolean; seasonStart: string; seasonEnd: string };

const DEFAULTS: SeasonalSettings = { enabled: false, seasonStart: "2026-01-15", seasonEnd: "2026-02-20" };

const COLORS = { blue: "#0014A7", orange: "#FF5A00", black: "#101010", white: "#FFFFFF", sand: "#FAF7F2" };
const COOKIE_PRICE = 32500;

function safeGetName(id: string) {
  const f = FLAVORS.find((x: any) => x.id === id);
  return f?.name ?? id;
}

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

  return { boxSize, items: cartItems, total: BOX_PRICES[boxSize] };
}

function presetFitsStock(items: PresetItem[], stock: Record<string, number>) {
  for (const it of items) {
    const available = Number(stock?.[it.flavorId] ?? 0);
    if (available < it.qty) return false;
  }
  return true;
}

export default function AssortmentsPage() {
  const router = useRouter();
  const today = useMemo(() => jakartaTodayYMD(), []);

  const SHOW_STORE_SELECTOR =
    String(process.env.NEXT_PUBLIC_SHOW_STORE_SELECTOR || "").toLowerCase() === "true";

  const points = useMemo(() => parsePickupPoints(process.env.NEXT_PUBLIC_PICKUP_POINTS_JSON), []);
  const { storeId, setStore, storeName, stock, loading: stockLoading } = useStoreStock(points);

  useEffect(() => {
    if (!SHOW_STORE_SELECTOR && storeId !== "kemang") setStore("kemang");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SHOW_STORE_SELECTOR, storeId]);

  const [settings, setSettings] = useState<SeasonalSettings>(DEFAULTS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/assortments/settings", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const s = j?.settings;

        if (s && typeof s === "object") {
          setSettings({
            enabled: Boolean((s as any).enabled),
            seasonStart: String((s as any).seasonStart || DEFAULTS.seasonStart),
            seasonEnd: String((s as any).seasonEnd || DEFAULTS.seasonEnd),
          });
        } else {
          setSettings(DEFAULTS);
        }
      } catch {
        setSettings(DEFAULTS);
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

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

  const seasonalPreset = useMemo(() => {
    const active = !!settings.enabled && inRange(today, settings.seasonStart, settings.seasonEnd);
    return {
      key: "seasonal-limited",
      active,
      title: "Seasonal · Limited Assortment",
      badge: "Limited",
      boxSize: 6 as const,
      items: [
        { flavorId: "the-one", qty: 2 },
        { flavorId: "the-other-one", qty: 2 },
        { flavorId: "orange-in-the-dark", qty: 1 },
        { flavorId: "the-comfort", qty: 1 },
      ] as PresetItem[],
      note: "Limited window — while batches last.",
    };
  }, [settings.enabled, settings.seasonStart, settings.seasonEnd, today]);

  const presets: Preset[] = useMemo(() => {
    const out = [...basePresets];
    if (seasonalPreset.active) out.unshift(seasonalPreset as any);
    return out;
  }, [basePresets, seasonalPreset]);

  function addPreset(boxSize: BoxSize, items: PresetItem[]) {
    const ok = presetFitsStock(items, stock);
    if (!ok) return;
    addBoxToCart(presetToCartBox(boxSize, items));
    router.push("/cart");
  }

  return (
    <main style={{ background: COLORS.white, minHeight: "100vh" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px" }}>
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: COLORS.black }}>
            Assortments
          </h1>
          <p style={{ marginTop: 6, color: "#6B6B6B" }}>
            Ready-made boxes — easy choices, crowd favorites.
          </p>

          {!SHOW_STORE_SELECTOR && (
            <div style={{ marginTop: 6, color: "rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 12 }}>
              Stock is currently based on: <b>Kemang</b>
            </div>
          )}
        </header>

        {SHOW_STORE_SELECTOR && (
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
                {stockLoading ? "Checking stock…" : `Stock for: ${storeName}`}
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
        )}

        {settingsLoaded && settings.enabled && (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.10)",
              background: seasonalPreset.active ? "rgba(255,90,0,0.08)" : "rgba(0,0,0,0.03)",
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 950, color: COLORS.black }}>
              Seasonal window: {settings.seasonStart} → {settings.seasonEnd}
            </div>
            <div style={{ marginTop: 6, color: "rgba(0,0,0,0.70)", lineHeight: 1.5 }}>
              {seasonalPreset.active ? "Seasonal assortment is live." : "Seasonal assortment is currently off (out of window)."}
            </div>
          </section>
        )}

        <section style={{ display: "grid", gap: 14 }}>
          {presets.map((p) => {
            const ok = presetFitsStock(p.items, stock);

            return (
              <article
                key={p.key}
                style={{
                  borderRadius: 18,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: COLORS.sand,
                  padding: 16,
                  opacity: ok ? 1 : 0.85,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 16, color: COLORS.black }}>
                      {p.title}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.70)", lineHeight: 1.4 }}>
                      {p.items.map((i) => `${safeGetName(i.flavorId)}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(" • ")}
                    </div>

                    {!ok && (
                      <div style={{ marginTop: 8, color: "rgba(0,0,0,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Some items are sold out ({SHOW_STORE_SELECTOR ? storeName : "Kemang"}).
                      </div>
                    )}

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
                    disabled={!ok}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "12px 16px",
                      background: !ok ? "rgba(0,20,167,0.45)" : COLORS.blue,
                      color: COLORS.white,
                      fontWeight: 950,
                      cursor: !ok ? "not-allowed" : "pointer",
                    }}
                  >
                    {!ok ? "Unavailable" : "Add to cart"}
                  </button>
                </div>
              </article>
            );
          })}
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
