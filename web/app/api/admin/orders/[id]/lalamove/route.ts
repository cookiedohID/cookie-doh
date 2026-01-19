import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import SDKClient from "@lalamove/lalamove-js";

type Ctx = { params: Promise<{ id: string }> };

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function getLalamoveHost() {
  const env = (process.env.LALAMOVE_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com";
}

async function geocodeAddress(address: string) {
  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "";

  if (!key) throw new Error("Missing GOOGLE_MAPS_SERVER_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)");

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);

  if (j.status !== "OK" || !j.results?.length) {
    throw new Error(`Geocode failed: ${j.status || "NO_RESULTS"}`);
  }

  const loc = j.results[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
    throw new Error("Geocode returned no lat/lng");
  }

  return { lat: loc.lat, lng: loc.lng, formatted: j.results[0]?.formatted_address || "" };
}

export async function POST(_req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;
    const supabase = supaAdmin();

    // IMPORTANT: match your column names
    const { data: order, error: e1 } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, shipping_address, building_name, destination_area_label, destination_area_id, tracking_url, fulfillment_status"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (e1) throw e1;
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const { data: items, error: e2 } = await supabase
      .from("order_items")
      .select("id, order_id, item_name, quantity")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (e2) throw e2;

    const apiKey = process.env.LALAMOVE_API_KEY || "";
    const apiSecret = process.env.LALAMOVE_API_SECRET || "";
    const market = process.env.LALAMOVE_MARKET || "ID";
    const serviceType = process.env.LALAMOVE_SERVICE_TYPE || "MOTORCYCLE";
    const language = process.env.LALAMOVE_LANGUAGE || "id_ID";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ ok: false, error: "Missing LALAMOVE_API_KEY / LALAMOVE_API_SECRET" }, { status: 500 });
    }

    // Pickup (your kitchen)
    const pickupName = process.env.LALAMOVE_PICKUP_NAME || "Cookie Doh";
    const pickupPhone = process.env.LALAMOVE_PICKUP_PHONE || "";
    const pickupAddress = process.env.LALAMOVE_PICKUP_ADDRESS || "";
    const pickupLat = Number(process.env.LALAMOVE_PICKUP_LAT || process.env.COOKIE_DOH_ORIGIN_LAT || "");
    const pickupLng = Number(process.env.LALAMOVE_PICKUP_LNG || process.env.COOKIE_DOH_ORIGIN_LNG || "");

    if (!pickupAddress || !pickupPhone || !pickupLat || !pickupLng) {
      return NextResponse.json(
        { ok: false, error: "Missing Lalamove pickup env (LALAMOVE_PICKUP_ADDRESS/PHONE/LAT/LNG)" },
        { status: 500 }
      );
    }

    // Destination address string for geocoding
    const destText = [
      order.building_name || "",
      order.shipping_address || "",
      order.destination_area_label || "",
      "Indonesia",
    ]
      .filter(Boolean)
      .join(", ");

    const dest = await geocodeAddress(destText);

    const customerName = order.customer_name || "Customer";
    const customerPhone = order.customer_phone || "";

    const remarks = [
      `Cookie Doh Order: ${orderId}`,
      ...(items || []).slice(0, 12).map((it: any) => `${it.item_name || "Item"} x${it.quantity || 0}`),
    ];

    const client = new SDKClient.Client({
      apiKey,
      apiSecret,
      market,
      host: getLalamoveHost(),
      language,
    });

    // 1) Quotation
    const quotationPayload: any = {
      serviceType,
      stops: [
        {
          location: { lat: pickupLat, lng: pickupLng },
          addresses: { en: pickupAddress },
        },
        {
          location: { lat: dest.lat, lng: dest.lng },
          addresses: { en: order.shipping_address || dest.formatted || destText },
        },
      ],
      item: {
        quantity: "1",
        weight: "1",
        categories: ["FOOD_DELIVERY"],
        handlingInstructions: ["KEEP_UPRIGHT"],
      },
      isPODEnabled: false,
    };

    const quotation = await client.Quotation.createQuotation(quotationPayload);
    const quotationId = quotation?.data?.quotationId;
    if (!quotationId) throw new Error("Failed to get Lalamove quotationId");

    // 2) Place order
    const placeOrderPayload: any = {
      quotationId,
      sender: {
        stopId: quotation?.data?.stops?.[0]?.stopId,
        name: pickupName,
        phone: pickupPhone,
      },
      recipients: [
        {
          stopId: quotation?.data?.stops?.[1]?.stopId,
          name: customerName,
          phone: customerPhone,
          remarks,
        },
      ],
      metadata: { cookieDohOrderId: orderId },
    };

    const placed = await client.Order.placeOrder(placeOrderPayload);
    const lalamoveOrderId = placed?.data?.orderId;
    if (!lalamoveOrderId) throw new Error("Failed to place Lalamove order");

    // 3) Get order details to extract share link
    const details = await client.Order.getOrderDetails({ orderId: lalamoveOrderId } as any);
    const shareLink = details?.data?.shareLink || "";

    // Save tracking + status
    const patch: any = {
      tracking_url: shareLink || null,
      fulfillment_status: "sent",
      // optional if your orders table has these columns:
      // shipping_provider: "lalamove",
      // shipping_ref: lalamoveOrderId,
    };

    const { error: e3 } = await supabase.from("orders").update(patch).eq("id", orderId);
    if (e3) throw e3;

    return NextResponse.json({ ok: true, lalamoveOrderId, shareLink, dest });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Lalamove create failed" }, { status: 500 });
  }
}
