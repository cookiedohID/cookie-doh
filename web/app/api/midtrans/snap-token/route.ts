import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Item = {
  id: string;
  name: string;
  price: number; // IDR integer
  quantity: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const items: Item[] = Array.isArray(body?.items) ? body.items : [];

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return NextResponse.json(
        { error: "Missing MIDTRANS_SERVER_KEY env var" },
        { status: 500 }
      );
    }

    if (!items.length) {
      return NextResponse.json({ error: "No items" }, { status: 400 });
    }

    // sanitize items (Midtrans expects ints)
    const safeItems = items.map((it) => ({
      id: String(it.id),
      name: String(it.name).slice(0, 50),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    }));

    const gross_amount = safeItems.reduce(
      (sum, it) => sum + it.price * it.quantity,
      0
    );

    if (gross_amount <= 0) {
      return NextResponse.json(
        { error: "Invalid gross_amount (must be > 0)" },
        { status: 400 }
      );
    }

    // Join key across Supabase <-> Midtrans <-> webhook <-> Biteship
    const midtrans_order_id = `CD-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;

    const supabase = supabaseServer();

    // IMPORTANT: store courier choice here so webhook is deterministic
    // Expected fields in body.shipping:
    // - destination_area_id, destination_area_label, address, courier_company, courier_type, courier_service
    const courier_company =
      body?.shipping?.courier_company ??
      body?.shipping?.courierCompany ??
      null;
    const courier_type =
      body?.shipping?.courier_type ?? body?.shipping?.courierType ?? null;
    const courier_service =
      body?.shipping?.courier_service ??
      body?.shipping?.courierService ??
      null;

    const { data: orderRow, error: dbErr } = await supabase
      .from("orders")
      .insert({
        midtrans_order_id,
        amount: gross_amount,
        currency: "IDR",
        items_json: safeItems,
        customer_json: body?.customer ?? null,
        shipping_json: body?.shipping ?? null,

        courier_company,
        courier_type,
        courier_service,

        midtrans_status: "created",
        shipment_status: "not_created",
      })
      .select("id, midtrans_order_id")
      .single();

    if (dbErr) {
      console.error("supabase insert error:", dbErr);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });

    const parameter = {
      transaction_details: {
        order_id: midtrans_order_id,
        gross_amount,
      },
      item_details: safeItems,
      customer_details: body?.customer ?? undefined,
    };

    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({
      id: orderRow.id, // supabase order id (optional)
      order_id: orderRow.midtrans_order_id, // midtrans order id
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err: any) {
    console.error("snap-token error:", err);
    const message =
      err?.message ||
      err?.ApiResponse?.status_message ||
      err?.status_message ||
      String(err);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
