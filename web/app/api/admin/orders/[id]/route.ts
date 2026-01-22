import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

type Ctx = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;
    if (!orderId || orderId === "undefined" || !isUuid(orderId)) {
      return NextResponse.json({ ok: false, error: `Invalid order id: ${orderId}` }, { status: 400 });
    }

    const supabase = supaAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    // ✅ items come from orders.items_json
    const items = Array.isArray(order.items_json) ? order.items_json : [];

    // normalize for UI (OrderDetailClient expects item_name + quantity)
    const itemsNormalized = items.map((it: any) => ({
      item_name: it?.name || it?.item_name || "Item",
      quantity: Number(it?.quantity || 0),
    }));

    return NextResponse.json({ ok: true, order, items: itemsNormalized });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load order" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;
    if (!orderId || orderId === "undefined" || !isUuid(orderId)) {
      return NextResponse.json({ ok: false, error: `Invalid order id: ${orderId}` }, { status: 400 });
    }

    const supabase = supaAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};

    if (typeof body.payment_status === "string") {
      patch.payment_status = body.payment_status;
      if (body.payment_status.toUpperCase() === "PAID") patch.paid_at = new Date().toISOString();
    }
    if (typeof body.fullfillment_status === "string") patch.fullfillment_status = body.fullfillment_status;
    if (typeof body.shipment_status === "string") patch.shipment_status = body.shipment_status;
    if (typeof body.tracking_url === "string") patch.tracking_url = body.tracking_url;
    if (typeof body.waybill === "string") patch.waybill = body.waybill;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to update order" }, { status: 500 });
  }
}
