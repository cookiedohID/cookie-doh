// web/app/api/flavors/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Public read endpoint: returns map { [flavor_id]: sold_out }
export async function GET() {
  try {
    const supa = supaAdmin();
    const { data, error } = await supa
      .from("flavor_availability")
      .select("flavor_id, sold_out");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, map: {} },
        { status: 200 }
      );
    }

    const map: Record<string, boolean> = {};
    (data || []).forEach((row: any) => {
      if (row?.flavor_id) map[String(row.flavor_id)] = Boolean(row.sold_out);
    });

    return NextResponse.json({ ok: true, map }, { status: 200 });
  } catch (e: any) {
    // fail open: app still works with catalog defaults
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error", map: {} },
      { status: 200 }
    );
  }
}
