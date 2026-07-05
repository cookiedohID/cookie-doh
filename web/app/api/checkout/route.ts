// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken, midtransEnv } from "@/lib/midtrans";
import { notifyNewOrder } from "@/lib/notify";
import { upsertCustomerForOrder } from "@/lib/customers";
import { canonicalPhone } from "@/lib/phone";
import { loyaltyForPhone } from "@/app/api/loyalty/lookup/route";
import { cleanRefCode } from "@/lib/referrals";
import { validatePromo } from "@/lib/promo";
import { rewardMatchesTier } from "@/lib/spendRewards";
import { serverBoxTotal } from "@/lib/serverPricing";
import { classifyItem } from "@/lib/loyalty";
import { getMember } from "@/lib/memberServer";
import { vipStatusForPhone, loyaltyPerFree } from "@/lib/vip";
import { FLAVORS } from "@/lib/catalog";

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

type OrderLine = { id: string; name: string; price: number; quantity: number; bundle?: boolean; kind?: "cookie" | "drink" };

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
      const kind = it?.kind === "drink" || it?.kind === "cookie" ? it.kind : undefined;
      if (qty > 0) out.push({ id, name, price, quantity: qty, ...(isBundle ? { bundle: true } : {}), ...(kind ? { kind } : {}) });
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

function readCookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();
    const supabase = supaAdmin();

    // Referral code (from the cd_ref cookie set when the friend clicked /?ref=…).
    // Validated; rides along on the order so the payment webhook can reward it.
    const refCode = cleanRefCode(readCookie(req, "cd_ref"));

    const customerName = (payload?.customer?.name || "").toString();
    const customerPhone = (payload?.customer?.phone || "").toString();
    const email = (payload?.customer?.email || payload?.email || "").toString();

    // 👑 VIP perks key off the VERIFIED signed-in member (OTP-bound phone), never
    // the typed checkout phone — so they can't be claimed with someone else's
    // number. Null for guests / unverified. (Free same-day delivery is applied
    // client-side, consistent with how delivery pricing already works.)
    const member = await getMember(supabase, req);
    const memberPhone = member?.ownerPhone || null;
    const vipTier = memberPhone ? (await vipStatusForPhone(supabase, memberPhone)).tier : null;

    // "Deliver to someone else": the recipient's own contact, distinct from the
    // buyer. The courier reaches the recipient and the tracking WhatsApp goes to
    // them (mentioning the sender). Only meaningful for delivery.
    const recipientName = (payload?.recipient?.name || "").toString().trim();
    const recipientPhoneRaw = (payload?.recipient?.phone || "").toString().trim();
    const recipientPhone = recipientPhoneRaw ? (canonicalPhone(recipientPhoneRaw) || recipientPhoneRaw) : "";

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

    const shippingCost = Number(payload?.shipping_cost_idr ?? payload?.shipping_cost ?? 0) || 0;

    // ---- TotalBuahStore lines (unified cart) — repriced server-side vs the ERP.
    // Same guards as /api/tbs/checkout: finite price, oversell vs live stock,
    // qty caps, composite SKU@UOM variants. TBS lines never join promos/loyalty.
    let tbsMeta: any = null;
    let tbsSubtotal = 0;
    const tbsReq = payload?.tbs;
    if (tbsReq && Array.isArray(tbsReq?.lines) && tbsReq.lines.length) {
      const { partnerGetStock, TBS_STORE_GEO, canSeeTbsShop } = await import("@/lib/tbsShop");
      const { computeTbsStockIssues } = await import("@/lib/tbsStockCheck");
      // same visibility gate as every other TBS endpoint — while the shop is in
      // preview, only preview/admin sessions may buy TBS items
      if (!(await canSeeTbsShop(req))) {
        return NextResponse.json({ ok: false, error: "TotalBuahStore isn't open yet — please remove the TBS items from your cart." }, { status: 403 });
      }
      const tbsStore = String(tbsReq.store || "").toUpperCase();
      const geo = (TBS_STORE_GEO as any)[tbsStore];
      if (!/^[A-Z0-9-]{2,20}$/.test(tbsStore)) return NextResponse.json({ ok: false, error: "Pick your TotalBuahStore first." }, { status: 400 });
      const wanted = new Map<string, number>();
      for (const l of tbsReq.lines.slice(0, 200)) {
        const sku = String(l?.sku || "").trim().slice(0, 48);
        const q = Math.max(1, Math.min(99, Math.round(Number(l?.qty) || 0)));
        if (sku) wanted.set(sku, Math.min(99, (wanted.get(sku) || 0) + q));
      }
      // the ERP prices at most 60 SKUs per call — reject instead of silently
      // dropping lines the customer thinks they bought
      if (wanted.size > 60) {
        return NextResponse.json({ ok: false, error: "Your TotalBuahStore basket has more than 60 different items — please split it into two orders." }, { status: 400 });
      }
      if (wanted.size) {
        const priced = await partnerGetStock(tbsStore, [...wanted.keys()]);
        if (!Array.isArray(priced)) return NextResponse.json({ ok: false, error: "The TBS store is unreachable right now — try again in a minute." }, { status: 200 });
        const bySku = new Map(priced.map((x: any) => [String(x.sku), x]));
        const problems: string[] = [];
        for (const [sku, q] of wanted) {
          const x: any = bySku.get(sku);
          const priceNum = Number(x?.price);
          if (!x || !Number.isFinite(priceNum) || priceNum <= 0 || priceNum > 100_000_000) { problems.push(`${sku}: no longer available`); continue; }
          if (x.stockLive !== false && Number(x.stock) < q) { problems.push(`${x.name}: only ${Math.max(0, Number(x.stock) || 0)} left`); continue; }
          if (x.stockLive === false && q > 20) { problems.push(`${x.name}: max 20 per order`); continue; }
          const price = Math.round(priceNum);
          items.push({ id: `tbs:${sku}`, name: String(x.name || sku), quantity: q, price, kind: "tbs", sku, unit: String(x.unit || "pcs") } as any);
          tbsSubtotal += price * q;
        }
        {
          const agg = computeTbsStockIssues([...wanted].map(([sku, qty]) => ({ sku, qty })), priced);
          const seenBase = new Set<string>();
          for (const [sku, issue] of Object.entries(agg)) {
            if (issue.type !== "group") continue;
            const base = sku.split("@")[0];
            if (seenBase.has(base)) continue;
            seenBase.add(base);
            problems.push(`${String(bySku.get(base)?.name || base)}: only ${issue.stock} in stock across all pack sizes`);
          }
        }
        if (problems.length) return NextResponse.json({ ok: false, error: `Some TBS items need attention: ${problems.join("; ")}.`, problems }, { status: 409 });
        tbsMeta = { store: tbsStore, storeName: geo?.name || tbsStore, fulfil: null, delivery_fee: 0, pushed: false, mixed: true, items_subtotal: tbsSubtotal };
      }
    }

    // Fulfilment-aware money guards (unified cart):
    //  • pickup never carries a delivery fee (client-supplied shippingCost ignored);
    //  • a TBS delivery order's quote must originate from the SELECTED TBS store.
    const fulfilTypeEarly = (payload?.fulfillment?.type || payload?.fulfilment_status || "").toString().trim();
    if (fulfilTypeEarly === "pickup" && shippingCost !== 0) {
      return NextResponse.json({ ok: false, error: "Pickup orders have no delivery fee — please refresh and try again." }, { status: 400 });
    }
    if (tbsMeta && fulfilTypeEarly === "delivery") {
      const qOrigin = String(payload?.meta?.quote?.origin?.id || "").toLowerCase();
      if (qOrigin && qOrigin !== String(tbsMeta.store).toLowerCase()) {
        return NextResponse.json({ ok: false, error: "Your delivery quote is from a different store than your TotalBuahStore basket — refresh the checkout page." }, { status: 400 });
      }
    }

    // ---- Server-authoritative cart valuation ----
    // The client's box.total / total / subtotal are NEVER trusted for money. Every
    // non-reward box is re-priced from catalog constants (serverBoxTotal); the
    // reward box is priced from the validated tier below. This binds the charged
    // amount to the actual cart, closing crafted-payload underpayment.
    const allBoxes = Array.isArray(cart?.boxes) ? cart.boxes : [];
    const isReward = (b: any) => !!b?.reward?.tierId;
    const nonRewardSubtotal = allBoxes
      .filter((b: any) => !isReward(b))
      .reduce((s: number, b: any) => s + serverBoxTotal(b), 0);

    // ---- Spend-threshold reward (server-authoritative anti-abuse) ----
    // The reward rides in the cart at a special price. Re-validate that the
    // QUALIFYING (non-reward, server-priced) subtotal meets the tier threshold and
    // that the reward's price + cookies match the tier — so it can't be kept after
    // dropping below the threshold or swapped for pricier cookies. The reward is
    // charged at the TIER's special price, never the client's value.
    let rewardTotal = 0;
    {
      const rewardBoxes = allBoxes.filter(isReward);
      if (rewardBoxes.length > 1) {
        return NextResponse.json({ ok: false, error: "Only one reward per order." }, { status: 400 });
      }
      if (rewardBoxes.length === 1) {
        const rb = rewardBoxes[0];
        const { data: tier } = await supabase
          .from("spend_rewards")
          .select("id, threshold_idr, special_price_idr, items, active")
          .eq("id", String(rb.reward.tierId))
          .maybeSingle();
        if (!tier || !tier.active) {
          return NextResponse.json({ ok: false, error: "That reward is no longer available — please review your cart." }, { status: 400 });
        }
        if (nonRewardSubtotal < Number(tier.threshold_idr || 0)) {
          return NextResponse.json(
            { ok: false, error: `Spend at least Rp${Number(tier.threshold_idr).toLocaleString("id-ID")} (excluding the reward) to claim it.` },
            { status: 400 }
          );
        }
        if (!rewardMatchesTier({ total: Number(rb.total) || 0, items: rb.items || [] }, tier as any)) {
          return NextResponse.json({ ok: false, error: "The reward in your cart doesn't match the offer — please re-add it." }, { status: 400 });
        }
        rewardTotal = Number(tier.special_price_idr) || 0;
      }
    }

    // ---- Promo code (applies to MERCHANDISE only — never the reward's special price) ----
    let promoApplied: { code: string; discount: number } | null = null;
    const promoCodeRaw = String(payload?.promo_code || "").trim();
    let discount = 0;
    if (promoCodeRaw) {
      const pv = await validatePromo(supabase, promoCodeRaw, nonRewardSubtotal, customerPhone);
      if (!pv.valid) {
        return NextResponse.json({ ok: false, error: pv.reason || "That promo code can't be applied." }, { status: 400 });
      }
      promoApplied = { code: pv.code!, discount: pv.discount };
      discount = pv.discount;
    }

    // ---- Authoritative amounts (client totals ignored for the charge) ----
    const subtotal = nonRewardSubtotal + rewardTotal + tbsSubtotal;
    const finalTotal = Math.max(0, nonRewardSubtotal - discount) + rewardTotal + tbsSubtotal + shippingCost;
    if (finalTotal < 1) {
      return NextResponse.json(
        { ok: false, error: promoApplied ? "This code would make the order free — please contact us to arrange it." : "Your cart is empty." },
        { status: 400 }
      );
    }

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
        // VIP members earn faster (buy-9/8/7) — but only on their own verified
        // number, so the higher balance can't be claimed for someone else.
        const vipN = vipTier && phone === memberPhone ? loyaltyPerFree(vipTier) : undefined;
        const loy = await loyaltyForPhone(supaCheck, phone, vipN);
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

    // ---- Subscription reward redemption (separate "buy 6, get 1 free" pool) ----
    // Free cookies the member redeems from their subscription reward balance,
    // choosing the flavour. Validated against the server-computed available pool
    // (which already nets out next-box reservations), then added at Rp0 as
    // subReward lines so they never touch the regular buy-10-get-1 loyalty.
    const subRewardReq = Array.isArray(payload?.subReward) ? payload.subReward : [];
    if (subRewardReq.length) {
      const phone = canonicalPhone(customerPhone);
      if (!phone) {
        return NextResponse.json({ ok: false, error: "Sign in (or add your member phone) to use subscription rewards." }, { status: 400 });
      }
      const lines = subRewardReq
        .map((r: any) => ({
          id: String(r?.id || "").trim(),
          name: String(r?.name || "").trim() || "Cookie",
          kind: "cookie" as const,
          price: 0,
          quantity: Math.max(0, Math.floor(Number(r?.quantity ?? 1))),
          free: true,
          subReward: true,
        }))
        .filter((l: any) => l.id && l.quantity > 0);
      const want = lines.reduce((s: number, l: any) => s + l.quantity, 0);
      if (want > 0) {
        const { subscriptionRewardBalance } = await import("@/lib/subscriptionRewards");
        const bal = await subscriptionRewardBalance(supabase, phone);
        if (want > bal.available) {
          return NextResponse.json({ ok: false, error: "Not enough subscription reward cookies available." }, { status: 400 });
        }
        items.push(...lines);
      }
    }

    // ---- VIP free cookie (a per-order gift for an eligible verified member) ----
    // The member picks the flavour; added at Rp0 and flagged noLoyalty so it
    // neither earns a stamp nor spends one. Gated on the verified member's tier,
    // so a guest / non-VIP can never trigger it.
    if (vipTier?.free_cookie_per_order) {
      const pick = (payload as any)?.vip_free_cookie;
      const pickId = String(pick?.id ?? pick ?? "").trim();
      const f = (FLAVORS as any[]).find((x) => String(x.id) === pickId);
      if (f) {
        items.push({ id: String(f.id), name: String(f.name), price: 0, quantity: 1, kind: "cookie", free: true, noLoyalty: true, vipGift: true } as any);
      }
    }

    // scheduling & pickup & quote meta
    const fulfillment = payload?.fulfillment || null;
    const pickup = payload?.pickup || null;
    const quote = payload?.meta?.quote || null;

    const fulfillmentType = (fulfillment?.type || payload?.fulfilment_status || "").toString().trim() || null;

    // 🥤 Smoothies are perishable: a delivery order containing a drink may ONLY use
    // instant delivery — never scheduled same-day, never intercity. (Pickup is fine.)
    const orderHasDrink = items.some((it) => classifyItem(String(it.id), (it as any).kind) === "drink");
    if (orderHasDrink && fulfillmentType === "delivery") {
      const dmode = String(payload?.meta?.delivery_mode || "");
      const dspeed = String(payload?.delivery?.speed || fulfillment?.deliverySpeed || "");
      if (dmode === "intercity" || dspeed !== "instant") {
        return NextResponse.json(
          { ok: false, error: "Smoothies can only be sent by instant delivery (not same-day or intercity). Please switch to instant delivery or pickup." },
          { status: 400 }
        );
      }
    }

    const orderInsert: any = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      email: email || null,

      recipient_name: recipientName || null,
      recipient_phone: recipientPhone || null,

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
      total_idr: finalTotal || null,

      midtrans_order_id: midtransOrderId,

      payment_status: "PENDING",
      shipment_status: "not_created",

      fulfilment_status: fulfillmentType,

      checkout_mode: checkoutMode,
      items_json: items,
      customer_json: payload?.customer || null,
      shipping_json: payload?.delivery || null,

      meta: {
        // client meta is accepted EXCEPT the tbs block — that is server-derived
        // only (a crafted meta.tbs would poison settlement + the store push).
        ...(() => { const m = { ...(payload?.meta || {}) } as any; delete m.tbs; return m; })(),
        ...(tbsMeta ? { tbs: { ...tbsMeta, fulfil: fulfillmentType || "delivery" } } : {}),
        fulfillment,
        pickup,
        quote,
        boxes_text: boxesText,
        gift: payload?.gift || null,
        ref: refCode,
        promo: promoApplied,
        invite_recipient: !!(payload?.invite_recipient && recipientPhone),
        vip_tier: vipTier?.name || null,
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
      totalIdr: orderRow.total_idr ?? finalTotal,
      items,
      boxesText,
      adminUrl: `${siteUrl}/admin/orders/${orderRow.id}`,
    });

    // ✅ Manual mode = return redirect_url to /checkout/pending
    if (checkoutMode === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderRow.id);
      u.searchParams.set("total", String(orderRow.total_idr || finalTotal || 0));
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
      gross_amount: finalTotal,
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
