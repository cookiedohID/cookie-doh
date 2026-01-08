import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function genManualMidtransOrderId() {
  const rand = Math.random().toString(16).slice(2);
  return `MANUAL-${Date.now()}-${rand}`.toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json();

    const customer_name = String(body?.customer_name ?? "").trim();
    const customer_phone = String(body?.customer_phone ?? "").trim();
    const email = String(body?.email ?? "").trim();

    const shipping_address = String(body?.shipping_address ?? "").trim();
    const destination_area_id = String(body?.destination_area_id ?? "").trim();
    const destination_area_label = String(body?.destination_area_label ?? "").trim();
    const postal = String(body?.postal ?? "").trim();

    const notes = String(body?.notes ?? "").trim();

    const subtotal_idr = Number(body?.subtotal_idr ?? 0) || null;
    const shipping_cost_idr = Number(body?.shipping_cost_idr ?? 0) || null;
    const total_idr = Number(body?.total_idr ?? 0) || null;

    const courier_company = String(body?.courier_company ?? "").trim() || null;
    const courier_type = String(body?.courier_type ?? "").trim() || null;

    const items_json = body?.items_json ?? null;
    const customer_json = body?.customer_json ?? null;
    const shipping_json = body?.shipping_json ?? null;

    if (!customer_name) return NextResponse.json({ ok: false, error: "Missing customer_name" }, { status: 400 });
    if (!customer_phone) return NextResponse.json({ ok: false, error: "Missing customer_phone" }, { status: 400 });
    if (!email) return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });

    if (!shipping_address) return NextResponse.json({ ok: false, error: "Missing shipping_address" }, { status: 400 });
    if (!destination_area_id) return NextResponse.json({ ok: false, error: "Missing destination_area_id" }, { status: 400 });
    if (!postal) return NextResponse.json({ ok: false, error: "Missing postal" }, { status: 400 });

    const midtrans_order_id = genManualMidtransOrderId();

    const { data, error } = await sb
      .from("orders")
      .insert({
        customer_name,
        customer_phone,
        email,

        address: shipping_address,
        shipping_address,
        city: null,
        postal,

        destination_area_id,
        destination_area_label,

        notes,

        subtotal_idr,
        shipping_cost_idr,
        total_idr,

        courier_company,
        courier_type,

        items_json,
        customer_json,
        shipping_json,

        payment_status: "PENDING",
        shipment_status: "not_created",

        midtrans_order_id,
        midtrans_status: "manual",
        midtrans_transaction_status: null,
      })
      .select("order_no, midtrans_order_id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order_no: data.order_no, order_id: data.midtrans_order_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
