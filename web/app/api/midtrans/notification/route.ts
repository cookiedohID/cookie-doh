import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function isJakartaFromShipping(shipping: any) {
  const label = String(
    shipping?.destination_area_label ??
      shipping?.area_label ??
      shipping?.city ??
      shipping?.destination_city ??
      ""
  ).toLowerCase();

  // Good enough MVP: any label containing "jakarta" or "dki"
  return label.includes("jakarta") || label.includes("dki");
}

function getOriginFromEnv() {
  const origin_contact_name = process.env.COOKIE_DOH_ORIGIN_CONTACT_NAME;
  const origin_contact_phone = process.env.COOKIE_DOH_ORIGIN_CONTACT_PHONE;
  const origin_address = process.env.COOKIE_DOH_ORIGIN_ADDRESS;
  const origin_area_id = process.env.COOKIE_DOH_ORIGIN_AREA_ID;
  const origin_lat = process.env.COOKIE_DOH_ORIGIN_LAT ? Number(process.env.COOKIE_DOH_ORIGIN_LAT) : null;
  const origin_lng = process.env.COOKIE_DOH_ORIGIN_LNG ? Number(process.env.COOKIE_DOH_ORIGIN_LNG) : null;

  if (!origin_contact_name || !origin_contact_phone || !origin_address) {
    throw new Error("Missing origin env vars (COOKIE_DOH_ORIGIN_CONTACT_NAME/PHONE/ADDRESS)");
  }

  // For Biteship, best is area_id; lat/lng helps for instant
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

async function createBiteshipOrder({ order, shipmentRule }: any) {
  const apiKey = process.env.BITESHIP_API_KEY;
  if (!apiKey) throw new Error("Missing BITESHIP_API_KEY");

  const base = "https://api.biteship.com";

  const shipping = order.shipping_json || {};
  const customer = order.customer_json || {};
  const items = order.items_json || [];

  const origin = getOriginFromEnv();

  const destination_contact_name =
    customer.first_name ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : "Customer";
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

  const payload: any = {
    reference_id: order.midtrans_order_id,
    courier_company: shipmentRule.courier_company,
    courier_type: shipmentRule.courier_type,
    courier_service: shipmentRule.courier_service,

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

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error || json?.message || `Biteship create order failed (${resp.status})`);
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

    // Verify with Midtrans status API :contentReference[oaicite:7]{index=7}
    const statusResponse = await coreApi.transaction.status(notification.order_id);

    const midtrans_order_id = statusResponse.order_id;
    const txStatus = statusResponse.transaction_status;
    const fraud = statusResponse.fraud_status;

    const supabase = supabaseServer();

    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("midtrans_order_id", midtrans_order_id)
      .single();

    if (fetchErr) throw fetchErr;

    const paid = txStatus === "settlement" || txStatus === "capture";
    const paid_at = paid ? new Date().toISOString() : null;

    await supabase
      .from("orders")
      .update({ midtrans_status: txStatus, paid_at })
      .eq("id", order.id);

    // If PAID, create Biteship shipment (one-time)
    if (paid) {
      // Avoid duplicate shipment creation
      const { data: existing } = await supabase
        .from("shipments")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (!existing) {

        // Your rule:
        // - Jakarta: instant courier Lalamove OR Paxel
        // - Outside Jakarta: Paxel only
        //
        // Default choices (you can change later):
        
        const jakarta = isJakartaFromShipping(order.shipping_json);

        const pref = String(order.shipping_json?.courier_preference || "lalamove").toLowerCase();

        const shipmentRule = jakarta
            ? (pref === "paxel"
            ? { courier_company: "paxel", courier_type: "instant", courier_service: "small_package" }
            : { courier_company: "lalamove", courier_type: "instant", courier_service: "motorbike" })
            : { courier_company: "paxel", courier_type: "standard", courier_service: "small_package" };

        const biteship = await createBiteshipOrder({ order, shipmentRule });

        await supabase.from("shipments").insert({
          order_id: order.id,
          provider: "biteship",
          biteship_order_id: biteship?.id ?? null,
          waybill_id: biteship?.waybill_id ?? null,
          courier_company: shipmentRule.courier_company,
          courier_service: shipmentRule.courier_service,
          status: biteship?.status ?? "created",
          raw_json: biteship,
        });
      }
    }

    return NextResponse.json({ ok: true, txStatus, fraud });
  } catch (e: any) {
    console.error("midtrans notification error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
