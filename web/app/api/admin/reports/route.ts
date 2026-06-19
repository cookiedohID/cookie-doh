// web/app/api/admin/reports/route.ts
// One admin reporting endpoint. GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&location_id=opt
// Returns: daily sales, per-item sales, per-location comparison, current inventory
// + movement history, and redeemed items. Read-only; gated by the admin token.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LOCATIONS, getLocation, locationForOrder } from "@/lib/locations";
import { classifyItem } from "@/lib/loyalty";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Optional token gate (same pattern as /api/admin/flavors/availability). If
// ADMIN_TOKEN is unset it allows through — set ADMIN_TOKEN + NEXT_PUBLIC_ADMIN_TOKEN
// in production to lock reports down (they contain revenue + PII-adjacent data).
function checkAdminAuth(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  return (req.headers.get("x-admin-token") || "") === token;
}

function dayStr(iso: string | null): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

export async function GET(req: Request) {
  try {
    if (!checkAdminAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const today = new Date();
    const defFrom = new Date(today.getTime() - 29 * 24 * 3600 * 1000);
    const from = (url.searchParams.get("from") || defFrom.toISOString().slice(0, 10)).slice(0, 10);
    const to = (url.searchParams.get("to") || today.toISOString().slice(0, 10)).slice(0, 10);
    const locFilter = (url.searchParams.get("location_id") || "").trim() || null;

    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;

    const supa = supaAdmin();

    // ---- PAID orders in range (revenue uses paid_at) ----
    const { data: orderRows } = await supa
      .from("orders")
      .select("id, order_no, paid_at, created_at, total_idr, payment_status, fulfilment_status, items_json, meta, shipping_json")
      .eq("payment_status", "PAID")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at", { ascending: false })
      .limit(5000);

    const orders = (orderRows || []).map((o: any) => ({ ...o, _loc: locationForOrder(o) }))
      .filter((o: any) => !locFilter || o._loc === locFilter);

    // ---- Aggregations ----
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    const itemMap: Record<string, { id: string; name: string; kind: string; qty: number; revenue: number; freeQty: number }> = {};
    const locMap: Record<string, { orders: number; revenue: number }> = {};
    const redeemMap: Record<string, { id: string; name: string; kind: string; qty: number }> = {};
    let totalRevenue = 0;
    let freeCookies = 0, freeDrinks = 0;

    for (const o of orders) {
      const d = dayStr(o.paid_at || o.created_at);
      const rev = Number(o.total_idr || 0);
      totalRevenue += rev;
      dailyMap[d] = dailyMap[d] || { orders: 0, revenue: 0 };
      dailyMap[d].orders += 1; dailyMap[d].revenue += rev;
      locMap[o._loc] = locMap[o._loc] || { orders: 0, revenue: 0 };
      locMap[o._loc].orders += 1; locMap[o._loc].revenue += rev;

      const items = Array.isArray(o.items_json) ? o.items_json : [];
      for (const it of items) {
        const id = String(it?.id ?? "");
        if (!id) continue;
        const name = String(it?.name ?? id);
        const kind = classifyItem(id, it?.kind);
        const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
        if (!qty) continue;
        const isFree = it?.free === true; // only explicit reward redemptions, not price-0 box lines
        const lineRev = isFree ? 0 : Number(it?.price ?? 0) * qty;

        itemMap[id] = itemMap[id] || { id, name, kind, qty: 0, revenue: 0, freeQty: 0 };
        itemMap[id].qty += qty;
        itemMap[id].revenue += lineRev;
        if (isFree) {
          itemMap[id].freeQty += qty;
          redeemMap[id] = redeemMap[id] || { id, name, kind, qty: 0 };
          redeemMap[id].qty += qty;
          if (kind === "cookie") freeCookies += qty;
          else if (kind === "drink") freeDrinks += qty;
        }
      }
    }

    const daily = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const items = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
    const byLocation = LOCATIONS.map((l) => ({
      locationId: l.id, name: l.short,
      orders: locMap[l.id]?.orders || 0, revenue: locMap[l.id]?.revenue || 0,
    }));
    const redemptions = Object.values(redeemMap).sort((a, b) => b.qty - a.qty);

    // ---- Current inventory per location ----
    let stockQ = supa.from("location_stock").select("location_id, item_id, stock, sold_out, updated_at");
    if (locFilter) stockQ = stockQ.eq("location_id", locFilter);
    const { data: stockRows } = await stockQ;
    const inventory = (stockRows || []).map((r: any) => ({
      locationId: r.location_id,
      locationName: getLocation(r.location_id)?.short || r.location_id,
      itemId: r.item_id,
      stock: r.stock,
      soldOut: Boolean(r.sold_out),
      updatedAt: r.updated_at,
    }));

    // ---- Inventory movement history (best-effort; table may not exist yet) ----
    let movements: any[] = [];
    try {
      let mvQ = supa.from("stock_movements")
        .select("location_id, item_id, qty, stock_before, stock_after, order_no, reason, created_at")
        .gte("created_at", fromIso).lte("created_at", toIso)
        .order("created_at", { ascending: false }).limit(500);
      if (locFilter) mvQ = mvQ.eq("location_id", locFilter);
      const { data: mvRows } = await mvQ;
      movements = (mvRows || []).map((m: any) => ({
        locationId: m.location_id,
        locationName: getLocation(m.location_id)?.short || m.location_id,
        itemId: m.item_id, qty: m.qty, before: m.stock_before, after: m.stock_after,
        orderNo: m.order_no, reason: m.reason, createdAt: m.created_at,
      }));
    } catch { /* not migrated yet */ }

    return NextResponse.json({
      ok: true,
      range: { from, to, locationId: locFilter },
      locations: LOCATIONS.map((l) => ({ id: l.id, name: l.short })),
      summary: { orders: orders.length, revenue: totalRevenue, freeCookies, freeDrinks },
      daily, items, byLocation, redemptions, inventory, movements,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
