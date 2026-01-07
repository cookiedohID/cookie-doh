import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function getOriginFromEnv() {
  const origin_contact_name = process.env.COOKIE_DOH_ORIGIN_CONTACT_NAME;
  const origin_contact_phone = process.env.COOKIE_DOH_ORIGIN_CONTACT_PHONE;
  const origin_address = process.env.COOKIE_DOH_ORIGIN_ADDRESS;
  const origin_area_id = process.env.COOKIE_DOH_ORIGIN_AREA_ID;

  const origin_lat = process.env.COOKIE_DOH_ORIGIN_LAT
    ? Number(process.env.COOKIE_DOH_ORIGIN_LAT)
    : null;
  const origin_lng = process.env.COOKIE_DOH_ORIGIN_LNG
    ? Number(process.env.COOKIE_DOH_ORIGIN_LNG)
    : null;

  if (!origin_contact_name || !origin_contact_phone || !origin_address) {
    throw new Error(
      "Missing origin env vars (COOKIE_DOH_ORIGIN_CONTACT_NAME/PHONE/ADDRESS)"
    );
  }

  // Prefer area_id; lat/lng optional
  if (!origin_area_id && (origin_lat == null || origin_lng == null)) {
    throw new Error("Missing origin_area_id OR origin_lat/lng env vars");
  }

  return {
    origin_contact_name,
    origin_contact_phone,
    origin_address,
    origin_area_id,
    origin_lat,
    origin_lng,
  };
}

async function createBiteshipOrder(order: any) {
  const apiKey = process.env.BITESHIP_API_KEY;
  if (!apiKey) throw new Error("Missing BITESHIP_API_KEY");

  const base = "https://api.biteship.com";
  const shipping = order.shipping_json || {};
  const customer = order.customer_json || {};
  const items = order.items_json || [];

  const origin = getOriginFromEnv();

  const destination_contact_name =
    customer.first_name
      ? `${customer.first_name} ${customer.last_name ?? ""}`.trim()
      : customer.name ?? "Customer";

  const destination_contact_phone = customer.phone ?? "";
  const destination_address = shipping.address ?? shipping.destination_address ?? "";
  const destination_area_id = shipping.destination_area_id ?? "";

  const destination_lat = shipping.destination_lat ?? null;
  const destination_lng = shipping.destination_lng ?? null;

  if (!destination_contact_phone) throw new Error("Missing customer phone");
  if (!destination_address) throw new Error("Missing destination address");
  if (!destination_area_id && (destination_lat == null || destination_lng == null)) {
    throw new Error("Missing destination_area_id or destination_lat/lng");
  }

  // Use courier saved at order creation (BEST)
  const courier_company =
    order.courier_company ?? shipping.courier_company ?? shipping.courierCompany;
  const courier_type =
    order.courier_type ?? shipping.courier_type ?? shipping.courierType;
  const courier_service =
    order.courier_service ?? shipping.courier_service ?? shipping.courierService;

  if (!courier_company || !courier_type) {
    throw new Error("Missing courier_company/courier_type on order");
  }

  const payload: any = {
    reference_id: order.midtrans_order_id,

    courier_company,
    courier_type,
    courier_service, // optional in some setups but ok if you use it

    origin_contact_name: origin.origin_contact_name,
    origin_contact_phone: origin.origin_contact_phone,
    origin_address: origin.origin_address,
    origin_area_id: origin.origin_area_id,
    origin_lat: origin.origin_lat,
    origin_lng: origin.origin_lng,

    destination_contact_name,
    destination_contact_phone,
    destination_address,
    destination_area_id,
    destination_lat,
    destination_lng,

    // If you know package weight/dimensions, add them later
    items: (items || []).map((it: any) => ({
      name: String(it.name),
      value: Number(it.price),
      quantity: Number(it.quantity),
    })),
  };

  const resp = await fetch(`${base}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      json?.error || json?.message || `Biteship create order failed (${resp.status})`
    );
  }

  return json;
}

export async function POST(req: Request) {
  try {
    const notification = await req.json();

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return NextResponse.json({ error: "Missing MIDTRANS_SERVER_KEY" }, { status: 500 });
    }

    const coreApi = new midtransClient.CoreApi({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });

    // Safer than trusting incoming payload: verify to Midtrans
    const statusResponse = await coreApi.transaction.status(notification.order_id);

    const midtrans_order_id = statusResponse.order_id;
    const txStatus = statusResponse.transaction_status;
    const fraud = statusResponse.fraud_status;

    const paid =
      txStatus === "settlement" ||
      (txStatus === "capture" && (fraud ?? "accept") === "accept");

    const supabase = supabaseServer();

    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("midtrans_order_id", midtrans_order_id)
      .single();

    if (fetchErr || !order) {
      throw fetchErr ?? new Error("Order not found");
    }

    // Update order status
    await supabase
      .from("orders")
      .update({
        midtrans_status: txStatus,
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", order.id);

    // Only create shipment if paid AND not created
    if (paid) {
      // LOCK: mark creating (prevents duplicates on webhook retries)
      // Requires orders.shipment_status column.
      const { data: locked, error: lockErr } = await supabase
        .from("orders")
        .update({ shipment_status: "creating" })
        .eq("id", order.id)
        .eq("shipment_status", "not_created")
        .select("id")
        .maybeSingle();

      // If not locked, it means another webhook already started/finished.
      if (lockErr) throw lockErr;
      if (!locked) {
        return NextResponse.json({ ok: true, txStatus, fraud, shipment: "already_handled" });
      }

      // Double-check shipments table too (extra safety)
      const { data: existing } = await supabase
        .from("shipments")
        .select("id, biteship_order_id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (!existing?.biteship_order_id) {
        const biteship = await createBiteshipOrder(order);

        await supabase.from("shipments").insert({
          order_id: order.id,
          provider: "biteship",
          biteship_order_id: biteship?.id ?? null,
          waybill_id: biteship?.waybill_id ?? null,
          courier_company: order.courier_company ?? null,
          courier_service: order.courier_service ?? null,
          status: biteship?.status ?? "created",
          raw_json: biteship,
        });
      }

      await supabase
        .from("orders")
        .update({ shipment_status: "created" })
        .eq("id", order.id);
    }

    return NextResponse.json({ ok: true, txStatus, fraud, paid });
  } catch (e: any) {
    console.error("midtrans notification error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
