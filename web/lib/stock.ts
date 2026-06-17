// web/lib/stock.ts
//
// Decrement per-location stock when an order is paid. Never throws.

import { nearestLocation, DEFAULT_LOCATION_ID } from "@/lib/locations";

export async function decrementStockForOrder(supabase: any, order: any): Promise<void> {
  try {
    // Which store fulfills this order? Prefer the one the customer was quoted
    // from; otherwise recompute from the delivery coordinates.
    let locationId: string | undefined = order?.meta?.quote?.origin?.id;
    if (!locationId) {
      const shipping = order?.shipping_json || {};
      // The delivery object stores coords as lat/lng; older/admin rows use
      // destination_lat/lng — accept either.
      const lat = Number(shipping.destination_lat ?? shipping.lat);
      const lng = Number(shipping.destination_lng ?? shipping.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        locationId = nearestLocation(lat, lng).id;
      }
    }
    // Pickup and cafe orders have neither a quote origin nor delivery coords —
    // fall back to the order's pickup location, else the default store, so
    // in-store and pickup sales still decrement inventory somewhere.
    if (!locationId) locationId = order?.meta?.pickup?.locationId || DEFAULT_LOCATION_ID;

    // Total quantity per item id.
    const items: any[] = Array.isArray(order?.items_json) ? order.items_json : [];
    const qtyById: Record<string, number> = {};
    for (const it of items) {
      const id = String(it?.id ?? "").trim();
      const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
      if (!id || !qty) continue;
      qtyById[id] = (qtyById[id] || 0) + qty;
    }
    const ids = Object.keys(qtyById);
    if (!ids.length) return;

    // Only items that are tracked at this location (stock not null) get decremented.
    const { data: rows, error } = await supabase
      .from("location_stock")
      .select("item_id, stock")
      .eq("location_id", locationId)
      .in("item_id", ids);
    if (error || !rows) return;

    for (const row of rows) {
      if (row?.stock === null || row?.stock === undefined) continue; // untracked
      const id = String(row.item_id);
      const next = Math.max(0, Number(row.stock) - (qtyById[id] || 0));
      await supabase
        .from("location_stock")
        .update({ stock: next, updated_at: new Date().toISOString() })
        .eq("location_id", locationId)
        .eq("item_id", id);
    }
  } catch (e) {
    console.error("[stock] decrement failed:", e);
  }
}
