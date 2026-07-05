// web/lib/orderStage.ts — customer-facing fulfilment stage for an order
// (Shopee-style tabs). Shared by My Orders and the order detail page.
export type OrderStage = "topay" | "preparing" | "ready" | "done" | "cancelled";

export function orderStage(o: { status: string; tbs?: { stage?: string | null } | null }): OrderStage {
  const pay = String(o.status).toUpperCase();
  if (pay === "PENDING" || pay === "UNPAID") return "topay";
  if (pay === "FAILED") return "cancelled";
  const st = o.tbs?.stage;
  if (st === "new" || st === "confirmed") return "preparing";
  if (st === "ready") return "ready";
  if (st === "cancelled") return "cancelled";
  if (st === "completed") return "done";
  // CD-only paid orders: the bakery flow has no store queue — treat as done.
  // A TBS order with no live stage (ERP briefly unreachable) shows preparing.
  return o.tbs ? "preparing" : "done";
}

export const STAGE_LABEL: Record<string, string> = {
  topay: "💳 To pay", preparing: "👩‍🍳 Being prepared", ready: "🛍 Ready / on the way", done: "✅ Completed", cancelled: "✗ Cancelled",
};
