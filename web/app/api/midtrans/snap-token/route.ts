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

function normalizePhone(p: string) {
  return String(p || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return NextResponse.json(
        { error: "Missing MIDTRANS_SERVER_KEY env var" },
        { status: 500 }
      );
    }

    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: "No items" }, { status: 400 });

    const customerName =
      String(body?.customer?.name ?? "").trim() ||
      String(`${body?.customer?.first_name ?? ""} ${body?.customer?.last_name ?? ""}`.trim()).trim();

    const customerPhoneRaw = String(body?.customer?.phone ?? "").trim();
    const customerPhoneDigits = normalizePhone(customerPhoneRaw);

    if (!customerName) return NextResponse.json({ error: "Missing customer.name" }, { status: 400 });
    if (customerPhoneDigits.length < 9) {
      return NextResponse.json({ error: "Missing/invalid customer.phone" }, { status: 400 });
    }

    const safeItems = items.map((it) => ({
      id: String(it.id),
      name: String(it.name).slice(0, 50),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    }));

    const gross_amount = safeItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    if (gross_amount <= 0) {
      return NextResponse.json({ error: "Invalid gross_amount (must be > 0)" }, { status: 400 });
    }

    const midtrans_order_id = `CD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const shippingAddress = String(body?.shipping?.address ?? "").trim();
    const destination_area_id = String(body?.shipping?.destination_area_id ?? "").trim();
    const destination_area_label = String(body?.shipping?.destination_area_label ?? "").trim();

    const courier_company = String(body?.shipping?.courier_company ?? "").trim() || null;
    const courier_type = String(body?.shipping?.courier_type ?? "").trim() || null;
    const courier_service = String(body?.shipping?.courier_service ?? "").trim() || null;

    const supabase = supabaseServer();

    const insertPayload: any = {
      midtrans_order_id,
      amount: gross_amount,
      currency: "IDR",
      items_json: safeItems,
      customer_json: body?.customer ?? { name: customerName, phone: customerPhoneRaw },
      shipping_json: body?.shipping ?? null,
      midtrans_status: "created",

      // for NOT NULL columns
      customer_name: customerName,
      customer_phone: customerPhoneRaw,

      // optional shipping columns (only if they exist in your table)
      shipping_address: shippingAddress || null,
      destination_area_id: destination_area_id || null,
      destination_area_label: destination_area_label || null,

      // optional courier columns
      courier_company,
      courier_type,
      courier_service,
    };

    const { data: orderRow, error: dbErr } = await supabase
      .from("orders")
      .insert(insertPayload)
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
      customer_details: {
        first_name: customerName.split(" ")[0] || customerName,
        last_name: customerName.split(" ").slice(1).join(" ") || undefined,
        phone: customerPhoneRaw,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({
      id: orderRow.id,
      order_id: orderRow.midtrans_order_id,
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err: any) {
    console.error("snap-token error:", err);
    const message =
      err?.message || err?.ApiResponse?.status_message || err?.status_message || String(err);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
