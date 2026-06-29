// web/app/api/admin/production/route.ts — suggested baking plan from stock + sales.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeProductionPlan } from "@/lib/production";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const windowDays = Number(url.searchParams.get("window")) || 28;
    const horizonDays = Number(url.searchParams.get("horizon")) || 14;
    const plan = await computeProductionPlan(supaAdmin(), { windowDays, horizonDays });
    return NextResponse.json({ ok: true, plan });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
