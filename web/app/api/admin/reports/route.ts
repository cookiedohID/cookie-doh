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

// Indonesian business day (WIB, UTC+7) — used by the TBS money reports so an
// evening sale doesn't drift to the next day.
function dayStrWib(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return "";
  return new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
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
    const dailyDetail: Record<string, Array<{ id: string; orderNo: any; total: number; items: { name: string; qty: number }[] }>> = {};
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
      dailyDetail[d] = dailyDetail[d] || [];
      dailyDetail[d].push({
        id: o.id,
        orderNo: o.order_no ?? null,
        total: rev,
        items: (Array.isArray(o.items_json) ? o.items_json : [])
          .map((it: any) => ({ name: String(it?.name ?? "Item"), qty: Math.max(0, Math.floor(Number(it?.quantity ?? 0))) }))
          .filter((x: any) => x.qty > 0),
      });
      locMap[o._loc] = locMap[o._loc] || { orders: 0, revenue: 0 };
      locMap[o._loc].orders += 1; locMap[o._loc].revenue += rev;

      const items = Array.isArray(o.items_json) ? o.items_json : [];
      for (const it of items) {
        const id = String(it?.id ?? "");
        if (!id) continue;
        if (it?.kind === "tbs" || id.startsWith("tbs:")) continue; // TBS groceries get their own per-store breakdown
        const name = String(it?.name ?? id);
        const kind = classifyItem(id, it?.kind);
        const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
        if (!qty) continue;
        const isFree = it?.free === true; // only explicit reward redemptions, not price-0 box lines
        // bundle/spend-reward lines are priced at the box level (special price), not
        // per-cookie — don't attribute the per-item placeholder price to them.
        const isBundleLine = it?.bundle === true;
        const lineRev = isFree || isBundleLine ? 0 : Number(it?.price ?? 0) * qty;

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

    // ---- TBS settlement + marketplace fee ------------------------------------
    // Marketplace model (owner decision 2026-07-04): Cookie Doh and TBS keep
    // separate books; CD is the marketplace and charges TBS a platform fee on
    // the TBS GOODS value (delivery excluded — courier money). The store is
    // owed items + delivery; TBS owes CD the fee; net transfer = the difference.
    // Fee % comes from ?tbs_fee_pct= or TBS_MARKETPLACE_FEE_PCT (default 5).
    const feePct = Math.min(50, Math.max(0, Number(url.searchParams.get("tbs_fee_pct") ?? process.env.TBS_MARKETPLACE_FEE_PCT ?? 5) || 0));
    // The TBS money numbers must MATCH the Tukar Faktur to the rupiah, so this
    // block re-queries with WIB day boundaries (the main report window is UTC).
    const { data: tbsOrderRows } = await supa
      .from("orders")
      .select("id, order_no, paid_at, created_at, total_idr, items_json, meta")
      .eq("payment_status", "PAID")
      .gte("paid_at", new Date(Date.parse(fromIso) - 7 * 3600 * 1000).toISOString())
      .lte("paid_at", new Date(Date.parse(toIso) - 7 * 3600 * 1000).toISOString())
      .order("paid_at", { ascending: true })
      .limit(5000);
    const tbsOrders = (tbsOrderRows || []).filter((o: any) => o?.meta?.tbs?.store);
    const tbsMap: Record<string, { store: string; orders: number; items_idr: number; delivery_idr: number; collected_idr: number; fee_idr: number; net_transfer_idr: number }> = {};
    const tbsFeeOrders: Array<{ date: string; order_id: string; order_no: any; store: string; items_idr: number; delivery_idr: number; fee_idr: number; net_idr: number; collected_idr: number }> = [];
    const tbsDailyMap: Record<string, { date: string; store: string; orders: number; items_idr: number; delivery_idr: number; fee_idr: number; net_idr: number }> = {};
    const tbsProductMap: Record<string, { store: string; sku: string; name: string; qty: number; revenue: number }> = {};
    for (const o of tbsOrders) {
      const t = (o as any)?.meta?.tbs;
      if (!t?.store) continue;
      const key = String(t.store);
      const row = (tbsMap[key] ||= { store: key, orders: 0, items_idr: 0, delivery_idr: 0, collected_idr: 0, fee_idr: 0, net_transfer_idr: 0 });
      const fee = Math.round(Number(t.delivery_fee) || 0);
      const total = Math.round(Number((o as any).total_idr) || 0);
      const tbsItems = (Array.isArray((o as any).items_json) ? (o as any).items_json : [])
        .filter((it: any) => it?.kind === "tbs")
        .reduce((n: number, it: any) => n + Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      const itemsResolved = tbsItems > 0 ? tbsItems : Math.max(0, total - fee);
      const platformFee = Math.round((itemsResolved * feePct) / 100);
      row.orders += 1;
      row.delivery_idr += fee;
      row.items_idr += itemsResolved;
      row.collected_idr += total;
      row.fee_idr += platformFee;
      const wibDate = dayStrWib((o as any).paid_at || (o as any).created_at);
      tbsFeeOrders.push({
        date: wibDate,
        order_id: String((o as any).id), order_no: (o as any).order_no ?? null,
        store: key, items_idr: itemsResolved, delivery_idr: fee, fee_idr: platformFee,
        net_idr: itemsResolved + fee - platformFee, collected_idr: total,
      });
      const dk = `${wibDate}|${key}`;
      const day = (tbsDailyMap[dk] ||= { date: wibDate, store: key, orders: 0, items_idr: 0, delivery_idr: 0, fee_idr: 0, net_idr: 0 });
      day.orders += 1; day.items_idr += itemsResolved; day.delivery_idr += fee; day.fee_idr += platformFee;
      day.net_idr += itemsResolved + fee - platformFee;
      for (const it of (Array.isArray((o as any).items_json) ? (o as any).items_json : [])) {
        if (it?.kind !== "tbs" || !it?.sku) continue;
        const q = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
        if (!q) continue;
        const pk = `${key}|${String(it.sku)}`;
        const prod = (tbsProductMap[pk] ||= { store: key, sku: String(it.sku), name: String(it?.name || it.sku), qty: 0, revenue: 0 });
        prod.qty += q;
        prod.revenue += Math.round((Number(it?.price) || 0) * q);
      }
    }
    for (const r of Object.values(tbsMap)) r.net_transfer_idr = r.items_idr + r.delivery_idr - r.fee_idr;
    const tbsSettlement = Object.values(tbsMap).sort((a, b) => b.items_idr - a.items_idr);
    tbsFeeOrders.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.store.localeCompare(b.store)));
    const tbsDaily = Object.values(tbsDailyMap).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.store.localeCompare(b.store)));
    const tbsProducts = Object.values(tbsProductMap).sort((a, b) => b.revenue - a.revenue).slice(0, 300);

    return NextResponse.json({
      ok: true,
      range: { from, to, locationId: locFilter },
      locations: LOCATIONS.map((l) => ({ id: l.id, name: l.short })),
      summary: { orders: orders.length, revenue: totalRevenue, freeCookies, freeDrinks },
      daily, dailyDetail, items, byLocation, redemptions, inventory, movements, tbsSettlement,
      tbsDaily,
      tbsProducts,
      tbsFee: {
        pct: feePct,
        orders: tbsFeeOrders,
        total_items_idr: tbsFeeOrders.reduce((n, r) => n + r.items_idr, 0),
        total_fee_idr: tbsFeeOrders.reduce((n, r) => n + r.fee_idr, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
