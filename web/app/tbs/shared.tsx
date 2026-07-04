"use client";

// web/app/tbs/shared.tsx — shared bits of the TotalBuahStore shop (brand
// constants, category naming, basket storage) used by the storefront and the
// product detail pages.
import { useEffect, useState } from "react";

export const RED = "#9c1216";
export const GREEN = "#135232";
export const CREAM = "#F7F9F5";

export type BasketLine = { sku: string; name: string; price: number; unit: string; qty: number };

export const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

// Friendly names for the ERP's raw class codes.
export const CAT_META: Record<string, { label: string; emoji: string }> = {
  "BUAH IMPOR": { label: "Imported Fruits", emoji: "🍎" },
  "BUAH LOCAL": { label: "Local Fruits", emoji: "🍌" },
  "BUAH EXOR": { label: "Exotic Fruits", emoji: "🐉" },
  "BUAH EXOX": { label: "Exotic Fruits II", emoji: "🥭" },
  "SEASONAL": { label: "Seasonal Picks", emoji: "🍇" },
  "KONS SAYUR": { label: "Vegetables", emoji: "🥬" },
  "SYR LOCAL": { label: "Local Vegetables", emoji: "🥦" },
  "SYR IMPORT": { label: "Imported Vegetables", emoji: "🥕" },
  "SYR PASAR": { label: "Market Vegetables", emoji: "🌽" },
  "SNACK LOCA": { label: "Indonesian Snacks", emoji: "🍘" },
  "SNACK IMPO": { label: "Imported Snacks", emoji: "🍫" },
  "SNACK LAKU": { label: "Best-Selling Snacks", emoji: "🍿" },
  "KONS SNACK": { label: "Snacks & Treats", emoji: "🥨" },
  "FROZEN": { label: "Frozen Food", emoji: "🧊" },
  "FRZ LOC": { label: "Frozen Local", emoji: "❄️" },
  "FRZ IMP": { label: "Frozen Import", emoji: "🥶" },
  "BEAUTYCARE": { label: "Beauty & Care", emoji: "🧴" },
  "PROD JUS": { label: "Juices", emoji: "🧃" },
  "PROD BUAH": { label: "Fruit Products", emoji: "🍯" },
  "SPC CMDTS": { label: "Specialty", emoji: "🌾" },
  "KONS STAT": { label: "Household", emoji: "🧺" },
};
export const catLabel = (id: string | null) => (id && CAT_META[id]?.label) || id || "";
export const catEmoji = (id: string | null) => (id && CAT_META[id]?.emoji) || "🛒";

// Deterministic soft tile colour per category (no product photos yet).
export function tileColors(cat: string | null): { bg: string; fg: string } {
  const palette = [
    { bg: "#EAF3E7", fg: GREEN }, { bg: "#FBEFEA", fg: RED },
    { bg: "#F3EFE2", fg: "#7a5c00" }, { bg: "#E7F0F3", fg: "#0f5a6e" },
    { bg: "#F0EAF5", fg: "#5b3a80" },
  ];
  let h = 0;
  for (const ch of cat || "x") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function TbsCherry({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round((size * 30) / 26)} viewBox="0 0 26 30" aria-hidden="true">
      <path d="M12 14 C 12 9, 14 6, 17 4" stroke={GREEN} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M17 4 C 22 1, 25 4, 21 7 C 18 6, 18 6, 17 4 Z" fill="#4aa02c" />
      <circle cx="11" cy="20" r="8" fill="#b0201d" />
      <circle cx="8" cy="17" r="2" fill="#d76b62" />
    </svg>
  );
}

export function loadBasket(store: string): Record<string, BasketLine> {
  try {
    const raw = JSON.parse(localStorage.getItem("tbs_basket") || "null");
    if (raw && raw.store === store && raw.items) return raw.items;
  } catch { /* ignore */ }
  return {};
}
export function saveBasket(store: string, items: Record<string, BasketLine>) {
  try {
    localStorage.setItem("tbs_basket", JSON.stringify({ store, items }));
    window.dispatchEvent(new Event("tbs-basket"));
  } catch { /* ignore */ }
}

// Shop visibility gate (flag or admin preview) — shared by all TBS pages.
export function useTbsGate(): { gate: "loading" | "hidden" | "open"; preview: boolean } {
  const [gate, setGate] = useState<"loading" | "hidden" | "open">("loading");
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    fetch("/api/tbs/enabled", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.enabled) { setPreview(Boolean(j.preview)); setGate("open"); } else setGate("hidden"); })
      .catch(() => setGate("hidden"));
  }, []);
  return { gate, preview };
}

export function ComingSoon() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <TbsCherry size={44} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: GREEN, margin: "10px 0 4px" }}>TotalBuahStore is coming soon</h1>
        <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.6 }}>Fresh fruit & groceries from Total Buah — right here on Cookie Doh. Stay tuned 🍒</p>
      </div>
    </main>
  );
}

export const TBS_FALLBACK_STORES = [
  { code: "TBS-RCV", name: "RC Veteran (Bintaro)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-KTR", name: "Karang Tengah (Lebak Bulus)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-XMAS", name: "Bekasi (KH Noer Ali)", city: "Bekasi", items: 0 },
];
