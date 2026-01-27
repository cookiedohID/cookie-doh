import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const store_id = String(u.searchParams.get("store_id") || "").trim();
    if (!store_id) {
      return NextResponse.json({ ok: false, error: "Missing store_id", stock: {} }, { status: 400 });
    }

    const supa = supaAdmin();
    const { data, error } = await supa
      .from("flavor_stock")
      .select("flavor_id, qty")
      .eq("store_id", store_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, stock: {} }, { status: 500 });
    }

    const stock: Record<string, number> = {};
    for (const row of data || []) {
      const fid = String((row as any).flavor_id);
      const q = Number((row as any).qty ?? 0);
      stock[fid] = Number.isFinite(q) ? q : 0;
    }

    return NextResponse.json({ ok: true, store_id, stock }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error", stock: {} }, { status: 500 });
  }
}
