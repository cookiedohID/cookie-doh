import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
};

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const sb = supabaseAdmin();

    let order: any = null;

    // 1) If it's a UUID, lookup by orders.id
    if (isUuid(orderId)) {
      const r = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      order = r.data;
    }

    // 2) Fallback: lookup by midtrans_order_id
    if (!order) {
      const r = await sb
        .from("orders")
        .select("*")
        .eq("midtrans_order_id", orderId)
        .maybeSingle();
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
      order = r.data;
    }

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Parse items_json safely
    let items: any[] = [];
    try {
      const raw = order.items_json;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      items = [];
    }

    const meta = order?.meta && typeof order.meta === "object" ? order.meta : {};
    const mid = meta?.midtrans && typeof meta.midtrans === "object" ? meta.midtrans : {};
    const fulf = meta?.fulfillment && typeof meta.fulfillment === "object" ? meta.fulfillment : {};

    const shaped = {
      id: order.id,
      order_no: order.order_no,

      // payment & shipment
      payment_status: order.payment_status,
      shipment_status: order.shipment_status ?? null,

      // midtrans details (for WA summary)
      payment_type: mid?.payment_type ?? null,
      transaction_status: order.midtrans_status ?? mid?.transaction_status ?? null,

      // fulfillment & schedule (for WA summary)
      fulfilment_status: order.fulfilment_status ?? null,
      schedule_date: fulf?.scheduleDate ?? null,
      schedule_time: fulf?.scheduleTime ?? null,

      // customer & address
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      shipping_address: order.shipping_address,

      // totals & items
      total_idr: order.total_idr,
      items: items.map((it: any) => ({
        name: String(it.name ?? it.title ?? "Cookie"),
        quantity: Number(it.quantity ?? 1),
        price_idr: Number(it.price ?? it.value ?? it.unit_price ?? 0) || 0,
      })),
    };


    return NextResponse.json({ ok: true, order: shaped });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
