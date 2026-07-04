import { notifyNewOrder } from "@/lib/notify";
import { decrementStockForOrder } from "@/lib/stock";
import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { supabaseServer } from "@/lib/supabaseServer";
import { createBiteshipOrder as createIntercityShipment } from "@/lib/biteship";
import { tryQualifyReferral } from "@/lib/referrals";
import { sendWhatsApp } from "@/lib/whatsapp";
import { settleSubscriptionPayment } from "@/lib/subscriptionPay";
import { notifyCustomerOrderConfirmed, inviteRecipientReferral } from "@/lib/orderComms";

export const runtime = "nodejs";

function getOriginFromEnv() {
  const origin_contact_name = process.env.COOKIE_DOH_ORIGIN_CONTACT_NAME;
  const origin_contact_phone = process.env.COOKIE_DOH_ORIGIN_CONTACT_PHONE;
  const origin_address = process.env.COOKIE_DOH_ORIGIN_ADDRESS;
  const origin_area_id = process.env.COOKIE_DOH_ORIGIN_AREA_ID;

  const origin_lat = process.env.COOKIE_DOH_ORIGIN_LAT
    ? Number(process.env.COOKIE_DOH_ORIGIN_LAT)
    : null;
  const origin_lng = process.env.COOKIE_DOH_ORIGIN_LNG
    ? Number(process.env.COOKIE_DOH_ORIGIN_LNG)
    : null;

  if (!origin_contact_name || !origin_contact_phone || !origin_address) {
    throw new Error(
      "Missing origin env vars (COOKIE_DOH_ORIGIN_CONTACT_NAME/PHONE/ADDRESS)"
    );
  }

  // Prefer area_id; lat/lng optional
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

// Ship from the nearest store the customer was quoted from (stored on the order),
// keeping the Cookie Doh contact. Falls back to the env (Kemang) origin if missing.
function originForOrder(order: any) {
  const base = getOriginFromEnv();
  const q = order?.meta?.quote?.origin;
  const lat = Number(q?.lat);
  const lng = Number(q?.lng);
  if (q && Number.isFinite(lat) && Number.isFinite(lng) && q.address) {
    return {
      ...base,
      origin_address: String(q.address),
      origin_lat: lat,
      origin_lng: lng,
      // only the Kemang origin has a Biteship area_id; others ship by lat/lng
      origin_area_id: q.id === "kemang" ? base.origin_area_id : undefined,
    };
  }
  return base;
}

async function createBiteshipOrder(order: any) {
  const apiKey = process.env.BITESHIP_API_KEY;
  if (!apiKey) throw new Error("Missing BITESHIP_API_KEY");

  const base = "https://api.biteship.com";
  const shipping = order.shipping_json || {};
  const customer = order.customer_json || {};
  const items = order.items_json || [];

  const origin = originForOrder(order);

  // Deliver-to-someone-else: the courier should reach the RECIPIENT when set.
  const destination_contact_name =
    order.recipient_name ||
    (customer.first_name ? `${customer.first_name} ${customer.last_name ?? ""}`.trim() : customer.name) ||
    "Customer";

  const destination_contact_phone = order.recipient_phone || customer.phone || "";
  const destination_address = shipping.address ?? shipping.destination_address ?? "";
  const destination_area_id = shipping.destination_area_id ?? "";

  const destination_lat = shipping.destination_lat ?? null;
  const destination_lng = shipping.destination_lng ?? null;

  if (!destination_contact_phone) throw new Error("Missing customer phone");
  if (!destination_address) throw new Error("Missing destination address");
  if (!destination_area_id && (destination_lat == null || destination_lng == null)) {
    throw new Error("Missing destination_area_id or destination_lat/lng");
  }

  // Use courier saved at order creation (BEST)
  const courier_company =
    order.courier_company ?? shipping.courier_company ?? shipping.courierCompany;
  const courier_type =
    order.courier_type ?? shipping.courier_type ?? shipping.courierType;
  const courier_service =
    order.courier_service ?? shipping.courier_service ?? shipping.courierService;

  if (!courier_company || !courier_type) {
    throw new Error("Missing courier_company/courier_type on order");
  }

  const payload: any = {
    reference_id: order.midtrans_order_id,

    courier_company,
    courier_type,
    courier_service, // optional in some setups but ok if you use it

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

    // If you know package weight/dimensions, add them later
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

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      json?.error || json?.message || `Biteship create order failed (${resp.status})`
    );
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

    // Safer than trusting incoming payload: verify to Midtrans
    const statusResponse = await coreApi.transaction.status(notification.order_id);

    const midtrans_order_id = statusResponse.order_id;
    const txStatus = statusResponse.transaction_status;
    const fraud = statusResponse.fraud_status;

    const paid =
      txStatus === "settlement" ||
      (txStatus === "capture" && (fraud ?? "accept") === "accept");

    const supabase = supabaseServer();

    // ── Subscription prepaid-plan payment ────────────────────────────────────
    // A "CD-SUB-" order id funds a subscription plan, NOT an order — it has no
    // orders row, so handle and return BEFORE the orders lookup below (which uses
    // .single() and would 500 on a missing row). Verifies amount + is idempotent.
    if (midtrans_order_id.startsWith("CD-SUB-")) {
      const r = await settleSubscriptionPayment(supabase, midtrans_order_id, statusResponse, paid);
      return NextResponse.json({ ok: true, txStatus, fraud, paid, subscription: r });
    }

    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("midtrans_order_id", midtrans_order_id)
      .single();

    if (fetchErr || !order) {
      throw fetchErr ?? new Error("Order not found");
    }

    // Update order status
        const paymentType = (statusResponse as any)?.payment_type ?? null;

    // keep existing meta, but add midtrans info safely
    const prevMeta = (order as any)?.meta && typeof (order as any).meta === "object" ? (order as any).meta : {};
    const nextMeta = {
      ...prevMeta,
      midtrans: {
        ...(prevMeta as any)?.midtrans,
        payment_type: paymentType,
        transaction_status: txStatus,
      },
    };

    await supabase
      .from("orders")
      .update({
        payment_status: paid ? "PAID" : txStatus === "pending" ? "UNPAID" : "FAILED",
        midtrans_status: txStatus,
        paid_at: paid ? new Date().toISOString() : null,
        meta: nextMeta,
      })
      .eq("id", order.id);

    // Settle any loyalty reward reservation tied to this order. Idempotent — only
    // touches still-'reserved' rows, so webhook retries are safe. Never throws
    // (the table may not be deployed yet).
    try {
      if (paid) {
        await supabase
          .from("loyalty_redemptions")
          .update({ status: "consumed", order_id: order.id })
          .eq("midtrans_order_id", midtrans_order_id)
          .eq("status", "reserved");
      } else if (txStatus !== "pending") {
        await supabase
          .from("loyalty_redemptions")
          .update({ status: "released" })
          .eq("midtrans_order_id", midtrans_order_id)
          .eq("status", "reserved");
      }
    } catch (e) {
      console.error("loyalty reservation settle failed:", e);
    }

    // TotalBuahStore web order: on PAID, hand the order to the TBS back-office so
    // the store can pick/pack. Idempotent twice over — the partner endpoint dedups
    // on event_id (= this order's id) and we mark meta.tbs.pushed. A failed push
    // never blocks payment; it's retried on the next webhook redelivery and
    // flagged in meta for the admin to see.
    try {
      const tbsMeta = (order as any)?.meta?.tbs;
      // Atomic claim: only ONE webhook delivery may run the push (concurrent
      // redeliveries fail the .eq filter and skip). The ERP's event_id dedup is
      // the second net — verified live: a replayed push returns the same order.
      let tbsClaimed = false;
      if (paid && tbsMeta && !tbsMeta.pushed && tbsMeta.pushed !== "claiming") {
        const { data: claim } = await supabase
          .from("orders")
          .update({ meta: { ...nextMeta, tbs: { ...tbsMeta, pushed: "claiming" } } })
          .eq("id", order.id)
          .eq("meta->tbs->>pushed", "false")
          .select("id")
          .maybeSingle();
        tbsClaimed = Boolean(claim);
      }
      if (tbsClaimed) {
        const { pushTbsOrder } = await import("@/lib/tbsShop");
        const items = Array.isArray(order.items_json) ? order.items_json : [];
        const lines = items
          .filter((it: any) => it?.kind === "tbs" && it?.sku)
          .map((it: any) => ({
            sku: String(it.sku),
            qty: Math.max(1, Math.round(Number(it.quantity) || 1)),
            price: Math.round(Number(it.price) || 0),
            amount: Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1)),
          }));
        const res = await pushTbsOrder({
          event_id: String(order.id),
          store: String(tbsMeta.store || ""),
          fulfil: tbsMeta.fulfil === "delivery" ? "delivery" : "pickup",
          customer: { name: String(order.customer_name || ""), phone: String(order.customer_phone || "") },
          address: tbsMeta.address || null,
          notes: (order as any).notes || null,
          lines,
          subtotal: Math.round(Number(order.subtotal_idr) || 0),
          delivery_fee: Math.round(Number(order.shipping_cost_idr) || 0),
          total: Math.round(Number(order.total_idr) || 0),
        });
        await supabase
          .from("orders")
          .update({ meta: { ...nextMeta, tbs: { ...tbsMeta, pushed: res.ok, tbs_order_no: res.order_no || null, push_error: res.ok ? null : res.error } } })
          .eq("id", order.id);
      }
    } catch (e) {
      console.error("TBS order push failed:", e);
    }

    // Referral rewards: if this PAID order carries a referral code and the buyer
    // is a brand-new customer who spent at least a box of 6, credit both sides a
    // free cookie. Idempotent (UNIQUE(referred_phone)); never blocks payment.
    try {
      if (paid) {
        const ref = await tryQualifyReferral(supabase, order);
        if (ref.qualified) {
          await Promise.allSettled([
            sendWhatsApp({
              to: ref.referrerPhone,
              message:
                "🎉 Your friend just made their first Cookie Doh order with your link — you've earned a FREE cookie 🍪 Use it on your next order or at the counter. Thank you for sharing!",
            }),
            sendWhatsApp({
              to: ref.friendPhone,
              message:
                "Welcome to Cookie Doh! 🍪 Thanks for your first order — there's a FREE cookie waiting on your next one. See you again soon 💛",
            }),
          ]);
        }
      }
    } catch (e) {
      console.error("referral qualify failed:", e);
    }

    // Record promo-code usage once, on payment. UNIQUE(order_id) makes retries a
    // no-op, so usage limits (counted from these rows) stay accurate.
    try {
      const promo = (order as any)?.meta?.promo;
      if (paid && promo?.code) {
        await supabase.from("promo_redemptions").insert({
          code: promo.code,
          phone: order.customer_phone || null,
          order_id: order.id,
          discount_idr: Number(promo.discount || 0),
        });
      }
    } catch (e) {
      console.error("promo redemption record failed:", e);
    }


    // Cafe (in-store) orders: no delivery — just decrement stock + notify, once.
    if (paid && order?.meta?.channel === "cafe") {
      const { data: cafeLock } = await supabase
        .from("orders")
        .update({ shipment_status: "done" })
        .eq("id", order.id)
        .eq("shipment_status", "not_required")
        .select("id")
        .maybeSingle();
      if (!cafeLock) {
        return NextResponse.json({ ok: true, txStatus, fraud, cafe: "already_handled" });
      }
      await decrementStockForOrder(supabase, order);
      await notifyNewOrder({
        orderNo: order.order_no,
        status: "paid",
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        fulfilment: "Cafe",
        totalIdr: order.total_idr,
        items: order.items_json,
        adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/orders/${order.id}`,
      });
      // Auto-reply the customer their order details.
      await notifyCustomerOrderConfirmed(order);
      return NextResponse.json({ ok: true, txStatus, fraud, paid, cafe: true });
    }

    // Only create shipment if paid AND not created
    if (paid) {
      // LOCK: mark creating (prevents duplicates on webhook retries)
      // Requires orders.shipment_status column.
      const { data: locked, error: lockErr } = await supabase
        .from("orders")
        .update({ shipment_status: "creating" })
        .eq("id", order.id)
        .eq("shipment_status", "not_created")
        .select("id")
        .maybeSingle();

      // If not locked, it means another webhook already started/finished.
      if (lockErr) throw lockErr;
      if (!locked) {
        return NextResponse.json({ ok: true, txStatus, fraud, shipment: "already_handled" });
      }

      // Decrement nearest-store stock on payment (once — we hold the lock).
      // Never throws; runs before shipment so stock is right even if shipment hiccups.
      await decrementStockForOrder(supabase, order);

      // Create the Biteship shipment — but never let a shipment failure abort the
      // PAID confirmation or strand the order at 'creating'. On failure we park it
      // at 'needs_attention' (which the admin retry tooling looks for) and still
      // send the PAID notification below. Mirrors /api/midtrans/webhook.
      try {
        // Double-check shipments table too (extra safety)
        const { data: existing } = await supabase
          .from("shipments")
          .select("id, biteship_order_id")
          .eq("order_id", order.id)
          .maybeSingle();

        if (!existing?.biteship_order_id) {
          // Intercity orders carry a customer-chosen Biteship courier + postal —
          // ship via the postal-based helper (matches the quoted rate). Same-day /
          // area-based orders keep the existing lat/lng path untouched.
          const isIntercity = order?.meta?.delivery_mode === "intercity" && order?.courier_company;
          const biteship = isIntercity
            ? await createIntercityShipment({
                external_id: order.midtrans_order_id,
                destination_address: order.shipping_address || order.address || "",
                destination_contact_name: order.recipient_name || order.customer_name || order?.customer_json?.name || "Customer",
                destination_contact_phone: order.recipient_phone || order.customer_phone || order?.customer_json?.phone || "",
                destination_postal_code: order.postal ? Number(order.postal) : null,
                courier_company: order.courier_company,
                courier_type: order.courier_type,
                items: (Array.isArray(order.items_json) ? order.items_json : []).map((it: any) => ({
                  name: String(it?.name || "Item"),
                  value: (Number(it?.price) || 0) * (Number(it?.quantity) || 1),
                  quantity: Number(it?.quantity) || 1,
                  // Per-item weight matches the checkout quote (180g) so the shipped
                  // weight never exceeds what the customer was charged for.
                  weight: 180,
                })),
                order_note: order.notes || "",
              })
            : await createBiteshipOrder(order);

          await supabase.from("shipments").insert({
            order_id: order.id,
            provider: "biteship",
            biteship_order_id: biteship?.id ?? null,
            waybill_id: biteship?.waybill_id ?? null,
            courier_company: order.courier_company ?? null,
            courier_service: order.courier_service ?? null,
            status: biteship?.status ?? "created",
            raw_json: biteship,
          });

          // Mirror the tracking onto the orders row too — the admin and the
          // customer order-lookup read waybill/tracking_url from orders (this is
          // what the old /webhook wrote), so without this the tracking link would
          // go blank for webcommerce orders.
          await supabase
            .from("orders")
            .update({
              biteship_order_id: biteship?.id ?? null,
              waybill: biteship?.courier?.waybill ?? biteship?.waybill ?? biteship?.data?.courier?.waybill ?? null,
              tracking_url: biteship?.courier?.tracking_url ?? biteship?.tracking_url ?? biteship?.data?.courier?.tracking_url ?? null,
              shipment_status: "created",
            })
            .eq("id", order.id);
        } else {
          await supabase
            .from("orders")
            .update({ shipment_status: "created" })
            .eq("id", order.id);
        }
      } catch (shipErr: any) {
        console.error("midtrans notification: shipment creation failed:", shipErr);
        await supabase
          .from("orders")
          .update({ shipment_status: "needs_attention" })
          .eq("id", order.id);
      }

      await notifyNewOrder({
        orderNo: order.order_no,
        status: "paid",
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        fulfilment: order.fulfilment_status,
        scheduleDate: order?.meta?.fulfillment?.scheduleDate ?? null,
        scheduleTime: order?.meta?.fulfillment?.scheduleTime ?? null,
        totalIdr: order.total_idr,
        items: order.items_json,
        boxesText: order?.meta?.boxes_text ?? null,
        adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/orders/${order.id}`,
      });
      // Auto-reply the customer their order details (online order paid).
      await notifyCustomerOrderConfirmed(order);
      // If the buyer opted to invite the recipient, send them the referral link.
      await inviteRecipientReferral(supabase, order, process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id");
    }

    return NextResponse.json({ ok: true, txStatus, fraud, paid });
  } catch (e: any) {
    console.error("midtrans notification error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
