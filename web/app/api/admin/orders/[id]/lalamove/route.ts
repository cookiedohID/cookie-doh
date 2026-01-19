import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type Ctx = { params: Promise<{ id: string }> };

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function lalamoveHost() {
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

/**
 * Lalamove v3 signing:
 * Authorization: hmac {apiKey}:{signature}:{timestamp}
 * signature = HMAC_SHA256(secret, timestamp + method + path + body)
 */
function signLalamove(secret: string, timestamp: string, method: string, path: string, body: string) {
  const raw = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

async function lalamoveRequest<T>(
  method: "GET" | "POST",
  path: string,
  bodyObj?: any
): Promise<T> {
  const apiKey = process.env.LALAMOVE_API_KEY || "";
  const apiSecret = process.env.LALAMOVE_API_SECRET || "";
  const market = process.env.LALAMOVE_MARKET || "ID";

  if (!apiKey || !apiSecret) throw new Error("Missing LALAMOVE_API_KEY / LALAMOVE_API_SECRET");

  const host = lalamoveHost();
  const url = `${host}${path}`;

  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const timestamp = `${Date.now()}`; // ms

  const signature = signLalamove(apiSecret, timestamp, method, path, body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `hmac ${apiKey}:${signature}:${timestamp}`,
    Market: market,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Lalamove ${method} ${path} failed (HTTP ${res.status}): ${text || "no body"}`);
  }

  return (json ?? ({} as any)) as T;
}

export async function POST(_req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;
    const supabase = supaAdmin();

    // match your schema
    const { data: order, error: e1 } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, total, shipping_address, building_name, destination_area_label, destination_area_id, tracking_url"
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

    // Pickup env (your kitchen)
    const pickupName = process.env.LALAMOVE_PICKUP_NAME || "Cookie Doh";
    const pickupPhone = process.env.LALAMOVE_PICKUP_PHONE || "";
    const pickupAddress = process.env.LALAMOVE_PICKUP_ADDRESS || "";
    const pickupLat = Number(process.env.LALAMOVE_PICKUP_LAT || process.env.COOKIE_DOH_ORIGIN_LAT || "");
    const pickupLng = Number(process.env.LALAMOVE_PICKUP_LNG || process.env.COOKIE_DOH_ORIGIN_LNG || "");
    const serviceType = process.env.LALAMOVE_SERVICE_TYPE || "MOTORCYCLE";

    if (!pickupPhone || !pickupAddress || !pickupLat || !pickupLng) {
      return NextResponse.json(
        { ok: false, error: "Missing pickup env (LALAMOVE_PICKUP_ADDRESS/PHONE/LAT/LNG)" },
        { status: 500 }
      );
    }

    const destText = [
      order.building_name || "",
      order.shipping_address || "",
      order.destination_area_label || "",
      "Indonesia",
    ]
      .filter(Boolean)
      .join(", ");

    const dest = await geocodeAddress(destText);

    const dropAddress = order.shipping_address || dest.formatted || destText;

    const remarks = [
      `Cookie Doh Order: ${orderId}`,
      ...(items || []).slice(0, 12).map((it: any) => `${it.item_name || "Item"} x${it.quantity || 0}`),
    ];

    // 1) Create quotation
    const quotationBody = {
      serviceType,
      stops: [
        {
          location: { lat: pickupLat, lng: pickupLng },
          addresses: { en: pickupAddress },
        },
        {
          location: { lat: dest.lat, lng: dest.lng },
          addresses: { en: dropAddress },
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

    const quotationResp: any = await lalamoveRequest("POST", "/v3/quotations", quotationBody);
    const quotationId = quotationResp?.data?.quotationId;
    const stop0 = quotationResp?.data?.stops?.[0]?.stopId;
    const stop1 = quotationResp?.data?.stops?.[1]?.stopId;

    if (!quotationId || !stop0 || !stop1) {
      throw new Error(`Invalid quotation response: ${JSON.stringify(quotationResp)}`);
    }

    // 2) Place order
    const placeBody = {
      quotationId,
      sender: { stopId: stop0, name: pickupName, phone: pickupPhone },
      recipients: [
        {
          stopId: stop1,
          name: order.customer_name || "Customer",
          phone: order.customer_phone || "",
          remarks,
        },
      ],
      metadata: { cookieDohOrderId: orderId },
    };

    const placeResp: any = await lalamoveRequest("POST", "/v3/orders", placeBody);
    const lalamoveOrderId = placeResp?.data?.orderId;
    if (!lalamoveOrderId) throw new Error(`Invalid place order response: ${JSON.stringify(placeResp)}`);

    // 3) Get order details (shareLink)
    const detailsResp: any = await lalamoveRequest("GET", `/v3/orders/${lalamoveOrderId}`);
    const shareLink = detailsResp?.data?.shareLink || "";

    // Update order with tracking + status
    const patch: any = {
      tracking_url: shareLink || null,
      fulfillment_status: "sent",
      // optional fields if you have them:
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
