// web/app/api/assortments/settings/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

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
