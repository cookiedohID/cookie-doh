import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createBiteshipOrder } from "@/lib/biteship";
import { createLalamoveOrder } from "@/lib/lalamove";

export const runtime = "nodejs";

function pickCourier(order: any) {
  const company =
    (order.courier_company && String(order.courier_company).trim()) ||
    (order.courier_code && String(order.courier_code).trim()) ||
    "";

  const type =
    (order.courier_type && String(order.courier_type).trim()) ||
    (order.courier_service && String(order.courier_service).trim()) ||
    "";

  return {
    courier_company: String(company).toLowerCase(),
    courier_type: String(type).toLowerCase(),
  };
}

function parseLatLngFromShippingJson(shipping_json: any) {
  // You send destination_lat/lng from checkout -> snap-token.
  // Most setups store it in shipping_json.
  let obj: any = shipping_json;
  if (typeof shipping_json === "string") {
    try { obj = JSON.parse(shipping_json); } catch { obj = null; }
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

function parseItems(itemsJson: any, fallbackValue: number) {
  let items: any[] = [];
  if (Array.isArray(itemsJson)) items = itemsJson;
  else if (typeof itemsJson === "string") {
    try {
      const parsed = JSON.parse(itemsJson);
      if (Array.isArray(parsed)) items = parsed;
      else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
    } catch {
      items = [];
    }
  } else if (itemsJson && typeof itemsJson === "object") {
    if (Array.isArray((itemsJson as any).items)) items = (itemsJson as any).items;
  }

  return items.length > 0
    ? items.map((it: any) => ({
        name: String(it.name ?? it.title ?? "Cookie"),
        description: String(it.description ?? "Cookie Doh"),
        quantity: Number(it.quantity ?? 1),
        value: Number(it.value ?? it.price ?? it.unit_price ?? fallbackValue) || 1,
        weight: Number(it.weight ?? it.grams ?? 100) || 100,
      }))
    : [
        {
          name: "Cookie Box",
          description: "Cookie Doh",
          quantity: 1,
          value: fallbackValue || 100000,
          weight: 1000,
        },
      ];
}

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
      .select("*")
      .eq("midtrans_order_id", midtrans_order_id)
      .maybeSingle();

    if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    if (String(order.payment_status ?? "").toUpperCase() !== "PAID") {
      return NextResponse.json(
        { ok: false, error: "Order is not PAID", payment_status: order.payment_status },
        { status: 400 }
      );
    }

    // Idempotent
    if (order.biteship_order_id) {
      return NextResponse.json({
        ok: true,
        shipment: "already-created",
        shipment_order_id: order.biteship_order_id,
      });
    }

    const courier = pickCourier(order);

    // Destination basics
    const destination_address = String(order.shipping_address ?? order.address ?? "").trim();
    const recipientName = String(order.customer_name ?? "").trim();
    const recipientPhone = String(order.customer_phone ?? "").trim();

    if (!destination_address || !recipientName || !recipientPhone) {
      await sb.from("orders").update({ shipment_status: "needs_attention" }).eq("midtrans_order_id", midtrans_order_id);
      return NextResponse.json({ ok: false, error: "Missing destination fields" }, { status: 400 });
    }

    // === LALAMOVE PATH ===
    if (courier.courier_company === "lalamove") {
      const { lat, lng } = parseLatLngFromShippingJson(order.shipping_json);

      if (lat == null || lng == null) {
        await sb.from("orders").update({ shipment_status: "needs_attention" }).eq("midtrans_order_id", midtrans_order_id);
        return NextResponse.json({ ok: false, error: "Missing destination lat/lng (shipping_json)" }, { status: 400 });
      }

      const remarks = String(order.notes ?? "");

      const llm = await createLalamoveOrder({
        externalId: midtrans_order_id,
        dropoffAddress: destination_address,
        dropoffLat: lat,
        dropoffLng: lng,
        recipientName,
        recipientPhone,
        remarks,
      });

      const orderId = llm.orderId ? String(llm.orderId) : null;
      const shareLink = llm.shareLink ? String(llm.shareLink) : null;

      await sb
        .from("orders")
        .update({
          biteship_order_id: orderId, // re-used field as shipment id
          tracking_url: shareLink,
          shipment_status: "created",
        })
        .eq("midtrans_order_id", midtrans_order_id);

      return NextResponse.json({
        ok: true,
        courier: "lalamove",
        shipment: "created",
        shipment_order_id: orderId,
        tracking_url: shareLink,
      });
    }

    // === BITESHIP PATH (Paxel etc) ===
    const destination_postal_code = order.postal ? Number(String(order.postal).trim()) : null;
    const destination_area_id = order.destination_area_id ? String(order.destination_area_id).trim() : null;

    if (!destination_postal_code || Number.isNaN(destination_postal_code)) {
      await sb.from("orders").update({ shipment_status: "needs_attention" }).eq("midtrans_order_id", midtrans_order_id);
      return NextResponse.json({ ok: false, error: "Missing/invalid destination postal code" }, { status: 400 });
    }

    if (!courier.courier_company || !courier.courier_type) {
      await sb.from("orders").update({ shipment_status: "needs_attention" }).eq("midtrans_order_id", midtrans_order_id);
      return NextResponse.json({ ok: false, error: "Missing courier_company/courier_type for Biteship" }, { status: 400 });
    }

    const fallbackValue = Number(order.total_idr ?? 100000) || 100000;
    const items = parseItems(order.items_json, fallbackValue);

    const biteshipRes = await createBiteshipOrder({
      external_id: midtrans_order_id,
      destination_contact_name: recipientName,
      destination_contact_phone: recipientPhone,
      destination_address,
      destination_postal_code,
      destination_area_id,
      courier_company: courier.courier_company,
      courier_type: courier.courier_type,
      items,
      order_note: String(order.notes ?? ""),
    });

    const biteship_order_id = biteshipRes?.id ?? biteshipRes?.data?.id ?? null;
    const waybill = biteshipRes?.courier?.waybill ?? biteshipRes?.data?.courier?.waybill ?? null;
    const tracking_url = biteshipRes?.courier?.tracking_url ?? biteshipRes?.data?.courier?.tracking_url ?? null;

    await sb
      .from("orders")
      .update({
        biteship_order_id,
        waybill,
        tracking_url,
        shipment_status: "created",
      })
      .eq("midtrans_order_id", midtrans_order_id);

    return NextResponse.json({
      ok: true,
      courier: "biteship",
      shipment: "created",
      biteship_order_id,
      waybill,
      tracking_url,
    });
  } catch (e: any) {
      console.error("Lalamove error:", e?.message, e?.payload);

      return NextResponse.json(
        {
          error: e?.message || "Lalamove request failed",
          lalamove: e?.payload || null,
          status: e?.status || null,
        },
        { status: 500 }
      );
    }

}
