// web/app/api/cron/keep-awake/route.ts — belt-and-suspenders insurance so the
// Supabase project never hits the free-tier "paused after ~7 days idle" state
// while the Cookie Doh storefront is on its holiday break (no customer orders).
// It does one bare read to register database activity, independently of the
// feature crons (so it keeps working even if one of those errors).
//
// TEMPORARY: remove once the Cloud SQL migration cuts over — Cloud SQL never
// auto-pauses. It deliberately pings SUPABASE (the thing that pauses), not the
// new pg layer.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ ok: false, error: "no supabase env" }, { status: 200 });
    const supa = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supa.from("app_settings").select("key").limit(1);
    if (error) return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
    return NextResponse.json({ ok: true, pinged: "supabase", at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
