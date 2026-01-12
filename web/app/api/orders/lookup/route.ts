import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const order_id = String(searchParams.get("order_id") ?? "").trim();

    if (!order_id) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("orders")
      .select(
        [
          "order_no",
          "midtrans_order_id",
          "customer_name",
          "customer_phone",
          "email",
          "shipping_address",
          "address",
          "postal",
          "destination_area_label",
          "notes",
          "items_json",
          "subtotal_idr",
          "shipping_cost_idr",
          "total_idr",
          "payment_status",
          "shipment_status",
          "tracking_url",
          "created_at",
        ].join(",")
      )
      .eq("midtrans_order_id", order_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, order: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
