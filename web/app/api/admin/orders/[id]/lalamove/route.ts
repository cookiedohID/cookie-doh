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

function getPickupFromEnv() {
  const address = (process.env.COOKIE_DOH_PICKUP_ADDRESS || "").trim();
  const lat = Number(process.env.COOKIE_DOH_PICKUP_LAT || "");
  const lng = Number(process.env.COOKIE_DOH_PICKUP_LNG || "");
  const name = (process.env.COOKIE_DOH_PICKUP_NAME || "Cookie Doh").trim();
  const phone = toE164ID(process.env.COOKIE_DOH_PICKUP_PHONE || "");

  if (!address) throw new Error("Missing env COOKIE_DOH_PICKUP_ADDRESS");
  if (!Number.isFinite(lat)) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_LAT");
  if (!Number.isFinite(lng)) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_LNG");
  if (!phone) throw new Error("Missing/invalid env COOKIE_DOH_PICKUP_PHONE");

  return { address, lat, lng, contactName: name, contactPhone: phone };
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid order id" }, { status: 400 });

    const sb = supabaseAdmin();

    const { data: order, error: oErr } = await sb
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

    if (String(order.payment_status || "").toUpperCase() !== "PAID") {
      return NextResponse.json({ ok: false, error: "Order is not PAID" }, { status: 400 });
    }

    // idempotent
    if (order.tracking_url || order.biteship_order_id) {
      return NextResponse.json({
        ok: true,
        alreadyBooked: true,
        shipment_order_id: order.biteship_order_id ?? null,
        tracking_url: order.tracking_url ?? null,
      });
    }

    const pickup = getPickupFromEnv();

    const destination_address = String(order.shipping_address ?? order.address ?? "").trim();
    const recipientName = String(order.customer_name ?? "").trim();
    const recipientPhone = toE164ID(String(order.customer_phone ?? ""));

    const { lat, lng } = parseLatLngFromShippingJson(order.shipping_json);

    if (!destination_address || !recipientName || !recipientPhone) {
      return NextResponse.json({ ok: false, error: "Missing destination fields" }, { status: 400 });
    }

    if (lat == null || lng == null) {
      return NextResponse.json(
        { ok: false, error: "Missing destination lat/lng in shipping_json (destination_lat/destination_lng)" },
        { status: 400 }
      );
    }

    const serviceType = (process.env.LALAMOVE_SERVICE_TYPE || "MOTORCYCLE").trim();

    const llm = await createLalamoveOrder({
      externalId: String(order.midtrans_order_id ?? order.order_no ?? id),
      serviceType,
      language: "id_ID",

      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupContactName: pickup.contactName,
      pickupContactPhone: pickup.contactPhone,

      dropoffAddress: destination_address,
      dropoffLat: lat,
      dropoffLng: lng,
      recipientName,
      recipientPhone,

      remarks: String(order.notes ?? order.order_no ?? "").trim(),
    });

    await sb
      .from("orders")
      .update({
        shipment_status: "BOOKED",
        tracking_url: llm.shareLink ?? null,
        biteship_order_id: llm.orderId ?? null,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      shipment_order_id: llm.orderId ?? null,
      tracking_url: llm.shareLink ?? null,
      status: llm.status ?? null,
      quotationId: llm.quotationId,
    });
  } catch (e: any) {
    // IMPORTANT: pass through Lalamove payload if available
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
