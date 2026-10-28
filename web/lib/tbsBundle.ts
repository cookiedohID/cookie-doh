// web/lib/tbsBundle.ts — TotalBuahStore bundle pricing (owner rule 2026-10-27):
//   5 complete units = 2,5% off, 10 complete units = 5% off the ERP unit price,
//   rounded DOWN to the nearest …000 / …500 / …800 rupiah, and the page shows
//   "Anda Hemat Rp …". Shared by the product page, the basket, /api/tbs/stock
//   and checkout so every surface prints the same number.
//
// Basket key for a bundle line: "<sku>#<n>" (n = 5 or 10). "<sku>@<UOM>" stays
// the ERP box-variant key; the two never combine.
//
// LIVE SWITCH: the discount is only charged when app_settings.tbs_bundle_discount
// = "true" — the ERP's /api/partner/order recomputes every line at full catalog
// price and rejects a total that does not match, so the discount can only go
// live once the ERP accepts a `discount` field (patch filed in the Kurly repo).
// Until then bundles are sold at n × unit price and no saving is shown.

export const BUNDLE_SIZES = [5, 10] as const;
export type BundleSize = (typeof BUNDLE_SIZES)[number];
export const BUNDLE_DISCOUNT: Record<BundleSize, number> = { 5: 0.025, 10: 0.05 };

/** Round down to the nearest rupiah amount ending in 000, 500 or 800. */
export function roundDownTbs(n: number): number {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  const thousands = Math.floor(v / 1000) * 1000;
  const rem = v - thousands;
  if (rem >= 800) return thousands + 800;
  if (rem >= 500) return thousands + 500;
  return thousands;
}

/** Price of one bundle of `size` units at `unit` price. `live` = discount switched on. */
export function bundlePrice(unit: number, size: BundleSize, live: boolean): { price: number; full: number; save: number } {
  const full = Math.round(unit) * size;
  if (!live) return { price: full, full, save: 0 };
  const price = roundDownTbs(full * (1 - BUNDLE_DISCOUNT[size]));
  return { price, full, save: Math.max(0, full - price) };
}

export function parseBundleKey(key: string): { base: string; size: BundleSize | null } {
  const m = /^(.+?)#(5|10)$/.exec(String(key || "").trim());
  if (!m) return { base: String(key || "").trim(), size: null };
  return { base: m[1], size: Number(m[2]) as BundleSize };
}

export function bundleKey(sku: string, size: BundleSize): string {
  return `${sku}#${size}`;
}

export function bundleLabel(size: BundleSize, unit: string): string {
  return `Pack ${size}s (${size} ${unit || "pcs"})`;
}
