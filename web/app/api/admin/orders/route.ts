import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("orders")
      .select(
        [
          "id",
          "order_no",
          "midtrans_order_id",
          "customer_name",
          "customer_phone",
          "total_idr",
          "payment_status",
          "shipment_status",
          "biteship_order_id",
          "waybill",
          "tracking_url",
          "created_at",
          "courier_company",
          "courier_type",
          "courier_code",
          "courier_service",
          "postal",
          "destination_area_id",
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, orders: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
