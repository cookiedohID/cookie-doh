import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;

    const sb = supabaseAdmin();

    // Adjust lookup if your order id is not UUID (could be midtrans_order_id)
    // Here I assume "midtrans_order_id" is what you pass as order_id in URL.
    const { data: order, error } = await sb
      .from("orders")
      .select("*")
      .eq("midtrans_order_id", orderId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Parse items (depends on your schema)
    let items: any[] = [];
    const raw = order.items_json;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      items = [];
    }

    const shaped = {
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      shipping_address: order.shipping_address,
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
