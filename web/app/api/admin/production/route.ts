// web/app/api/admin/production/route.ts — suggested baking plan from stock + sales.
//   GET  → suggested recipes to bake (read-only).
//   POST → "bake this" — add produced cookies into a location's stock. The owner
//          can override the suggested amounts before committing; each flavour
//          bumps location_stock, clears sold-out, and logs a stock_movements row.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeProductionPlan, BASE_OF } from "@/lib/production";
import { LOCATIONS } from "@/lib/locations";

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

const VALID_LOC = new Set(LOCATIONS.map((l) => l.id));

// Execute a bake: add the produced cookies (per flavour) into one location's stock.
export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const b = await req.json().catch(() => ({}));
    const location_id = String(b?.location_id || "").trim();
    if (!location_id || !VALID_LOC.has(location_id)) {
      return NextResponse.json({ ok: false, error: "Pick a location to add the baked cookies to." }, { status: 400 });
    }

    // Normalise the requested cookies per flavour — only known cookie flavours,
    // whole numbers > 0. Everything else is ignored.
    const items: { id: string; cookies: number }[] = [];
    for (const raw of Array.isArray(b?.items) ? b.items : []) {
      const id = String(raw?.id ?? "").trim();
      const cookies = Math.max(0, Math.floor(Number(raw?.cookies ?? 0)));
      if (BASE_OF[id] && cookies > 0) items.push({ id, cookies });
    }
    if (!items.length) {
      return NextResponse.json({ ok: false, error: "Enter how many cookies you baked (at least one flavour)." }, { status: 400 });
    }

    // Apply each flavour: read current stock, add, clear sold-out, log movement.
    const now = new Date().toISOString();
    const added: { id: string; before: number; after: number; cookies: number }[] = [];
    const movements: any[] = [];
    for (const it of items) {
      const { data: cur } = await supa
        .from("location_stock").select("stock")
        .eq("location_id", location_id).eq("item_id", it.id).maybeSingle();
      const before = cur?.stock == null ? 0 : Math.max(0, Math.floor(Number(cur.stock)));
      const after = before + it.cookies;
      const { error } = await supa.from("location_stock").upsert(
        { location_id, item_id: it.id, stock: after, sold_out: false, updated_at: now },
        { onConflict: "location_id,item_id" }
      );
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      added.push({ id: it.id, before, after, cookies: it.cookies });
      movements.push({ location_id, item_id: it.id, qty: it.cookies, stock_before: before, stock_after: after, reason: "production" });
    }

    // Audit trail (best-effort; table is optional).
    try { await supa.from("stock_movements").insert(movements); } catch { /* table optional */ }

    const totalCookies = added.reduce((n, a) => n + a.cookies, 0);
    return NextResponse.json({ ok: true, location_id, added, totalCookies });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
