// web/lib/subscriptionMaterialize.ts — the subscription cron engine.
//
// Runs once daily (one GitHub Action → one endpoint, so the steps run in order):
//   1. materialize: every scheduled box due today becomes a NORMAL paid order
//      (CD-SUBDEL-<deliveryId>), with +1 bonus free cookie, reusing all existing
//      fulfilment. Idempotent via an atomic scheduled->made claim. Advances the
//      next box, or completes the subscription when prepaid capacity runs out.
//   2. reminders: D-2 and D-1 "still in town?" WhatsApp for upcoming boxes.
//   3. sweep: stale PENDING plans (abandoned checkouts) → FAILED (non-destructive;
//      a late webrook payment can still revive them).
import { FLAVORS } from "@/lib/catalog";
import { sendWhatsApp } from "@/lib/whatsapp";
import { notifyNewOrder } from "@/lib/notify";
import { decrementStockForOrder } from "@/lib/stock";
import { remainingCapacity } from "@/lib/subscriptionManage";
import { subBoxPrice, nextDeliveryDate, todayIso, addDays, type SubFrequency } from "@/lib/subscriptions";

const AVAILABLE_COOKIES = FLAVORS.filter((f: any) => !f.soldOut).map((f: any) => ({ id: f.id, name: f.name }));
const NAME_BY_ID = new Map(FLAVORS.map((f: any) => [f.id, f.name]));

function perCookiePrice(boxSize: number): number {
  return Math.round(subBoxPrice(boxSize) / boxSize); // 90k/3 or 180k/6 = 30k
}

// Build the order lines for one box. `seq` rotates curated picks + the bonus
// flavour so consecutive boxes vary. `inStock` (optional) prefers available items.
export function resolveBoxItems(sub: any, seq: number, inStock?: Set<string>) {
  const boxSize = Number(sub.box_size);
  const price = perCookiePrice(boxSize);
  const items: any[] = [];

  // Subscription cookies are OUTSIDE the regular buy-10-get-1 points system
  // (noLoyalty:true) — the subscription has its own "buy 6, get 1 free" reward.
  if (sub.mode === "fixed" && Array.isArray(sub.fixed_flavours) && sub.fixed_flavours.length) {
    for (const f of sub.fixed_flavours) {
      const qty = Math.max(0, Math.floor(Number(f.quantity || 0)));
      if (!qty) continue;
      items.push({ id: String(f.id), name: String(f.name || NAME_BY_ID.get(f.id) || "Cookie"), price, quantity: qty, kind: "cookie", noLoyalty: true });
    }
  } else {
    const pool = inStock ? AVAILABLE_COOKIES.filter((c) => inStock.has(c.id)) : AVAILABLE_COOKIES;
    const src = pool.length ? pool : AVAILABLE_COOKIES;
    const chosen: Record<string, { name: string; qty: number }> = {};
    for (let i = 0; i < boxSize; i++) {
      const c = src[(seq + i) % src.length];
      chosen[c.id] = chosen[c.id] || { name: c.name, qty: 0 };
      chosen[c.id].qty++;
    }
    for (const [id, v] of Object.entries(chosen)) items.push({ id, name: v.name, price, quantity: v.qty, kind: "cookie", noLoyalty: true });
  }

  // "Buy 6, get 1 free" — one free cookie for every 6 cookies received, proportional
  // across box sizes. Box of 6 → 1 free every box; box of 3 → 1 free every 2nd box.
  // (seq is 1-based, box size is fixed, so cumulative cookies = seq × size.)
  const bonusCount = Math.floor((seq * boxSize) / 6) - Math.floor(((seq - 1) * boxSize) / 6);
  if (bonusCount > 0) {
    const bonusPool = inStock ? AVAILABLE_COOKIES.filter((c) => inStock.has(c.id)) : AVAILABLE_COOKIES;
    const bsrc = bonusPool.length ? bonusPool : AVAILABLE_COOKIES;
    const bonus = bsrc[seq % bsrc.length];
    // free:true + bonus:true + noLoyalty:true → a pure gift; the loyalty engine
    // ignores it (no stamp earned, not a redemption).
    items.push({ id: bonus.id, name: `${bonus.name} (free)`, price: 0, quantity: bonusCount, kind: "cookie", free: true, bonus: true, noLoyalty: true });
  }

  const boxesText = items.map((it) => `• ${it.name} ×${it.quantity}${it.free ? " (free)" : ""}`).join("\n");
  return { items, boxesText, total: price * boxSize };
}

async function inStockIds(supa: any): Promise<Set<string> | undefined> {
  try {
    const { data } = await supa.from("location_stock").select("item_id, stock, sold_out");
    if (!data?.length) return undefined;
    const ok = new Set<string>();
    for (const r of data) {
      const sold = Boolean(r.sold_out);
      const has = r.stock == null || Number(r.stock) > 0;
      if (!sold && has) ok.add(String(r.item_id));
    }
    return ok.size ? ok : undefined;
  } catch {
    return undefined;
  }
}

// Oldest PAID plan with capacity left.
async function fundingPlanId(supa: any, subscriptionId: string): Promise<string | null> {
  const { data } = await supa
    .from("subscription_plans")
    .select("id, boxes_total, boxes_used, created_at")
    .eq("subscription_id", subscriptionId)
    .eq("payment_status", "PAID")
    .order("created_at", { ascending: true });
  const p = (data || []).find((r: any) => Number(r.boxes_used) < Number(r.boxes_total));
  return p?.id || null;
}

async function maxSeq(supa: any, subscriptionId: string): Promise<number> {
  const { data } = await supa
    .from("subscription_deliveries").select("seq").eq("subscription_id", subscriptionId)
    .order("seq", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.seq) || 0;
}

// ---------- 1) materialize due boxes ----------
async function materializeDue(supa: any, siteUrl: string, dry: boolean) {
  const today = todayIso();
  const { data: due } = await supa
    .from("subscription_deliveries")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", today)
    .order("scheduled_for", { ascending: true })
    .limit(300);

  let made = 0, completed = 0, skippedNoCapacity = 0;
  const stock = await inStockIds(supa);

  for (const del of due || []) {
    const { data: sub } = await supa.from("subscriptions").select("*").eq("id", del.subscription_id).maybeSingle();
    if (!sub || sub.status !== "active") continue;

    const planId = await fundingPlanId(supa, sub.id);
    if (!planId) {
      // No prepaid capacity left — finish the subscription cleanly.
      if (!dry) await supa.from("subscriptions").update({ status: "completed", next_delivery_on: null, updated_at: new Date().toISOString() }).eq("id", sub.id);
      skippedNoCapacity++;
      continue;
    }

    if (dry) { made++; continue; }

    const seq = Number(del.seq) || 0;
    const { items, boxesText, total } = resolveBoxItems(sub, seq, stock);
    const midOrderId = `CD-SUBDEL-${del.id}`;

    // Idempotency guard 1: an order with this deterministic id already exists.
    const { data: existingOrder } = await supa.from("orders").select("id, order_no").eq("midtrans_order_id", midOrderId).maybeSingle();

    // Idempotency guard 2: atomically claim the box (scheduled -> made). Only one
    // run wins; everyone else skips. plan_id pins which plan funds it.
    const { data: claimed } = await supa
      .from("subscription_deliveries")
      .update({ status: "made", plan_id: planId, made_at: new Date().toISOString(), resolved_items: items })
      .eq("id", del.id)
      .eq("status", "scheduled")
      .select("id, scheduled_for")
      .maybeSingle();
    if (!claimed) continue; // already handled by a concurrent run

    // Create (or reuse) the order row.
    let orderId = existingOrder?.id || null;
    let orderNo = existingOrder?.order_no || null;
    if (!orderId) {
      const isDelivery = sub.fulfilment === "delivery";
      const snap = sub.ship_snapshot || {};
      const { data: orderRow, error: oErr } = await supa
        .from("orders")
        .insert({
          customer_name: sub.name || null,
          customer_phone: sub.owner_phone || null,
          email: sub.email || null,
          address: isDelivery ? snap.address || null : null,
          shipping_address: isDelivery ? snap.address || null : null,
          building_name: snap.building_name || null,
          postal: snap.postal || null,
          notes: snap.notes || null,
          destination_area_id: snap.destination_area_id || null,
          subtotal_idr: total,
          shipping_cost_idr: 0,
          total_idr: total,
          midtrans_order_id: midOrderId,
          payment_status: "PAID",
          paid_at: new Date().toISOString(),
          shipment_status: isDelivery ? "not_created" : "not_required",
          fulfilment_status: sub.fulfilment,
          checkout_mode: "subscription",
          items_json: items,
          customer_json: { name: sub.name, phone: sub.owner_phone },
          shipping_json: isDelivery
            ? { address: snap.address, destination_area_id: snap.destination_area_id, postal: snap.postal }
            : null,
          meta: {
            channel: "subscription",
            subscription_id: sub.id,
            delivery_id: del.id,
            seq,
            boxes_text: boxesText,
            pickup: isDelivery ? null : { pointName: snap.pickup_point || null },
          },
        })
        .select("id, order_no")
        .maybeSingle();

      if (oErr || !orderRow?.id) {
        // Couldn't create the order — revert the claim so the next run retries.
        await supa.from("subscription_deliveries").update({ status: "scheduled", plan_id: null, made_at: null }).eq("id", del.id);
        console.error(`[sub-cron] order insert failed for delivery ${del.id}:`, oErr?.message);
        continue;
      }
      orderId = orderRow.id;
      orderNo = orderRow.order_no;
    }

    await supa.from("subscription_deliveries").update({ order_id: orderId, order_no: orderNo }).eq("id", del.id);

    // Recompute plan usage from made/delivered boxes (self-healing, not a fragile ++).
    const { count } = await supa
      .from("subscription_deliveries").select("id", { count: "exact", head: true })
      .eq("plan_id", planId).in("status", ["made", "delivered"]);
    await supa.from("subscription_plans").update({ boxes_used: count || 0 }).eq("id", planId);

    // Reuse existing order machinery: decrement stock + notify (loyalty is derived
    // from the paid order automatically; the bonus line is free so earns nothing).
    const orderForSide = { id: orderId, order_no: orderNo, items_json: items, meta: { channel: "subscription" }, shipping_json: null };
    await decrementStockForOrder(supa, orderForSide);
    await notifyNewOrder({
      orderNo: String(orderNo || orderId),
      status: "paid",
      customerName: sub.name,
      customerPhone: sub.owner_phone,
      fulfilment: `Subscription (${sub.fulfilment})`,
      totalIdr: total,
      items,
      boxesText,
      adminUrl: `${siteUrl}/admin/orders/${orderId}`,
    });

    // Advance: schedule the next box, or complete when capacity is exhausted.
    const nextDate = nextDeliveryDate(claimed.scheduled_for, sub.frequency as SubFrequency, sub.anchor_dom);
    const cap = await remainingCapacity(supa, sub.id);
    await supa.from("subscriptions").update({ delivery_seq: seq, updated_at: new Date().toISOString() }).eq("id", sub.id);
    if (cap > 0) {
      const nextSeq = (await maxSeq(supa, sub.id)) + 1;
      await supa.from("subscription_deliveries").upsert(
        { subscription_id: sub.id, plan_id: null, seq: nextSeq, scheduled_for: nextDate, status: "scheduled" },
        { onConflict: "subscription_id,seq", ignoreDuplicates: true }
      );
      await supa.from("subscriptions").update({ next_delivery_on: nextDate }).eq("id", sub.id);
    } else {
      await supa.from("subscriptions").update({ status: "completed", next_delivery_on: null }).eq("id", sub.id);
      completed++;
    }
    made++;
  }

  return { made, completed, skippedNoCapacity, due: (due || []).length };
}

// ---------- 2) D-2 / D-1 reminders ----------
async function sendReminders(supa: any, siteUrl: string, dry: boolean) {
  const today = todayIso();
  const d1 = addDays(today, 1);
  const d2 = addDays(today, 2);
  const { data: rows } = await supa
    .from("subscription_deliveries")
    .select("id, subscription_id, scheduled_for, last_reminder_offset")
    .eq("status", "scheduled")
    .in("scheduled_for", [d1, d2]);

  let sent = 0;
  for (const del of rows || []) {
    const offset = del.scheduled_for === d1 ? 1 : 2;
    // Skip if we already reminded at this offset or closer (e.g. D-1 already sent).
    if (del.last_reminder_offset != null && Number(del.last_reminder_offset) <= offset) continue;

    const { data: sub } = await supa
      .from("subscriptions").select("owner_phone, name, box_size, fulfilment, ship_snapshot, status")
      .eq("id", del.subscription_id).maybeSingle();
    if (!sub || sub.status !== "active" || !sub.owner_phone) continue;

    if (!dry) {
      const where = sub.fulfilment === "pickup"
        ? `pickup at ${sub.ship_snapshot?.pickup_point || "your chosen point"}`
        : `delivery to ${sub.ship_snapshot?.address || "your saved address"}`;
      await sendWhatsApp({
        to: sub.owner_phone,
        message:
          `🍪 Hi${sub.name ? " " + sub.name : ""}! Your next Cookie Doh box (box of ${sub.box_size}) is coming up in ${offset} day${offset === 1 ? "" : "s"} — ${where}.\n` +
          `Still in town and details unchanged? You don't need to do anything.\n` +
          `Need to skip, reschedule or change the address? ${siteUrl}/account/subscription`,
      });
      await supa.from("subscription_deliveries").update({ last_reminder_offset: offset }).eq("id", del.id);
    }
    sent++;
  }
  return { sent, candidates: (rows || []).length };
}

// ---------- 3) sweep stale pending plans ----------
async function sweepPending(supa: any, dry: boolean) {
  const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  if (dry) {
    const { count } = await supa.from("subscription_plans").select("id", { count: "exact", head: true })
      .eq("payment_status", "PENDING").lt("created_at", cutoff);
    return { failed: count || 0 };
  }
  const { data } = await supa.from("subscription_plans").update({ payment_status: "FAILED" })
    .eq("payment_status", "PENDING").lt("created_at", cutoff).select("id");
  return { failed: (data || []).length };
}

export async function runSubscriptionCron(supa: any, opts: { siteUrl: string; dry: boolean }) {
  const materialized = await materializeDue(supa, opts.siteUrl, opts.dry);
  const reminders = await sendReminders(supa, opts.siteUrl, opts.dry);
  const swept = await sweepPending(supa, opts.dry);
  return { materialized, reminders, swept };
}
