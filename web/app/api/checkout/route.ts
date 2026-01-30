// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken, midtransEnv } from "@/lib/midtrans";

export const runtime = "nodejs";

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

    const midtransOrderId =
      (payload?.midtrans_order_id || payload?.midtransOrderId || "").toString().trim() ||
      makeMidtransOrderId(checkoutMode);

    // scheduling & pickup & quote meta
    const fulfillment = payload?.fulfillment || null;
    const pickup = payload?.pickup || null;
    const quote = payload?.meta?.quote || null;

    const fulfillmentType = (fulfillment?.type || payload?.fulfillment_status || "").toString().trim() || null;

    const orderInsert: any = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      email: email || null,

      address: shippingAddress || null,
      shipping_address: shippingAddress || null,
      building_name: buildingName || null,

      city: city || null,
      postal: postal || null,
      notes: notes || null,

      destination_area_id: destinationAreaId || null,
      destination_area_label: destinationAreaLabel || null,

      subtotal_idr: subtotal || null,
      shipping_cost_idr: shippingCost || 0,
      total_idr: totalIdr || null,

      midtrans_order_id: midtransOrderId,

      payment_status: "PENDING",
      shipment_status: "not_created",

      fulfillment_status: fulfillmentType,

      checkout_mode: checkoutMode,
      items_json: items,
      customer_json: payload?.customer || null,
      shipping_json: payload?.delivery || null,

      meta: {
        ...(payload?.meta || {}),
        fulfillment,
        pickup,
        quote,
        boxes_text: boxesText,
      },
    };

    const { data: orderRow, error: e1 } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr, shipping_address, building_name, postal, customer_name, customer_phone")
      .maybeSingle();

    if (e1) throw e1;
    if (!orderRow?.id) throw new Error("Order insert failed (missing id)");

    // ✅ Manual mode = return redirect_url to /checkout/pending
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

      if (fulfillment?.scheduleDate) u.searchParams.set("date", String(fulfillment.scheduleDate));
      if (fulfillment?.scheduleTime) u.searchParams.set("time", String(fulfillment.scheduleTime));
      if (fulfillment?.type) u.searchParams.set("fulfillment", String(fulfillment.type));
      if (pickup?.pointName) u.searchParams.set("pickup_point", String(pickup.pointName));

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
        redirect_url: u.toString(),
      });
    }

    // ✅ Midtrans SNAP POPUP mode = return snap_token
    const token = await createSnapToken({
      order_id: midtransOrderId,
      gross_amount: totalIdr,
      customer: { name: customerName, phone: customerPhone, email },
      siteUrl,
      itemsText: boxesText || undefined,
    });

    // store token in meta for admin visibility (optional)
    await supabase
      .from("orders")
      .update({
        meta: {
          ...(orderInsert.meta || {}),
          midtrans: {
            env: midtransEnv(),
            token,
          },
        },
      })
      .eq("id", orderRow.id);

    return NextResponse.json({
      ok: true,
      mode: "midtrans",
      snap_token: token,
      order_id: orderRow.id,
      order_no: orderRow.order_no,
      midtrans_order_id: midtransOrderId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Invalid request body" },
      { status: 400 }
    );
  }
}
