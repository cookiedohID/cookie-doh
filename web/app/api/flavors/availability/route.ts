// web/app/api/flavors/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LOCATIONS } from "@/lib/locations";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function effSoldOut(soldOut: boolean, stock: number | null) {
  if (soldOut) return true;
  if (typeof stock === "number" && stock <= 0) return true;
  return false;
}

// Returns:
//   byLocation: { [locationId]: { [itemId]: { soldOut, stock } } }  (raw, for admin)
//   map:        { [itemId]: boolean }   aggregated effective sold-out across ALL
//               locations (an item is "sold out" only if every tracked location is)
export async function GET() {
  try {
    const supa = supaAdmin();
    const { data, error } = await supa
      .from("location_stock")
      .select("location_id, item_id, sold_out, stock");

    if (error) {
      // Table not created yet (or other) — fail open.
      return NextResponse.json(
        { ok: false, error: error.message, map: {}, byLocation: {} },
        { status: 200 }
      );
    }

    const byLocation: Record<string, Record<string, { soldOut: boolean; stock: number | null }>> = {};
    // Track, per item, how many locations have it sold out vs how many rows exist.
    const perItem: Record<string, { rows: number; soldOutCount: number }> = {};

    (data || []).forEach((row: any) => {
      const loc = String(row.location_id);
      const item = String(row.item_id);
      const soldOut = Boolean(row.sold_out);
      const stock = row.stock === null || row.stock === undefined ? null : Number(row.stock);
      if (!byLocation[loc]) byLocation[loc] = {};
      byLocation[loc][item] = { soldOut, stock };

      const eff = effSoldOut(soldOut, stock);
      const p = (perItem[item] ||= { rows: 0, soldOutCount: 0 });
      p.rows += 1;
      if (eff) p.soldOutCount += 1;
    });

    // Aggregated: sold out for the storefront only when ALL locations track it and
    // every one is sold out. Any untracked location => still available somewhere.
    const totalLocations = LOCATIONS.length;
    const map: Record<string, boolean> = {};
    Object.entries(perItem).forEach(([item, p]) => {
      map[item] = p.rows >= totalLocations && p.soldOutCount >= totalLocations;
    });

    return NextResponse.json({ ok: true, map, byLocation }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error", map: {}, byLocation: {} },
      { status: 200 }
    );
  }
}
