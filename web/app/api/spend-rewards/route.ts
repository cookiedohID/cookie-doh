// web/app/api/spend-rewards/route.ts — active spend-reward tiers for the cart.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

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
