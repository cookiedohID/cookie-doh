// web/app/api/admin/spend-rewards/route.ts — list + create spend-reward tiers.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FLAVORS } from "@/lib/catalog";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const NAME_BY_ID = new Map((FLAVORS as any[]).map((f) => [String(f.id), String(f.name)]));

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data } = await supa.from("spend_rewards").select("*").order("threshold_idr", { ascending: true });
    return NextResponse.json({ ok: true, tiers: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const threshold = Math.max(0, Math.floor(Number(b?.threshold_idr || 0)));
    const price = Math.max(0, Math.floor(Number(b?.special_price_idr || 0)));
    const label = String(b?.label || "").trim().slice(0, 60);

    // Items: keep only known cookie ids with quantity > 0; resolve names server-side.
    const rawItems = Array.isArray(b?.items) ? b.items : [];
    const items = rawItems
      .map((it: any) => {
        const id = String(it?.id || "").trim();
        const quantity = Math.max(0, Math.floor(Number(it?.quantity || 0)));
        if (!id || !NAME_BY_ID.has(id) || quantity <= 0) return null;
        return { id, name: NAME_BY_ID.get(id), quantity };
      })
      .filter(Boolean);

    if (!threshold) return NextResponse.json({ ok: false, error: "Set a spend threshold." }, { status: 400 });
    if (!label) return NextResponse.json({ ok: false, error: "Give the reward a name." }, { status: 400 });
    if (!items.length) return NextResponse.json({ ok: false, error: "Pick at least one cookie for the reward." }, { status: 400 });
    if (price < 1) return NextResponse.json({ ok: false, error: "Set the reward's special price." }, { status: 400 });

    const supa = supaAdmin();
    const { data, error } = await supa
      .from("spend_rewards")
      .insert({ threshold_idr: threshold, label, special_price_idr: price, items, active: b?.active === false ? false : true })
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
