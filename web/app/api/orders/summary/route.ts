// web/app/api/orders/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseItems(itemsJson: any): { name: string; quantity: number }[] {
  // Accept array, JSON string, or { items: [] }
  let items: any[] = [];

  if (Array.isArray(itemsJson)) items = itemsJson;
  else if (typeof itemsJson === "string") {
    try {
      const parsed = JSON.parse(itemsJson);
      if (Array.isArray(parsed)) items = parsed;
      else if (parsed && Array.isArray((parsed as any).items)) items = (parsed as any).items;
    } catch {
      items = [];
    }
  } else if (itemsJson && typeof itemsJson === "object") {
    if (Array.isArray((itemsJson as any).items)) items = (itemsJson as any).items;
  }

  const out: { name: string; quantity: number }[] = [];
  for (const it of items) {
    const name = String(it?.name ?? it?.title ?? it?.item_name ?? "Cookie").trim();
    const qty = Number(it?.quantity ?? it?.qty ?? 0);
    if (!name) continue;
    if (Number.isFinite(qty) && qty > 0) out.push({ name, quantity: qty });
  }

  // Merge duplicates by name
  const map = new Map<string, number>();
  for (const it of out) map.set(it.name, (map.get(it.name) || 0) + it.quantity);

  return Array.from(map.entries()).map(([name, quantity]) => ({ name, quantity }));
}

function buildSummary(order: any) {
  const order_no = String(order?.order_no || "").trim();
  const payment_status = String(order?.payment_status || "").trim();
  const shipment_status = String(order?.shipment_status || "").trim();

  const customer_name = String(order?.customer_name || "").trim();
  const customer_phone = String(order?.customer_phone || "").trim();

  const address = String(order?.shipping_address || order?.address || "").trim();
  const total = Number(order?.total_idr ?? 0);

  // fulfillment schedule lives in meta.fulfillment
  const meta = order?.meta && typeof order.meta === "object" ? order.meta : null;
  const fulfillment = meta?.fulfillment || null;
  const pickup = meta?.pickup || null;

  const fulfilType = String(fulfillment?.type || order?.fulfillment_status || "").trim();
  const scheduleDate = String(fulfillment?.scheduleDate || "").trim();
  const scheduleTime = String(fulfillment?.scheduleTime || "").trim();

  const fulfilmentText =
    fulfilType
      ? `${fulfilType}${scheduleDate || scheduleTime ? ` • ${[scheduleDate, scheduleTime].filter(Boolean).join(" ")}` : ""}`
      : "-";

  const pickupPoint = String(pickup?.pointName || "").trim();

  const items = parseItems(order?.items_json);

  return {
    ok: true,
    order: {
      id: String(order?.id || ""),
      order_no,
      payment_status,
      fulfilment: fulfilmentText,
      shipment_status,
      customer_name,
      customer_phone,
      address,
      total_idr: Number.isFinite(total) ? total : 0,
      items,
      pickup_point: pickupPoint || null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const order_id = (req.nextUrl.searchParams.get("order_id") || "").trim();
    if (!order_id) return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    if (!isUuid(order_id)) return NextResponse.json({ ok: false, error: "Invalid order_id" }, { status: 400 });

    const sb = supaAdmin();

    const { data: order, error } = await sb
      .from("orders")
      .select("id, order_no, payment_status, shipment_status, fulfillment_status, customer_name, customer_phone, shipping_address, address, total_idr, items_json, meta")
      .eq("id", order_id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    return NextResponse.json(buildSummary(order), { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load order summary" }, { status: 500 });
  }
}
