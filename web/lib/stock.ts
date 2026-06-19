// web/lib/stock.ts
//
// Decrement per-location stock when an order is paid. Never throws.

import { locationForOrder } from "@/lib/locations";

export async function decrementStockForOrder(supabase: any, order: any): Promise<void> {
  try {
    // Which store fulfils this order — shared resolver (keeps stock + reports
    // attributing to the same location).
    const locationId = locationForOrder(order);

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
      const before = Number(row.stock);
      const next = Math.max(0, before - (qtyById[id] || 0));
      await supabase
        .from("location_stock")
        .update({ stock: next, updated_at: new Date().toISOString() })
        .eq("location_id", locationId)
        .eq("item_id", id);

      // Audit log for the inventory-transactions report. Best-effort only —
      // wrapped so a missing table or insert error can never abort settlement.
      try {
        await supabase.from("stock_movements").insert({
          location_id: locationId,
          item_id: id,
          qty: before - next, // units actually removed
          stock_before: before,
          stock_after: next,
          order_id: order?.id ?? null,
          order_no: order?.order_no ?? null,
          reason: "order",
        });
      } catch {
        /* table may not exist yet / transient — ignore */
      }
    }
  } catch (e) {
    console.error("[stock] decrement failed:", e);
  }
}
