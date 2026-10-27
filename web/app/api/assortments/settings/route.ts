// web/app/api/assortments/settings/route.ts
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

const KEY = "seasonal_assortment";

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data, error } = await supa
      .from("assortment_settings")
      .select("key, data")
      .eq("key", KEY)
      .maybeSingle();

    if (error) {
      // fail-open: storefront still works with defaults
      return NextResponse.json({ ok: false, settings: null, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, settings: data?.data ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, settings: null, error: e?.message || "Unknown error" },
      { status: 200 }
    );
  }
}
