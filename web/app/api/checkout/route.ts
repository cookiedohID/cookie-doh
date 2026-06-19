// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken, midtransEnv } from "@/lib/midtrans";
import { notifyNewOrder } from "@/lib/notify";
import { upsertCustomerForOrder } from "@/lib/customers";
import { canonicalPhone } from "@/lib/phone";
import { loyaltyForPhone } from "@/app/api/loyalty/lookup/route";

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

type OrderLine = { id: string; name: string; price: number; quantity: number; bundle?: boolean };

// Carry id + per-unit price (and a bundle flag) onto every order line. Without
// these, paid orders can't decrement per-location stock and can't earn loyalty
// stamps (both key off item id + price), and Biteship gets a NaN item value.
function normalizeItems(cart: any): OrderLine[] {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return [];
  const out: OrderLine[] = [];

  for (const b of boxes) {
    const isBundle = b?.kind === "bundle";
    const items = Array.isArray(b?.items) ? b.items : [];
    for (const it of items) {
      const id = String(it?.id ?? it?.flavorId ?? "").trim();
      if (!id) continue; // never emit id-less lines — they break stock decrement, loyalty, and Biteship
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Math.max(0, Math.floor(Number(it?.quantity || 0)));
      const priceRaw = Math.round(Number(it?.price ?? 0));
      const price = priceRaw > 0 ? priceRaw : 32500; // fall back to the single-cookie price, never 0
      if (qty > 0) out.push({ id, name, price, quantity: qty, ...(isBundle ? { bundle: true } : {}) });
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

    // ---- Loyalty redemption (members applying earned free cookies/drinks online) ----
    // Free lines are added at Rp0, validated against the member's REAL balance, and
    // atomically reserved (reserve_rewards). The Midtrans webhook consumes the
    // reservation on payment / releases it on failure — same path as the cafe.
    const redeemReq = Array.isArray(payload?.redeem) ? payload.redeem : [];
    if (redeemReq.length) {
      const phone = canonicalPhone(customerPhone);
      if (!phone) {
        return NextResponse.json({ ok: false, error: "Sign in (or add your member phone) to use rewards." }, { status: 400 });
      }
      const freeLines = redeemReq
        .map((r: any) => ({
          id: String(r?.id || "").trim(),
          name: String(r?.name || "").trim() || "Free item",
          kind: r?.kind === "drink" ? "drink" : "cookie",
          price: 0,
          quantity: Math.max(0, Math.floor(Number(r?.quantity ?? 1))),
          free: true,
        }))
        .filter((l: any) => l.id && l.quantity > 0);
      const wantCookies = freeLines.filter((l: any) => l.kind === "cookie").reduce((s: number, l: any) => s + l.quantity, 0);
      const wantDrinks = freeLines.filter((l: any) => l.kind === "drink").reduce((s: number, l: any) => s + l.quantity, 0);
      if (wantCookies || wantDrinks) {
        const supaCheck = supaAdmin();
        const loy = await loyaltyForPhone(supaCheck, phone);
        if (!loy || wantCookies > loy.freeCookies || wantDrinks > loy.freeDrinks) {
          return NextResponse.json({ ok: false, error: "Not enough rewards available." }, { status: 400 });
        }
        try {
          const { data: reserved, error: rErr } = await supaCheck.rpc("reserve_rewards", {
            p_phone: phone,
            p_avail_cookies: loy.freeCookies,
            p_avail_drinks: loy.freeDrinks,
            p_want_cookies: wantCookies,
            p_want_drinks: wantDrinks,
            p_midtrans_order_id: midtransOrderId,
          });
          if (rErr) console.warn("[checkout] reserve_rewards unavailable, using derived check:", rErr.message);
          else if (reserved === false) {
            return NextResponse.json({ ok: false, error: "Not enough rewards available." }, { status: 400 });
          }
        } catch (e: any) {
          console.warn("[checkout] reserve_rewards failed, using derived check:", e?.message || e);
        }
        items.push(...freeLines);
      }
    }

    // scheduling & pickup & quote meta
    const fulfillment = payload?.fulfillment || null;
    const pickup = payload?.pickup || null;
    const quote = payload?.meta?.quote || null;

    const fulfillmentType = (fulfillment?.type || payload?.fulfilment_status || "").toString().trim() || null;

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

      // Intercity courier (Biteship). Set only for out-of-zone delivery; the
      // Midtrans webhook reads these to create the next-day shipment by postal.
      courier_company: (payload?.courier_company || null),
      courier_type: (payload?.courier_type || null),
      courier_service: (payload?.courier_service || null),

      subtotal_idr: subtotal || null,
      shipping_cost_idr: shippingCost || 0,
      total_idr: totalIdr || null,

      midtrans_order_id: midtransOrderId,

      payment_status: "PENDING",
      shipment_status: "not_created",

      fulfilment_status: fulfillmentType,

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
        gift: payload?.gift || null,
      },
    };

    const { data: orderRow, error: e1 } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr, shipping_address, building_name, postal, customer_name, customer_phone")
      .maybeSingle();

    if (e1) throw e1;
    if (!orderRow?.id) throw new Error("Order insert failed (missing id)");

    // 👤 Record/refresh the customer (by canonical phone). Never blocks checkout.
    await upsertCustomerForOrder(supabase, {
      name: customerName,
      phone: customerPhone,
      email,
    });

    // 🔔 Notify admin the moment an order is placed (email + WhatsApp).
    // Awaited so it runs before the serverless function freezes, but never throws.
    await notifyNewOrder({
      orderNo: String(orderRow.order_no ?? orderRow.id),
      status: "placed",
      customerName: orderRow.customer_name || customerName,
      customerPhone: orderRow.customer_phone || customerPhone,
      fulfilment: fulfillmentType,
      scheduleDate: fulfillment?.scheduleDate ?? null,
      scheduleTime: fulfillment?.scheduleTime ?? null,
      totalIdr: orderRow.total_idr ?? totalIdr,
      items,
      boxesText,
      adminUrl: `${siteUrl}/admin/orders/${orderRow.id}`,
    });

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
