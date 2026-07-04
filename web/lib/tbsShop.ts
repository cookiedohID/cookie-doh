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

export function canSeeTbsShop(req: Request): boolean {
  if (TBS_SHOP_PUBLIC) return true;
  const cookies = req.headers.get("cookie") || "";
  const m = /(?:^|;\s*)cd_admin=([^;]+)/.exec(cookies);
  const expect = adminToken();
  return Boolean(m && expect && decodeURIComponent(m[1]) === expect);
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
