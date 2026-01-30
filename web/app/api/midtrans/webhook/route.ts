import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { createBiteshipOrder } from "@/lib/biteship";

export const runtime = "nodejs";

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

  const mapped =
    items.length > 0
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

  return mapped;
}

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

function normalizePaymentStatus(transactionStatus: string, fraudStatus: string) {
  const isPaid = transactionStatus === "capture" || transactionStatus === "settlement";
  const isPending = transactionStatus === "pending";
  const isFailed =
    transactionStatus === "deny" ||
    transactionStatus === "cancel" ||
    transactionStatus === "expire" ||
    transactionStatus === "failure";

  // capture + challenge => pending
  const fraudChallenge = transactionStatus === "capture" && fraudStatus === "challenge";

  if (fraudChallenge) return "PENDING";
  if (isPaid) return "PAID";
  if (isFailed) return "FAILED";
  if (isPending) return "PENDING";
  return String(transactionStatus || "PENDING").toUpperCase();
}

export async function POST(req: NextRequest) {
  const payload = await req.json();

  if (!verifyMidtransSignature(payload)) {
  return NextResponse.json({ ok: true, ignored: "invalid-signature" });
  }


  const midtransOrderId = String(payload?.order_id ?? "");
  const transactionStatus = String(payload?.transaction_status ?? "");
  const fraudStatus = String(payload?.fraud_status ?? "");
  const paymentType = String(payload?.payment_type ?? "");

  if (!midtransOrderId) {
    return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: order, error: findErr } = await sb
    .from("orders")
    .select("*")
    .eq("midtrans_order_id", midtransOrderId)
    .maybeSingle();

  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

  const payment_status = normalizePaymentStatus(transactionStatus, fraudStatus);
  const paid_at = payment_status === "PAID" ? new Date().toISOString() : null;

  // update payment columns (idempotent)
  const { error: updErr } = await sb
    .from("orders")
    .update({
      payment_status,
      midtrans_transaction_status: transactionStatus,
      midtrans_status: transactionStatus,
      total_idr: payload?.gross_amount
      ? Number(payload.gross_amount)
      : order.total_idr,
      paid_at,
    })
    .eq("midtrans_order_id", midtransOrderId);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  if (order.payment_status === "PAID") {
  return NextResponse.json({
    ok: true,
    midtrans_order_id: midtransOrderId,
    payment_status: "PAID",
    skipped: "already-paid",
  });
}


  // create biteship order only when PAID and not already created
  if (payment_status === "PAID") {
    if (order.biteship_order_id) {
      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "already-created",
      });
    }

    const preparation_store_id =
    order.fulfillment_status === "pickup"
    ? order.pickup_point_id
    : order.meta?.quote?.origin?.id || "kemang";


    const destination_contact_name = String(order.customer_name ?? "").trim();
    const destination_contact_phone = String(order.customer_phone ?? "").trim();
    const destination_address = String(order.shipping_address ?? order.address ?? "").trim();

    const destination_postal_code = order.postal ? Number(String(order.postal).trim()) : null;
    const destination_area_id = order.destination_area_id ? String(order.destination_area_id).trim() : null;

    const { courier_company, courier_type } = pickCourier(order);

    // courier_company & courier_type are REQUIRED for Biteship order creation
    if (!courier_company || !courier_type) {
      await sb
        .from("orders")
        .update({ shipment_status: "needs_attention" })
        .eq("midtrans_order_id", midtransOrderId);

      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "skipped-missing-courier",
      });
    }

    if (!destination_contact_name || !destination_contact_phone || !destination_address) {
      await sb
        .from("orders")
        .update({ shipment_status: "needs_attention" })
        .eq("midtrans_order_id", midtransOrderId);

      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "skipped-missing-destination-fields",
      });
    }

    // destination_postal_code is optional in API, but highly recommended
    if (!destination_postal_code || Number.isNaN(destination_postal_code)) {
      await sb
        .from("orders")
        .update({ shipment_status: "needs_attention" })
        .eq("midtrans_order_id", midtransOrderId);

      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "skipped-missing-destination-postal",
      });
    }

    const fallbackValue = Number(order.total_idr ?? order.total_idr ?? 100000) || 100000;
    const items = parseItems(order.items_json, fallbackValue);

    try {
      const biteshipRes = await createBiteshipOrder({
        external_id: midtransOrderId,
        destination_contact_name,
        destination_contact_phone,
        destination_address,
        destination_postal_code,
        destination_area_id,
        courier_company,
        courier_type,
        items,
        order_note: String(order.notes ?? ""),
      });

      // Biteship response shapes vary; extract safely
      const biteship_order_id =
        biteshipRes?.id ?? biteshipRes?.data?.id ?? biteshipRes?.order?.id ?? null;

      const waybill =
        biteshipRes?.courier?.waybill ??
        biteshipRes?.waybill ??
        biteshipRes?.data?.courier?.waybill ??
        null;

      const tracking_url =
        biteshipRes?.courier?.tracking_url ??
        biteshipRes?.tracking_url ??
        biteshipRes?.data?.courier?.tracking_url ??
        null;

      await sb
        .from("orders")
        .update({
          biteship_order_id,
          waybill,
          tracking_url,
          shipment_status: "created",
          courier_company,
          courier_type,
        })
        .eq("midtrans_order_id", midtransOrderId);

      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "created",
        biteship_order_id,
      });
    } catch (e: any) {
      await sb
        .from("orders")
        .update({ shipment_status: "failed" })
        .eq("midtrans_order_id", midtransOrderId);

      return NextResponse.json({
        ok: true,
        midtrans_order_id: midtransOrderId,
        payment_status,
        shipment: "failed",
        error: e?.message ?? "Unknown Biteship error",
      });
    }
  }

  return NextResponse.json({ ok: true, midtrans_order_id: midtransOrderId, payment_status });
}
