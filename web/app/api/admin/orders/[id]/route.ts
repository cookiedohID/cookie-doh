import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createLalamoveOrder } from "@/lib/lalamove";

export const runtime = "nodejs";

function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

const toE164ID = (p: string) => {
  const raw = String(p || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  return `+62${raw.replace(/^0/, "")}`;
};

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
};

function getPickupFromEnv() {
  const address = (process.env.COOKIE_DOH_PICKUP_ADDRESS || "").trim();
  const lat = Number(process.env.COOKIE_DOH_PICKUP_LAT || "");
  const lng = Number(process.env.COOKIE_DOH_PICKUP_LNG || "");
  const contactName = (process.env.COOKIE_DOH_PICKUP_NAME || "Cookie Doh").trim();
  const contactPhone = toE164ID(process.env.COOKIE_DOH_PICKUP_PHONE || "");

  if (!address) throw new Error("Missing env COOKIE_DOH_PICKUP_ADDRESS");
  if (!Number.isFinite(lat)) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_LAT");
  if (!Number.isFinite(lng)) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_LNG");
  if (!contactPhone) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_PHONE");

  return { address, lat, lng, contactName, contactPhone };
}

// Parse coords from your stored shipping_json
function parseLatLngFromShippingJson(shipping_json: any) {
  let obj: any = shipping_json;
  if (typeof shipping_json === "string") {
    try {
      obj = JSON.parse(shipping_json);
    } catch {
      obj = null;
    }
  }
  const lat = obj?.destination_lat ?? obj?.lat ?? null;
  const lng = obj?.destination_lng ?? obj?.lng ?? null;

  const nlat = lat == null ? null : Number(lat);
  const nlng = lng == null ? null : Number(lng);

  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ ok: false, error: "Invalid order id" }, { status: 400 });
    }

    // Body is optional (admin page may send pickup/dropoff overrides)
    const body = await req.json().catch(() => ({} as any));

    const sb = supabaseAdmin();

    const { data: order, error: oErr } = await sb
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (oErr) {
      return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
    }

    // optional safety: only book after PAID
    if (String(order.payment_status || "").toUpperCase() !== "PAID") {
      return NextResponse.json(
        { ok: false, error: "Order is not PAID", payment_status: order.payment_status },
        { status: 400 }
      );
    }

    // idempotent: if already booked, return it
    if (order.tracking_url || order.biteship_order_id) {
      return NextResponse.json({
        ok: true,
        alreadyBooked: true,
        shipment_order_id: order.biteship_order_id ?? null,
        tracking_url: order.tracking_url ?? null,
      });
    }

    // Pickup: ENV (preferred) OR override from body
    const pickupEnv = getPickupFromEnv();
    const pickup = {
      address: String(body?.pickup?.address ?? pickupEnv.address).trim(),
      lat: Number(body?.pickup?.lat ?? pickupEnv.lat),
      lng: Number(body?.pickup?.lng ?? pickupEnv.lng),
      contactName: String(body?.pickup?.contactName ?? pickupEnv.contactName).trim(),
      contactPhone: toE164ID(String(body?.pickup?.contactPhone ?? pickupEnv.contactPhone)),
    };

    // Dropoff: from order (preferred) OR override from body
    const destination_address = String(order.shipping_address ?? order.address ?? "").trim();
    const recipientName = String(order.customer_name ?? "").trim();
    const recipientPhone = toE164ID(String(order.customer_phone ?? ""));

    const parsed = parseLatLngFromShippingJson(order.shipping_json);

    const dropoff = {
      address: String(body?.dropoff?.address ?? destination_address).trim(),
      lat: Number(body?.dropoff?.lat ?? parsed.lat ?? NaN),
      lng: Number(body?.dropoff?.lng ?? parsed.lng ?? NaN),
      contactName: String(body?.dropoff?.contactName ?? recipientName).trim(),
      contactPhone: toE164ID(String(body?.dropoff?.contactPhone ?? recipientPhone)),
      remarks: String(body?.remarks ?? order.notes ?? order.order_no ?? "").trim(),
    };

    // Validate essentials (422 often happens when coords or phones are bad)
    if (!pickup.address || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      return NextResponse.json({ ok: false, error: "Invalid pickup address/lat/lng" }, { status: 400 });
    }
    if (!pickup.contactName || !pickup.contactPhone) {
      return NextResponse.json({ ok: false, error: "Invalid pickup contact" }, { status: 400 });
    }
    if (!dropoff.address || !Number.isFinite(dropoff.lat) || !Number.isFinite(dropoff.lng)) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid destination lat/lng. Save destination coords first." },
        { status: 400 }
      );
    }
    if (!dropoff.contactName || !dropoff.contactPhone) {
      return NextResponse.json({ ok: false, error: "Invalid recipient contact" }, { status: 400 });
    }

    // ServiceType:
    // If MOTORCYCLE isn't valid on your account/city, Lalamove returns 422.
    const serviceType =
      String(body?.serviceType || process.env.LALAMOVE_SERVICE_TYPE || "MOTORCYCLE").trim();

    const llm = await createLalamoveOrder({
      externalId: String(order.midtrans_order_id ?? order.order_no ?? id),
      serviceType,
      language: "id_ID",

      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupContactName: pickup.contactName,
      pickupContactPhone: pickup.contactPhone,

      dropoffAddress: dropoff.address,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,

      recipientName: dropoff.contactName,
      recipientPhone: dropoff.contactPhone,
      remarks: dropoff.remarks,
    });

    // Save booking
    await sb
      .from("orders")
      .update({
        shipment_status: "BOOKED",
        tracking_url: llm.shareLink ?? null,
        // reuse this field if you don't have a dedicated one:
        biteship_order_id: llm.orderId ?? null,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      courier: "lalamove",
      shipment_order_id: llm.orderId ?? null,
      tracking_url: llm.shareLink ?? null,
      status: llm.status ?? null,
      quotationId: llm.quotationId,
      used: {
        serviceType,
        pickup,
        dropoff: { ...dropoff, contactPhone: "***" }, // mask
      },
    });
  } catch (e: any) {
    // IMPORTANT: show Lalamove payload so we can fix 422 precisely
    console.error("Lalamove admin booking error:", e?.message, e?.payload);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Lalamove request failed",
        status: e?.status || null,
        lalamove: e?.payload || null,
      },
      { status: e?.status && Number.isFinite(e.status) ? e.status : 500 }
    );
  }
}
