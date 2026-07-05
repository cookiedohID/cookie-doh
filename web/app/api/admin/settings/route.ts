// web/app/api/admin/settings/route.ts — read/save owner-tunable settings
// (app_settings). Gated like all /api/admin/* by the cd_admin cookie (proxy).
// Allowlisted keys only — this is not a general write endpoint.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

const ALLOWED: Record<string, (v: string) => boolean> = {
  // marketplace fee %: 0–50, numeric
  tbs_marketplace_fee_pct: (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 50,
  // TBS shop launch switch (Admin → TBS)
  tbs_shop_public: (v) => v === "true" || v === "false",
  // arrival promise: hours to READY + apology voucher (Rp)
  tbs_promise_hours: (v) => Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 48,
  tbs_promise_voucher_idr: (v) => Number.isFinite(Number(v)) && Number(v) >= 1000 && Number(v) <= 1000000,
  // rate-to-earn: TBS points granted on the FIRST rating of an order (0 = off)
  tbs_rating_reward_points: (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10000,
  // store opening hours (WIB) used by the arrival-promise clock
  tbs_open_hour: (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 23,
  tbs_close_hour: (v) => Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 24,
};

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const key = String(u.searchParams.get("key") || "");
    if (!ALLOWED[key]) return NextResponse.json({ ok: false, error: "unknown key" }, { status: 400 });
    const value = await getSetting(supaAdmin(), key);
    return NextResponse.json({ ok: true, key, value });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const key = String(b?.key || "");
    const value = String(b?.value ?? "").trim();
    if (!ALLOWED[key]) return NextResponse.json({ ok: false, error: "unknown key" }, { status: 400 });
    if (!ALLOWED[key](value)) return NextResponse.json({ ok: false, error: "invalid value" }, { status: 400 });
    const ok = await setSetting(supaAdmin(), key, value);
    if (ok && key === "tbs_shop_public") {
      const { bustTbsPublicCache } = await import("@/lib/tbsShop");
      bustTbsPublicCache(); // other server instances refresh within 60s
    }
    return NextResponse.json({ ok });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
