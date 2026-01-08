import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const midtrans_order_id = String(body?.midtrans_order_id ?? "").trim();

    if (!midtrans_order_id) {
      return NextResponse.json({ ok: false, error: "Missing midtrans_order_id" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data: order, error: findErr } = await sb
      .from("orders")
      .select("midtrans_order_id,shipment_status")
      .eq("midtrans_order_id", midtrans_order_id)
      .maybeSingle();

    if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    // Idempotent
    if (String(order.shipment_status ?? "").toLowerCase() === "fulfilled") {
      return NextResponse.json({ ok: true, status: "already-fulfilled" });
    }

    const { error: updErr } = await sb
      .from("orders")
      .update({
        shipment_status: "fulfilled",
      })
      .eq("midtrans_order_id", midtrans_order_id);

    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: "fulfilled" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
