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

// Fallback ONLY — the live switch is the `tbs_shop_public` row in app_settings,
// toggled from Admin → TBS (10s cache per server instance, so a toggle takes
// effect everywhere within seconds).
export const TBS_SHOP_PUBLIC = false;

let PUB_CACHE: { at: number; value: boolean } | null = null;
export function bustTbsPublicCache() { PUB_CACHE = null; }
export async function tbsShopPublic(): Promise<boolean> {
  if (PUB_CACHE && Date.now() - PUB_CACHE.at < 10_000) return PUB_CACHE.value;
  let v = TBS_SHOP_PUBLIC;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const { createClient } = await import("@supabase/supabase-js");
      const supa = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await supa.from("app_settings").select("value").eq("key", "tbs_shop_public").maybeSingle();
      if (data?.value === "true" || data?.value === "false") v = data.value === "true";
    }
  } catch { /* fall back to the const */ }
  PUB_CACHE = { at: Date.now(), value: v };
  return v;
}

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

export async function canSeeTbsShop(req: Request): Promise<boolean> {
  if (await tbsShopPublic()) return true;
  const cookies = req.headers.get("cookie") || "";
  const a = /(?:^|;\s*)cd_admin=([^;]+)/.exec(cookies);
  const expect = adminToken();
  if (a && expect && decodeURIComponent(a[1]) === expect) return true;
  const p = /(?:^|;\s*)cd_tbs=([^;]+)/.exec(cookies);
  return Boolean(p && decodeURIComponent(p[1]) === previewCookieValue());
}

// Partner back-office host (for the admin hub's quick link).
export function tbsBackofficeOrigin(): string | null {
  try { return new URL(process.env.TBS_PARTNER_API_URL || "").origin; } catch { return null; }
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

// POST to the partner API (order push has its own; this is for small writes).
export async function partnerPost(path: string, body: any): Promise<any | null> {
  const cfg = partnerBase();
  if (!cfg) return null;
  try {
    const signal = typeof (AbortSignal as any)?.timeout === "function" ? (AbortSignal as any).timeout(9000) : undefined;
    const r = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal,
    });
    return await r.json().catch(() => null);
  } catch { return null; }
}

// Unified member DB (owner directive 2026-07-05): a Cookie Doh member IS a TBS
// member — register the phone in the ERP. Best-effort + idempotent on phone;
// never blocks the caller.
export async function registerTbsMember(phone: string, name?: string | null, email?: string | null): Promise<void> {
  try { await partnerPost("/member", { phone, name: name || undefined, email: email || undefined }); }
  catch { /* best-effort */ }
}

// The member's TBS points balance (federation endpoint keyed by phone).
export async function tbsPointsBalance(phone: string): Promise<number> {
  try {
    const raw = process.env.TBS_PARTNER_API_URL, token = process.env.TBS_PARTNER_API_TOKEN;
    if (!raw || !token || !phone) return 0;
    const u = new URL(raw);
    u.searchParams.set("phone", phone);
    u.searchParams.set("limit", "1");
    const signal = typeof (AbortSignal as any)?.timeout === "function" ? (AbortSignal as any).timeout(8000) : undefined;
    const j = await (await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal })).json();
    const bal = Number(j?.points?.balance);
    return j?.found && Number.isFinite(bal) ? Math.max(0, Math.floor(bal)) : 0;
  } catch { return 0; }
}

// Spend points (1 point = Rp1) — idempotent on source_ref (ERP ledger unique).
// Distinguishes a DEFINITIVE not-held (insufficient balance — no debit
// happened) from an INDETERMINATE result (timeout/network — the debit MAY have
// committed even though we got no response). The caller must treat these
// differently (indeterminate must never be assumed as "no debit").
export async function redeemTbsPoints(phone: string, points: number, sourceRef: string): Promise<{ ok: boolean; insufficient?: boolean; indeterminate?: boolean; error?: string }> {
  const r = await partnerPost("/redeem", { phone, points, source_ref: sourceRef });
  if (r === null) return { ok: false, indeterminate: true, error: "no response" };
  if (r.ok === true) return { ok: true };
  const err = String(r.error || r.message || "redeem failed");
  if (/insufficient/i.test(err)) return { ok: false, insufficient: true, error: err };
  return { ok: false, indeterminate: true, error: err };
}

// Hold points with bounded retry: redeem is idempotent on source_ref, so
// re-attempting after a timeout safely CONFIRMS a debit that committed but
// whose response was lost (returns ok) or reveals it never landed
// (insufficient). Only an exhausted-retry against a truly-unreachable ERP stays
// indeterminate.
export async function redeemTbsPointsHold(phone: string, points: number, sourceRef: string, attempts = 3): Promise<{ ok: boolean; insufficient?: boolean; indeterminate?: boolean; error?: string }> {
  let last: any = { ok: false, indeterminate: true };
  for (let i = 0; i < Math.max(1, attempts); i++) {
    last = await redeemTbsPoints(phone, points, sourceRef);
    if (last.ok || last.insufficient) return last; // definitive
  }
  return last; // exhausted → indeterminate
}

// Give points BACK (order held points at checkout but was never paid) —
// idempotent on source_ref via the ERP's adjust ledger.
export async function refundTbsPoints(phone: string, points: number, sourceRef: string, reason = "web checkout not paid"): Promise<{ ok: boolean; error?: string }> {
  const r = await partnerPost("/adjust", { phone, points, source_ref: sourceRef, reason });
  if (r && r.ok) return { ok: true };
  return { ok: false, error: (r && (r.error || r.message)) || "refund failed" };
}

// Stock lookup for a basket: always fetches each variant's BASE sku too (the
// shared pool for cross-pack checks) and chunks past the ERP's 60-SKU cap.
// Returns the merged entry array, or null if any chunk failed.
export async function partnerGetStock(store: string, skus: string[]): Promise<any[] | null> {
  const { expandTbsSkus } = await import("@/lib/tbsStockCheck");
  const list = expandTbsSkus(skus).slice(0, 180);
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 60) chunks.push(list.slice(i, i + 60));
  const parts = await Promise.all(chunks.map((c) => partnerGet("/stock", { store, skus: c.join(",") })));
  if (parts.some((d) => !Array.isArray(d))) return null;
  return (parts as any[][]).flat();
}

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
