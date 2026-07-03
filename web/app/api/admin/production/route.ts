// web/app/api/admin/production/route.ts — suggested baking plan from stock + sales.
//   GET  → suggested recipes to bake (read-only).
//   POST → "bake this" — add produced cookies into a location's stock. The owner
//          can override the suggested amounts before committing; each flavour
//          bumps location_stock, clears sold-out, and logs a stock_movements row.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeProductionPlan, BASE_OF } from "@/lib/production";
import { LOCATIONS } from "@/lib/locations";
import { aggSoldOut, notifyBackInStock } from "@/lib/stockAlerts";

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
    // Opt-in: WhatsApp back-in-stock subscribers when a sold-out flavour returns.
    const notify = Boolean(b?.notify);

    // Normalise + de-dupe: sum cookies per flavour (only known cookie flavours,
    // whole numbers > 0). Deduping means a repeated id can't double-upsert or
    // double-alert, and flip-detection stays correct.
    const byId = new Map<string, number>();
    for (const raw of Array.isArray(b?.items) ? b.items : []) {
      const id = String(raw?.id ?? "").trim();
      const cookies = Math.max(0, Math.floor(Number(raw?.cookies ?? 0)));
      if (BASE_OF[id] && cookies > 0) byId.set(id, (byId.get(id) || 0) + cookies);
    }
    const items = [...byId.entries()].map(([id, cookies]) => ({ id, cookies }));
    if (!items.length) {
      return NextResponse.json({ ok: false, error: "Enter how many cookies you baked (at least one flavour)." }, { status: 400 });
    }

    // Apply each flavour: read current stock, add, clear sold-out, log movement.
    const now = new Date().toISOString();
    const added: { id: string; before: number; after: number; cookies: number }[] = [];
    const movements: any[] = [];
    const flipCandidates: string[] = []; // sold-out storefront-wide BEFORE this bake
    for (const it of items) {
      // Capture pre-bake sold-out state first (only when we may alert).
      const wasOut = notify ? await aggSoldOut(supa, it.id) : false;
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
      if (wasOut) flipCandidates.push(it.id);
    }

    // Audit trail (best-effort; table is optional).
    try { await supa.from("stock_movements").insert(movements); } catch { /* table optional */ }

    // Back-in-stock alerts — only for flavours that were sold out storefront-wide
    // before this bake and are now available again. Skipped entirely if !notify.
    let alerted = 0;
    if (notify && flipCandidates.length) {
      for (const id of new Set(flipCandidates)) {
        if (!(await aggSoldOut(supa, id))) alerted += await notifyBackInStock(supa, id);
      }
    }

    const totalCookies = added.reduce((n, a) => n + a.cookies, 0);
    return NextResponse.json({ ok: true, location_id, added, totalCookies, alerted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
