// web/app/api/stock/check/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

type ReqItem = { flavor_id: string; qty: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const store_id = String(body?.store_id || "").trim();
    const itemsRaw = Array.isArray(body?.items) ? body.items : [];

    if (!store_id) {
      return NextResponse.json({ ok: false, error: "Missing store_id" }, { status: 400 });
    }

    const items: ReqItem[] = itemsRaw
      .map((x: any) => ({
        flavor_id: String(x?.flavor_id || "").trim(),
        qty: Number(x?.qty ?? 0),
      }))
      .filter((x: ReqItem) => x.flavor_id && Number.isFinite(x.qty) && x.qty > 0);

    if (!items.length) {
      return NextResponse.json({ ok: true, store_id, insufficient: [] }, { status: 200 });
    }

    const supa = supaAdmin();

    const flavorIds = Array.from(new Set(items.map((i) => i.flavor_id)));

    const { data, error } = await supa
      .from("flavor_stock")
      .select("flavor_id, qty")
      .eq("store_id", store_id)
      .in("flavor_id", flavorIds);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const stockMap: Record<string, number> = {};
    for (const row of data || []) {
      const fid = String((row as any).flavor_id);
      const q = Number((row as any).qty ?? 0);
      stockMap[fid] = Number.isFinite(q) ? q : 0;
    }

    const insufficient = items
      .map((it) => {
        const available = stockMap[it.flavor_id] ?? 0; // if missing = 0
        return {
          flavor_id: it.flavor_id,
          requested: it.qty,
          available,
          ok: it.qty <= available,
        };
      })
      .filter((x) => !x.ok)
      .map(({ ok, ...rest }) => rest);

    return NextResponse.json({ ok: true, store_id, insufficient }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Stock check failed" }, { status: 500 });
  }
}
