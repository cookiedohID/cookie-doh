"use client";

// web/app/tbs/shared.tsx — shared bits of the TotalBuahStore shop (brand
// constants, category naming, basket storage) used by the storefront and the
// product detail pages.
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

// Record "notify me" interest for an out-of-stock item (demand signal + ping).
export async function notifyMe(store: string, sku: string, name: string, authToken?: string | null): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const r = await fetch("/api/tbs/notify-me", { method: "POST", headers, body: JSON.stringify({ store, sku, name }) });
    const j = await r.json().catch(() => ({}));
    return Boolean(j?.ok);
  } catch { return false; }
}

import Link from "next/link";

export const RED = "#9c1216";
export const GREEN = "#135232";
export const CREAM = "#F7F9F5";

export type BasketLine = { sku: string; name: string; price: number; unit: string; qty: number; uom?: string };

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
    if (raw && raw.store === store && raw.items) {
      // sanitize: a corrupt line (non-finite qty/price from an old bug or a
      // hand-edited localStorage) must never reach checkout
      const clean: Record<string, BasketLine> = {};
      for (const [k, v] of Object.entries(raw.items as Record<string, BasketLine>)) {
        const qty = Math.round(Number(v?.qty));
        const price = Math.round(Number(v?.price));
        if (!v?.sku || !Number.isFinite(qty) || qty < 1 || !Number.isFinite(price) || price < 0) continue;
        clean[k] = { ...v, qty: Math.min(99, qty), price };
      }
      return clean;
    }
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
  const { t } = useLang();
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await fetch(`/api/tbs/preview?key=${encodeURIComponent(key.trim())}`, { redirect: "manual" });
      const j = await (await fetch("/api/tbs/enabled", { cache: "no-store" })).json();
      if (j?.enabled) { window.location.reload(); return; }
      setErr(t("gate.wrong"));
    } catch { setErr("Something went wrong — try again."); }
    setBusy(false);
  };
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
        <TbsCherry size={44} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: GREEN, margin: "10px 0 4px" }}>TotalBuahStore</h1>
        <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>
          {t("gate.openingSoon")}
        </p>
        <form onSubmit={unlock} style={{ display: "flex", gap: 8 }}>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("gate.password")} autoComplete="off"
            style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.16)", fontSize: 15 }} />
          <button type="submit" disabled={busy || !key.trim()}
            style={{ border: "none", borderRadius: 10, padding: "12px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", background: key.trim() ? RED : "#ddd", color: "#fff" }}>
            {busy ? "…" : t("gate.enter")}
          </button>
        </form>
        {err ? <p style={{ color: "#b32", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>{err}</p> : null}
      </div>
    </main>
  );
}

export const TBS_FALLBACK_STORES = [
  { code: "TBS-RCV", name: "RC Veteran (Bintaro)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-KTR", name: "Karang Tengah (Lebak Bulus)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-XMAS", name: "Bekasi (KH Noer Ali)", city: "Bekasi", items: 0 },
];

// Add/remove a catalog item to the basket (composite variant keys supported).
export function bumpBasket(store: string, it: { sku: string; name: string; price: number; unit: string }, delta: number, max = 99) {
  const items = loadBasket(store);
  const cur = items[it.sku]?.qty || 0;
  const qty = Math.max(0, Math.min(Math.max(1, Math.min(99, max)), cur + delta));
  if (qty === 0) delete items[it.sku];
  else items[it.sku] = { sku: it.sku, name: it.name, price: it.price, unit: it.unit, qty };
  saveBasket(store, items);
}

export type CatalogItem = { sku: string; name: string; category: string | null; price: number; unit: string; weighed: boolean | null; stock: number; status: string };

// The standard TBS product card (grid + rails + category pages).
// Stock dots live on the PRODUCT PAGE only (owner decision); the card caps the
// stepper at the store's available stock instead.
export function TbsProductCard({ it, inBasket, onAdd, width }: {
  it: CatalogItem; inBasket: number; onAdd: (it: CatalogItem, delta: number) => void; width?: number | string;
}) {
  const { t: tr } = useLang();
  const t = tileColors(it.category);
  const out = it.status === "out_of_stock";
  const [notified, setNotified] = useState(false);
  const store = (typeof window !== "undefined" && localStorage.getItem("tbs_store")) || "";
  const cap = it.status === "in_stock" ? Math.max(0, it.stock) : 99;
  const canMore = !out && inBasket < cap;
  const circle = (filled: boolean): React.CSSProperties => ({
    width: 32, height: 32, flex: "0 0 auto", borderRadius: 999, fontWeight: 900, fontSize: 17, cursor: "pointer",
    border: `1.6px solid ${GREEN}`, background: filled ? GREEN : "#fff", color: filled ? "#fff" : GREEN,
    display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
  });
  return (
    <div style={{ width, flex: width ? "0 0 auto" : undefined, background: "#fff", borderRadius: 14, overflow: "hidden", border: inBasket > 0 ? `2px solid ${GREEN}` : "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" }}>
      <Link href={`/tbs/p/${encodeURIComponent(it.sku)}`} aria-label={`View ${it.name}`} style={{ display: "block", textDecoration: "none", height: 168, background: t.bg, position: "relative" }}>
        <div style={{ height: 168, display: "grid", placeItems: "center" }}>
          <span style={{ fontSize: 44, opacity: 0.9 }}>{catEmoji(it.category)}</span>
        </div>
        {out ? (
          <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 999, padding: "2px 9px" }}>{tr("notify.soldOut")}</span>
        ) : null}
        {inBasket > 0 ? (
          <span aria-label={`${inBasket} in basket`} style={{ position: "absolute", top: 8, right: 8, minWidth: 24, height: 24, padding: "0 7px", borderRadius: 999, background: GREEN, color: "#fff", fontWeight: 900, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>{inBasket}</span>
        ) : null}
        {it.weighed ? <span style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10.5, fontWeight: 800, background: "#fff", color: GREEN, borderRadius: 999, padding: "2px 8px", border: `1px solid ${GREEN}22` }}>±1kg pack</span> : null}
      </Link>
      <div style={{ padding: "10px 11px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <Link href={`/tbs/p/${encodeURIComponent(it.sku)}`} style={{ textDecoration: "none", fontSize: 13, fontWeight: 400, color: "#333", lineHeight: 1.35, minHeight: 35, display: "block" }}>{it.name}</Link>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: "#191919", whiteSpace: "nowrap" }}>{rp(it.price)}</div>
            <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>per {it.unit}</div>
          </div>
          {out ? (
            <button onClick={async (e) => { e.preventDefault(); if (notified) return; setNotified(true); await notifyMe(store, it.sku, it.name); }}
              aria-label={`Notify ${it.name}`}
              style={{ border: `1.4px solid ${GREEN}`, background: notified ? "#EAF3E7" : "#fff", color: GREEN, borderRadius: 999, padding: "6px 11px", fontWeight: 800, fontSize: 11.5, cursor: notified ? "default" : "pointer", whiteSpace: "nowrap", flex: "0 0 auto" }}>
              {notified ? tr("notify.done") : tr("notify.short")}
            </button>
          ) : inBasket === 0 ? (
            <button disabled={!canMore} onClick={() => canMore && onAdd(it, +1)} aria-label={`Add ${it.name}`}
              style={{ ...circle(true), opacity: canMore ? 1 : 0.35, cursor: canMore ? "pointer" : "default" }}>+</button>
          ) : null}
        </div>
        {inBasket > 0 ? (
          // In-basket: the stepper gets its own full-width row (a side-by-side
          // row clips on the 158px rail tiles), TBS green like the sheet.
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 8, border: `1.4px solid ${GREEN}33`, background: "#F0F7EE", borderRadius: 999, padding: 3 }}>
            <button onClick={() => onAdd(it, -1)} aria-label="less" style={{ ...circle(false), width: 28, height: 28, border: "none", background: "transparent" }}>−</button>
            <span style={{ fontWeight: 900, color: "#191919", minWidth: 18, textAlign: "center", fontSize: 15 }}>{inBasket}</span>
            <button disabled={!canMore} onClick={() => canMore && onAdd(it, +1)} aria-label="more"
              style={{ ...circle(true), width: 28, height: 28, opacity: canMore ? 1 : 0.35, cursor: canMore ? "pointer" : "default" }}>+</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
