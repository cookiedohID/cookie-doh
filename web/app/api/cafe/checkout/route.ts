// web/app/api/cafe/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken } from "@/lib/midtrans";
import { notifyNewOrder } from "@/lib/notify";
import { decrementStockForOrder } from "@/lib/stock";
import { canonicalPhone } from "@/lib/phone";
import { loyaltyForPhone } from "@/app/api/loyalty/lookup/route";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";
import { FLAVORS, BOX_PRICES } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { getBundle } from "@/lib/bundles";

export const runtime = "nodejs";

// Prices are authoritative on the server — this is a customer-operated self-
// checkout, so the client's price/kind can't be trusted.
const CAFE_COOKIE_PRICE = 32500; // single cookie at the register (matches the POS)
const COOKIE_IDS = new Set(FLAVORS.map((f: any) => String(f.id)));
const DRINK_IDS = new Set(SMOOTHIES.map((s) => String(s.id)));

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
      .map((it: any) => {
        const id = String(it?.id || "");
        const inCookie = COOKIE_IDS.has(id);
        const inDrink = DRINK_IDS.has(id);
        // Resolve kind from the trusted catalog; only fall back to the client's
        // kind for the two ids that exist as BOTH a cookie and a smoothie.
        let kind: "cookie" | "drink" | null =
          inCookie && !inDrink ? "cookie" : inDrink && !inCookie ? "drink" : null;
        if (!kind && inCookie && inDrink) kind = it?.kind === "drink" ? "drink" : "cookie";
        const subReward = it?.subReward === true;
        const free = it?.free === true || subReward; // a subscription reward is free
        const unit = kind === "drink" ? SMOOTHIE_PRICE : CAFE_COOKIE_PRICE;
        return {
          id,
          name: String(it?.name || "Item"),
          kind,
          price: free ? 0 : unit, // never trust client price
          quantity: Math.max(1, Math.round(Number(it?.quantity) || 1)),
          free,
          ...(subReward ? { subReward: true } : {}),
        };
      })
      .filter((it: any) => it.id && it.kind); // drop unknown ids

    // Boxes (3 / 6 cookies at the box price) — flatten to cookie lines, priced
    // server-side from BOX_PRICES so the client can't dictate the discount.
    const rawBoxes = Array.isArray(body?.boxes) ? body.boxes : [];
    const boxItems: any[] = [];
    for (const b of rawBoxes) {
      const size = Number(b?.size);
      if (size !== 3 && size !== 6) {
        return NextResponse.json({ ok: false, error: "Box must be 3 or 6 cookies." }, { status: 400 });
      }
      const picks = (Array.isArray(b?.items) ? b.items : [])
        .map((it: any) => ({ id: String(it?.id || ""), name: String(it?.name || "Item"), qty: Math.max(1, Math.round(Number(it?.qty ?? it?.quantity) || 1)) }))
        .filter((it: any) => it.id && COOKIE_IDS.has(it.id));
      const count = picks.reduce((s: number, it: any) => s + it.qty, 0);
      if (count !== size) {
        return NextResponse.json({ ok: false, error: `Box of ${size} must have exactly ${size} cookies.` }, { status: 400 });
      }
      const unit = Math.round((BOX_PRICES as any)[size] / size); // 90k/3 and 180k/6 both = 30000
      for (const p of picks) {
        boxItems.push({ id: p.id, name: p.name, kind: "cookie", price: unit, quantity: p.qty, free: false });
      }
    }

    // Bundles (fixed-price X cookies + Y drinks) — flatten to per-unit lines,
    // priced server-side from the bundle definition, marked bundle:true (a
    // discounted set — used for reporting; bundle items still earn loyalty stamps).
    const rawBundles = Array.isArray(body?.bundles) ? body.bundles : [];
    const bundleItems: any[] = [];
    for (const b of rawBundles) {
      const bundle = getBundle(String(b?.id || ""));
      if (!bundle) return NextResponse.json({ ok: false, error: "Unknown bundle." }, { status: 400 });
      const cookiePicks = (Array.isArray(b?.cookies) ? b.cookies : [])
        .map((it: any) => ({ id: String(it?.id || ""), name: String(it?.name || "Item"), qty: Math.max(1, Math.round(Number(it?.qty ?? it?.quantity) || 1)) }))
        .filter((it: any) => it.id && COOKIE_IDS.has(it.id));
      const drinkPicks = (Array.isArray(b?.drinks) ? b.drinks : [])
        .map((it: any) => ({ id: String(it?.id || ""), name: String(it?.name || "Item"), qty: Math.max(1, Math.round(Number(it?.qty ?? it?.quantity) || 1)) }))
        .filter((it: any) => it.id && DRINK_IDS.has(it.id));
      const cCount = cookiePicks.reduce((s: number, it: any) => s + it.qty, 0);
      const dCount = drinkPicks.reduce((s: number, it: any) => s + it.qty, 0);
      if (cCount !== bundle.cookies || dCount !== bundle.drinks) {
        return NextResponse.json({ ok: false, error: `${bundle.name} needs ${bundle.cookies} cookies + ${bundle.drinks} drinks.` }, { status: 400 });
      }
      const units: { id: string; name: string; kind: "cookie" | "drink" }[] = [];
      for (const p of cookiePicks) for (let i = 0; i < p.qty; i++) units.push({ id: p.id, name: p.name, kind: "cookie" });
      for (const p of drinkPicks) for (let i = 0; i < p.qty; i++) units.push({ id: p.id, name: p.name, kind: "drink" });
      const base = Math.floor(bundle.price / units.length);
      const rem = bundle.price - base * units.length; // spread so the lines sum to the exact bundle price
      units.forEach((u, i) => bundleItems.push({ id: u.id, name: u.name, kind: u.kind, price: base + (i < rem ? 1 : 0), quantity: 1, free: false, bundle: true }));
    }

    const allItems = [...items, ...boxItems, ...bundleItems];
    if (!allItems.length) return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });

    const total = allItems.reduce((s: number, it: any) => s + (it.free ? 0 : it.price * it.quantity), 0);

    const memberPhone = canonicalPhone(body?.memberPhone);
    const customerName = String(body?.customerName || "").trim() || "Cafe customer";
    const midtransOrderId = `CDC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Server-side reward check: free lines must be backed by real available rewards.
    // Regular loyalty rewards and subscription rewards are SEPARATE pools — subReward
    // lines (also free+cookie) are excluded here and validated against the sub pool.
    const supaCheck = supaAdmin();
    const freeCookies = allItems.filter((i: any) => i.free && i.kind === "cookie" && !i.subReward).reduce((s: number, i: any) => s + i.quantity, 0);
    const freeDrinks = allItems.filter((i: any) => i.free && i.kind === "drink" && !i.subReward).reduce((s: number, i: any) => s + i.quantity, 0);
    const subRewardCookies = allItems.filter((i: any) => i.subReward && i.kind === "cookie").reduce((s: number, i: any) => s + i.quantity, 0);

    // A Rp0 cart is allowed only if it's a pure free-reward redemption.
    const isFreeOnly = total <= 0;
    if (isFreeOnly && freeCookies === 0 && freeDrinks === 0 && subRewardCookies === 0) {
      return NextResponse.json({ ok: false, error: "Add at least one item." }, { status: 400 });
    }

    // Subscription reward redemption (separate "buy 6, get 1 free" pool).
    if (subRewardCookies > 0) {
      if (!memberPhone) return NextResponse.json({ ok: false, error: "Member phone required to use rewards." }, { status: 400 });
      const bal = await subscriptionRewardBalance(supaCheck, memberPhone);
      if (subRewardCookies > bal.available) {
        return NextResponse.json({ ok: false, error: "Not enough subscription reward cookies for this member." }, { status: 400 });
      }
    }

    if (freeCookies || freeDrinks) {
      if (!memberPhone) return NextResponse.json({ ok: false, error: "Member phone required to use rewards." }, { status: 400 });
      const loy = await loyaltyForPhone(supaCheck, memberPhone);
      if (!loy || freeCookies > loy.freeCookies || freeDrinks > loy.freeDrinks) {
        return NextResponse.json({ ok: false, error: "Not enough rewards available for this member." }, { status: 400 });
      }
      // Atomically reserve the rewards so two rapid/concurrent checkouts for the
      // same member can't both pass the check above and double-spend. The webhook
      // marks the reservation consumed (paid) or released (failed).
      // Fail-safe: if reserve_rewards isn't deployed yet, fall back to the check.
      try {
        const { data: reserved, error: rErr } = await supaCheck.rpc("reserve_rewards", {
          p_phone: memberPhone,
          p_avail_cookies: loy.freeCookies,
          p_avail_drinks: loy.freeDrinks,
          p_want_cookies: freeCookies,
          p_want_drinks: freeDrinks,
          p_midtrans_order_id: midtransOrderId,
        });
        if (rErr) {
          console.warn("[cafe] reserve_rewards unavailable, using derived check:", rErr.message);
        } else if (reserved === false) {
          return NextResponse.json({ ok: false, error: "Not enough rewards available for this member." }, { status: 400 });
        }
      } catch (e: any) {
        console.warn("[cafe] reserve_rewards failed, using derived check:", e?.message || e);
      }
    }

    const supabase = supaCheck;
    const orderInsert: any = {
      customer_name: customerName,
      customer_phone: memberPhone || null,
      items_json: allItems,
      subtotal_idr: total,
      total_idr: total,
      shipping_cost_idr: 0,
      midtrans_order_id: midtransOrderId,
      payment_status: isFreeOnly ? "PAID" : "PENDING",
      paid_at: isFreeOnly ? new Date().toISOString() : null,
      shipment_status: isFreeOnly ? "done" : "not_required",
      fulfilment_status: "cafe",
      checkout_mode: isFreeOnly ? "free" : "midtrans",
      meta: { channel: "cafe", member_phone: memberPhone || null },
    };

    const { data: orderRow, error } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr")
      .maybeSingle();
    if (error) throw error;
    if (!orderRow?.id) throw new Error("Order insert failed");

    // ---- Free-only redemption: nothing to charge — finish it now. ----
    if (isFreeOnly) {
      // Consume the reservation (the webhook does this on payment for paid orders).
      try {
        await supabase
          .from("loyalty_redemptions")
          .update({ status: "consumed", order_id: orderRow.id })
          .eq("midtrans_order_id", midtransOrderId)
          .eq("status", "reserved");
      } catch (e) {
        console.error("[cafe free] consume reservation failed:", e);
      }
      // Decrement stock for the free items handed over.
      await decrementStockForOrder(supabase, { ...orderInsert, id: orderRow.id });
      await notifyNewOrder({
        orderNo: String(orderRow.order_no ?? orderRow.id),
        status: "paid",
        customerName,
        customerPhone: memberPhone,
        fulfilment: "Cafe (free reward)",
        totalIdr: 0,
        items: allItems,
        adminUrl: `${siteUrl()}/admin/orders/${orderRow.id}`,
      });
      return NextResponse.json({ ok: true, free: true, order_id: orderRow.id, order_no: orderRow.order_no, total: 0 });
    }

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
      items: allItems,
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
