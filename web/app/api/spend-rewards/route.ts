// web/app/api/spend-rewards/route.ts — active spend-reward tiers for the cart.
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
    const { data } = await supa
      .from("spend_rewards")
      .select("id, threshold_idr, label, special_price_idr, items, active")
      .eq("active", true)
      .order("threshold_idr", { ascending: true });
    return NextResponse.json({ ok: true, tiers: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: true, tiers: [] }, { status: 200 });
  }
}
