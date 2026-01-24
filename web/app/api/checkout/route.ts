// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
function mode() {
  return (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase();
}

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildBoxesText(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return "";

  const out: string[] = [];
  boxes.forEach((b: any, idx: number) => {
    const size = b?.boxSize ?? "?";
    const total = Number(b?.total || 0);
    out.push(`Box ${idx + 1} (Box of ${size}) — Rp ${total.toLocaleString("id-ID")}`);

    const items = Array.isArray(b?.items) ? b.items : [];
    items.forEach((it: any) => {
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Number(it?.quantity || 0);
      if (qty > 0) out.push(`- ${name} ×${qty}`);
    });

    out.push("");
  });

  return out.join("\n").trim();
}

function normalizeItems(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return [];
  const out: { name: string; quantity: number }[] = [];

  for (const b of boxes) {
    const items = Array.isArray(b?.items) ? b.items : [];
    for (const it of items) {
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Number(it?.quantity || 0);
      if (qty > 0) out.push({ name, quantity: qty });
    }
  }
  return out;
}

function computeSubtotalFromCart(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return 0;
  return boxes.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0);
}

function makeMidtransOrderId(checkoutMode: string) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  const prefix = checkoutMode === "manual" ? "CD-MANUAL" : "CD";
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();
    const supabase = supaAdmin();

    const customerName = (payload?.customer?.name || "").toString();
    const customerPhone = (payload?.customer?.phone || "").toString();
    const email = (payload?.customer?.email || payload?.email || "").toString();

    // DELIVERY (may be null if pickup)
    const shippingAddress = (payload?.delivery?.address || payload?.shipping_address || "").toString();
    const buildingName = (payload?.delivery?.buildingName || payload?.building_name || "").toString();
    const destinationAreaId = (payload?.delivery?.destination_area_id || payload?.destination_area_id || "").toString();
    const destinationAreaLabel = (payload?.delivery?.destination_area_label || payload?.destination_area_label || "").toString();

    const city = (payload?.delivery?.city || payload?.city || "").toString();
    const postal = (payload?.delivery?.postal || payload?.delivery?.postalCode || payload?.postal || "").toString();
    const notes = (payload?.notes || "").toString();

    const cart = payload?.cart;
    const items = normalizeItems(cart);
    const boxesText = buildBoxesText(cart);

    const subtotal = Number(payload?.subtotal_idr ?? payload?.subtotal ?? computeSubtotalFromCart(cart)) || 0;
    const shippingCost = Number(payload?.shipping_cost_idr ?? payload?.shipping_cost ?? 0) || 0;
    const totalIdr = Number(payload?.total_idr ?? payload?.total ?? (subtotal + shippingCost)) || 0;

    const checkoutMode = mode();

    // DB requires NOT NULL midtrans_order_id
    const midtransOrderId =
      (payload?.midtrans_order_id || payload?.midtransOrderId || "").toString().trim() ||
      makeMidtransOrderId(checkoutMode);

    // ✅ NEW: fulfillment scheduling + pickup details (from updated checkout page)
    const fulfillment = payload?.fulfillment || null; // { type, scheduleDate, scheduleTime }
    const pickup = payload?.pickup || null; // { pointId, pointName, pointAddress }

    // For backwards-compat, also accept older fields if present:
    const fulfillmentType =
      (fulfillment?.type || payload?.fulfillment_type || payload?.fulfillmentType || "").toString() || null;

    const scheduleDate =
      (fulfillment?.scheduleDate || payload?.scheduleDate || payload?.delivery_date || "").toString() || null;

    const scheduleTime =
      (fulfillment?.scheduleTime || payload?.scheduleTime || payload?.delivery_time || "").toString() || null;

    // ✅ Store these in meta so no DB migration needed
    const meta = {
      ...(payload?.meta || {}),
      fulfillment: fulfillment || {
        type: fulfillmentType,
        scheduleDate,
        scheduleTime,
      },
      pickup: pickup || null,
      boxes_text: boxesText, // useful for WA + ops without needing to rebuild
    };

    // ✅ Insert into orders only (items_json holds item list)
    const orderInsert: any = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      email: email || null,

      // For delivery, both are set. For pickup, shipping_address may be empty.
      address: shippingAddress || null,
      shipping_address: shippingAddress || null,
      building_name: buildingName || null,

      city: city || null,
      postal: postal || null,
      notes: notes || null,

      destination_area_id: destinationAreaId || null,
      destination_area_label: destinationAreaLabel || null,

      subtotal_idr: subtotal || null,
      shipping_cost_idr: shippingCost || null,
      total_idr: totalIdr || null,

      midtrans_order_id: midtransOrderId,

      payment_status: "PENDING",
      shipment_status: "not_created",

      // Your DB seems to use "fulfillment_status" (American spelling).
      // We set it to fulfillment type: "delivery" | "pickup" (or null)
      fulfillment_status: fulfillmentType,

      checkout_mode: checkoutMode,

      // ✅ jsonb columns:
      items_json: items,
      customer_json: payload?.customer || null,

      // Keep delivery payload in shipping_json (as before)
      shipping_json: payload?.delivery || null,

      meta,
    };

    const { data: orderRow, error: e1 } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr, shipping_address, building_name, postal, customer_name, customer_phone")
      .maybeSingle();

    if (e1) throw e1;
    if (!orderRow?.id) throw new Error("Order insert failed (missing id)");

    // Manual mode redirect
    if (checkoutMode === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderRow.id);
      u.searchParams.set("total", String(orderRow.total_idr || totalIdr || 0));
      u.searchParams.set("name", orderRow.customer_name || customerName || "");
      u.searchParams.set("phone", orderRow.customer_phone || customerPhone || "");
      u.searchParams.set("address", orderRow.shipping_address || shippingAddress || "");
      u.searchParams.set("building", orderRow.building_name || buildingName || "");
      u.searchParams.set("postal", orderRow.postal || postal || "");
      u.searchParams.set("boxes", boxesText);

      // ✅ Include schedule info in the pending URL too (optional, helps WhatsApp proof message)
      if (scheduleDate) u.searchParams.set("date", scheduleDate);
      if (scheduleTime) u.searchParams.set("time", scheduleTime);
      if (fulfillmentType) u.searchParams.set("fulfillment", fulfillmentType);

      // Pickup info (optional)
      if (pickup?.pointName) u.searchParams.set("pickup_point", String(pickup.pointName));
      if (pickup?.pointAddress) u.searchParams.set("pickup_address", String(pickup.pointAddress));

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
        redirect_url: u.toString(),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        mode: "midtrans",
        error: "Midtrans flow not wired in /api/checkout yet, but order has been created.",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Invalid request body" }, { status: 400 });
  }
}
