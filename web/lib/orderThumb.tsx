// web/lib/orderThumb.tsx — Shopee-style product thumbnail for an order line.
// Cookie Doh cookies/drinks resolve to their real catalogue photo (by id, then
// by name); TotalBuahStore groceries have no product photos anywhere (the TBS
// storefront itself represents them with a category emoji), so they fall back to
// an emoji tile — as does any Cookie Doh line whose photo we can't resolve.
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";

const norm = (s: string) => s.trim().toLowerCase();

// Build id→image and name→image lookups once at module load.
const IMG_BY_ID: Record<string, string> = {};
const IMG_BY_NAME: Record<string, string> = {};
for (const f of FLAVORS) {
  const img = (f as any).image;
  if (img) { IMG_BY_ID[f.id] = img; IMG_BY_NAME[norm(f.name)] = img; }
}
for (const s of SMOOTHIES) {
  const img = (s as any).image;
  if (img) { IMG_BY_ID[s.id] = img; IMG_BY_NAME[norm(s.name)] = img; }
}

export type ThumbItem = {
  id?: string | null;
  name?: string | null;
  href?: string | null;
  kind?: string | null;
  sku?: string | null;
};

/** Resolve the catalogue photo for a Cookie Doh line, or null if none. */
export function orderLineImage(it: ThumbItem): string | null {
  const href = String(it.href || "");
  const id = String(it.id || "");
  const isTbs = href.startsWith("/tbs") || id.startsWith("tbs:") || it.kind === "tbs" || !!it.sku;
  if (isTbs) return null;
  return IMG_BY_ID[id] || IMG_BY_NAME[norm(String(it.name || ""))] || null;
}

/**
 * The thumbnail element for an order line: a real photo when we have one,
 * otherwise a tinted emoji tile (🥤 drink / 🍪 cookie / 🛒 TotalBuahStore).
 */
export function OrderThumb({ it, size = 46 }: { it: ThumbItem; size?: number }) {
  const radius = Math.round(size * 0.26);
  const img = orderLineImage(it);
  if (img) {
    return (
      <img
        src={img}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flex: "0 0 auto", background: "#f2efe9" }}
      />
    );
  }
  const href = String(it.href || "");
  const id = String(it.id || "");
  const isTbs = href.startsWith("/tbs") || id.startsWith("tbs:") || it.kind === "tbs" || !!it.sku;
  const drink = href === "/smoothies" || it.kind === "drink";
  const emoji = isTbs ? "🛒" : drink ? "🥤" : "🍪";
  const tint = isTbs ? "rgba(19,82,50,0.08)" : "rgba(0,20,167,0.06)";
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: tint, display: "grid", placeItems: "center", fontSize: Math.round(size * 0.5), flex: "0 0 auto" }}>
      {emoji}
    </div>
  );
}
