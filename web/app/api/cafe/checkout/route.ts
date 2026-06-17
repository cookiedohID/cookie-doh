// web/app/api/cafe/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken } from "@/lib/midtrans";
import { notifyNewOrder } from "@/lib/notify";
import { canonicalPhone } from "@/lib/phone";
import { loyaltyForPhone } from "@/app/api/loyalty/lookup/route";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      .map((it: any) => ({
        id: String(it?.id || ""),
        name: String(it?.name || "Item"),
        kind: it?.kind === "drink" ? "drink" : "cookie",
        price: Math.max(0, Math.round(Number(it?.price) || 0)),
        quantity: Math.max(1, Math.round(Number(it?.quantity) || 1)),
        free: it?.free === true,
      }))
      .filter((it: any) => it.id);

    if (!items.length) return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });

    const total = items.reduce((s: number, it: any) => s + (it.free ? 0 : it.price * it.quantity), 0);
    if (total <= 0) return NextResponse.json({ ok: false, error: "Add at least one paid item" }, { status: 400 });

    const memberPhone = canonicalPhone(body?.memberPhone);

    // Server-side reward check: free lines must be backed by real available rewards.
    const supaCheck = supaAdmin();
    const freeCookies = items.filter((i: any) => i.free && i.kind === "cookie").reduce((s: number, i: any) => s + i.quantity, 0);
    const freeDrinks = items.filter((i: any) => i.free && i.kind === "drink").reduce((s: number, i: any) => s + i.quantity, 0);
    if (freeCookies || freeDrinks) {
      if (!memberPhone) return NextResponse.json({ ok: false, error: "Member phone required to use rewards." }, { status: 400 });
      const loy = await loyaltyForPhone(supaCheck, memberPhone);
      if (!loy || freeCookies > loy.freeCookies || freeDrinks > loy.freeDrinks) {
        return NextResponse.json({ ok: false, error: "Not enough rewards available for this member." }, { status: 400 });
      }
    }
    const customerName = String(body?.customerName || "").trim() || "Cafe customer";
    const midtransOrderId = `CDC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const supabase = supaCheck;
    const orderInsert: any = {
      customer_name: customerName,
      customer_phone: memberPhone || null,
      items_json: items,
      subtotal_idr: total,
      total_idr: total,
      shipping_cost_idr: 0,
      midtrans_order_id: midtransOrderId,
      payment_status: "PENDING",
      shipment_status: "not_required",
      fulfilment_status: "cafe",
      checkout_mode: "midtrans",
      meta: { channel: "cafe", member_phone: memberPhone || null },
    };

    const { data: orderRow, error } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr")
      .maybeSingle();
    if (error) throw error;
    if (!orderRow?.id) throw new Error("Order insert failed");

    const token = await createSnapToken({
      order_id: midtransOrderId,
      gross_amount: total,
      customer: { name: customerName, phone: memberPhone || undefined },
      enabledPayments: ["qris", "gopay", "shopeepay"], // QR / e-wallet for in-store
      finishUrl: `${siteUrl()}/cafe`,
    });

    await supabase
      .from("orders")
      .update({ meta: { ...orderInsert.meta, midtrans: { token } } })
      .eq("id", orderRow.id);

    // Notify staff a cafe order was started (paid confirmation comes via webhook).
    await notifyNewOrder({
      orderNo: String(orderRow.order_no ?? orderRow.id),
      status: "placed",
      customerName,
      customerPhone: memberPhone,
      fulfilment: "Cafe",
      totalIdr: total,
      items,
      adminUrl: `${siteUrl()}/admin/orders/${orderRow.id}`,
    });

    return NextResponse.json({
      ok: true,
      order_id: orderRow.id,
      order_no: orderRow.order_no,
      snap_token: token,
      total,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Checkout failed" }, { status: 500 });
  }
}
