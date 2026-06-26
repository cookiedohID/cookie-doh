// web/app/api/admin/vip/route.ts — list + create VIP tiers.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data, error } = await supa.from("vip_tiers").select("*").order("reach_annual_idr", { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    return NextResponse.json({ ok: true, tiers: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const name = String(b?.name || "").trim().slice(0, 30);
    const reach = Math.max(0, Math.floor(Number(b?.reach_annual_idr || 0)));
    const maintain = Math.max(0, Math.floor(Number(b?.maintain_monthly_idr || 0)));
    // buy-N-get-1: a VIP rate is 1..10 (10 = same as standard, no boost).
    const perFree = Math.min(10, Math.max(1, Math.floor(Number(b?.loyalty_per_free || 10))));

    if (!name) return NextResponse.json({ ok: false, error: "Give the tier a name." }, { status: 400 });
    if (!reach) return NextResponse.json({ ok: false, error: "Set the annual spend to reach this tier." }, { status: 400 });

    const supa = supaAdmin();
    const { data, error } = await supa
      .from("vip_tiers")
      .insert({
        name,
        reach_annual_idr: reach,
        maintain_monthly_idr: maintain,
        loyalty_per_free: perFree,
        free_delivery: b?.free_delivery === true,
        free_cookie_per_order: b?.free_cookie_per_order === true,
        active: b?.active === true, // default OFF — owner activates explicitly
      })
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
