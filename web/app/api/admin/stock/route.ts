// web/app/api/admin/stock/route.ts
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

    const storesRes = await supa
      .from("store_locations")
      .select("id,name")
      .order("name", { ascending: true });

    if (storesRes.error) throw new Error(storesRes.error.message);

    const stockRes = await supa
      .from("flavor_stock")
      .select("store_id, flavor_id, qty");

    if (stockRes.error) throw new Error(stockRes.error.message);

    const stock: Record<string, Record<string, number>> = {};
    for (const row of stockRes.data || []) {
      const sid = String((row as any).store_id);
      const fid = String((row as any).flavor_id);
      const qty = Number((row as any).qty ?? 0);
      stock[sid] = stock[sid] || {};
      stock[sid][fid] = Number.isFinite(qty) ? qty : 0;
    }

    return NextResponse.json(
      { ok: true, stores: storesRes.data || [], stock },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const body = await req.json().catch(() => ({}));

    const store_id = String(body?.store_id || "").trim();
    const flavor_id = String(body?.flavor_id || "").trim();
    const qty = Number(body?.qty);

    if (!store_id || !flavor_id || !Number.isFinite(qty) || qty < 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid store_id / flavor_id / qty" },
        { status: 400 }
      );
    }

    const { error } = await supa
      .from("flavor_stock")
      .upsert(
        {
          store_id,
          flavor_id,
          qty: Math.floor(qty),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id,flavor_id" }
      );

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
