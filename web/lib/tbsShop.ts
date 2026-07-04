// web/lib/tbsShop.ts — server-side helpers for the TotalBuahStore shop tab.
//
// FEATURE FLAG: the shop is hidden from customers until the owner approves.
// Going public = flip TBS_SHOP_PUBLIC to true (one-line commit). Until then,
// only a logged-in ADMIN (cd_admin cookie — the owner) can see/browse it.
//
// All TBS calls are server-to-server against the ERP's partner API
// (backoffice.tbsgroup.id/api/partner/*, Bearer TBS_PARTNER_API_TOKEN —
// the same env vars the unified-rewards tab already uses).
import { createHash } from "crypto";

export const TBS_SHOP_PUBLIC = false; // ← flip to true to launch to customers

// Same check proxy.ts uses for /admin: cd_admin cookie == sha256("cookie-doh::"+pass).
function adminToken(): string | null {
  const pass = process.env.ADMIN_BASIC_PASS;
  if (!pass) return null;
  return createHash("sha256").update(`cookie-doh::${pass}`).digest("hex");
}

// Shareable preview password (soft gate for early viewers the owner invites).
// Visiting /api/tbs/preview?key=<this> sets a 30-day cookie. Change it here.
export const TBS_PREVIEW_KEY = "buahsegar100";
function previewCookieValue(): string {
  return createHash("sha256").update(`tbs-preview::${TBS_PREVIEW_KEY}`).digest("hex");
}

export function canSeeTbsShop(req: Request): boolean {
  if (TBS_SHOP_PUBLIC) return true;
  const cookies = req.headers.get("cookie") || "";
  const a = /(?:^|;\s*)cd_admin=([^;]+)/.exec(cookies);
  const expect = adminToken();
  if (a && expect && decodeURIComponent(a[1]) === expect) return true;
  const p = /(?:^|;\s*)cd_tbs=([^;]+)/.exec(cookies);
  return Boolean(p && decodeURIComponent(p[1]) === previewCookieValue());
}

export function tbsPreviewCookie(key: string): string | null {
  return key === TBS_PREVIEW_KEY ? previewCookieValue() : null;
}

function partnerBase(): { base: string; token: string } | null {
  // Reuse the unified-rewards envs; the partner root is the same host.
  const raw = process.env.TBS_PARTNER_API_URL || "";
  const token = process.env.TBS_PARTNER_API_TOKEN || "";
  if (!raw || !token) return null;
  const u = new URL(raw);
  return { base: `${u.origin}/api/partner`, token };
}

const CACHE = new Map<string, { at: number; data: any }>();
const TTL_MS = 120_000;

export async function partnerGet(path: string, params: Record<string, string>): Promise<any | null> {
  const cfg = partnerBase();
  if (!cfg) return null;
  const u = new URL(`${cfg.base}${path}`);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  const key = u.toString();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const signal = typeof (AbortSignal as any)?.timeout === "function" ? (AbortSignal as any).timeout(9000) : undefined;
  const r = await fetch(key, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store", signal });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (data) CACHE.set(key, { at: Date.now(), data });
  return data;
}

// The 3 TBS stores as a fallback while the cloud stock feed is still syncing
// (the live /stores list is empty until inv_onhand is loaded ERP-side).
export const TBS_FALLBACK_STORES = [
  { code: "TBS-RCV", name: "RC Veteran (Bintaro)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-KTR", name: "Karang Tengah (Lebak Bulus)", city: "Jakarta Selatan", items: 0 },
  { code: "TBS-XMAS", name: "Bekasi (KH Noer Ali)", city: "Bekasi", items: 0 },
];

// ── Checkout support ─────────────────────────────────────────────────────────

// ERP store code → physical geo (same stores as lib/locations' tbs-* entries).
export const TBS_STORE_GEO: Record<string, { lat: number; lng: number; name: string }> = {
  "TBS-RCV": { lat: -6.26234, lng: 106.76635, name: "RC Veteran (Bintaro)" },
  "TBS-KTR": { lat: -6.30766, lng: 106.78101, name: "Karang Tengah (Lebak Bulus)" },
  "TBS-XMAS": { lat: -6.24735, lng: 106.97999, name: "Bekasi (KH Noer Ali)" },
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// v1 delivery pricing: server-computed, distance-based (bike-courier calibrated).
// base 10k + 2.5k/km, rounded UP to Rp1,000; max radius 12 km. Tune here.
export const TBS_DELIVERY_MAX_KM = 12;
export function tbsDeliveryFee(km: number): number {
  return Math.ceil((10000 + 2500 * km) / 1000) * 1000;
}

// Push a PAID web order to the ERP (idempotent on event_id = the CD order id).
export async function pushTbsOrder(input: {
  event_id: string; store: string; fulfil: "pickup" | "delivery";
  customer: { name: string; phone: string }; address?: string | null; notes?: string | null;
  lines: { sku: string; qty: number; price: number; amount: number }[];
  subtotal: number; delivery_fee: number; total: number;
}): Promise<{ ok: boolean; order_no?: string; error?: string }> {
  const raw = process.env.TBS_PARTNER_API_URL || "";
  const token = process.env.TBS_PARTNER_API_TOKEN || "";
  if (!raw || !token) return { ok: false, error: "not_configured" };
  const u = new URL(raw);
  try {
    const signal = typeof (AbortSignal as any)?.timeout === "function" ? (AbortSignal as any).timeout(9000) : undefined;
    const r = await fetch(`${u.origin}/api/partner/order`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input), cache: "no-store", signal,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return { ok: true, order_no: j.order_no };
    return { ok: false, error: (j && (j.error || JSON.stringify(j).slice(0, 120))) || `http_${r.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "push_failed" };
  }
}
