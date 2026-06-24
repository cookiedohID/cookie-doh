// web/lib/subscriptionManage.ts — subscription state transitions (server-side).
//
// Capacity rule: a box consumes capacity only when MADE (boxes_used++ at
// materialize, phase 4). So skipping/pausing/cancelling NEVER loses prepaid boxes
// — remaining = sum(boxes_total - boxes_used) over PAID plans. Refund on cancel is
// that remaining × the box price.
import {
  nextDeliveryDate, subBoxPrice, subDeliveryFeePerBox, todayIso, addDays, FIRST_BOX_LEAD_DAYS,
  normalizeFixedFlavours, fixedFlavoursValid, isValidFrequency, isValidMode,
  type SubFrequency,
} from "@/lib/subscriptions";

// Boxes still owed to the customer across all PAID plans.
export async function remainingCapacity(supabase: any, subscriptionId: string): Promise<number> {
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("boxes_total, boxes_used")
    .eq("subscription_id", subscriptionId)
    .eq("payment_status", "PAID");
  return (plans || []).reduce(
    (s: number, p: any) => s + Math.max(0, Number(p.boxes_total) - Number(p.boxes_used)),
    0
  );
}

async function maxSeq(supabase: any, subscriptionId: string): Promise<number> {
  const { data } = await supabase
    .from("subscription_deliveries")
    .select("seq").eq("subscription_id", subscriptionId)
    .order("seq", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.seq) || 0;
}

// The next funding plan with capacity left (oldest first).
async function fundingPlanId(supabase: any, subscriptionId: string): Promise<string | null> {
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, boxes_total, boxes_used, created_at")
    .eq("subscription_id", subscriptionId)
    .eq("payment_status", "PAID")
    .order("created_at", { ascending: true });
  const p = (data || []).find((r: any) => Number(r.boxes_used) < Number(r.boxes_total));
  return p?.id || null;
}

// Mark every still-scheduled box as skipped (used by pause/cancel). Capacity is
// preserved because skipped boxes are never made.
async function cancelScheduled(supabase: any, subscriptionId: string) {
  await supabase
    .from("subscription_deliveries")
    .update({ status: "skipped" })
    .eq("subscription_id", subscriptionId)
    .eq("status", "scheduled");
}

// Schedule the next box at `date` if capacity remains. Returns the date used, or null.
async function scheduleNext(supabase: any, sub: any, date: string): Promise<string | null> {
  const cap = await remainingCapacity(supabase, sub.id);
  if (cap <= 0) return null;
  const seq = (await maxSeq(supabase, sub.id)) + 1;
  const plan_id = await fundingPlanId(supabase, sub.id);
  await supabase.from("subscription_deliveries").upsert(
    { subscription_id: sub.id, plan_id, seq, scheduled_for: date, status: "scheduled" },
    { onConflict: "subscription_id,seq", ignoreDuplicates: true }
  );
  return date;
}

type Result = { ok: boolean; error?: string; status?: number; sub?: any };

// ---- skip next box ----
export async function skipNext(supabase: any, sub: any): Promise<Result> {
  if (sub.status !== "active") return { ok: false, error: "Subscription isn’t active.", status: 400 };
  const { data: nextDel } = await supabase
    .from("subscription_deliveries")
    .select("*").eq("subscription_id", sub.id).eq("status", "scheduled")
    .order("scheduled_for", { ascending: true }).limit(1).maybeSingle();
  if (!nextDel) return { ok: false, error: "No upcoming box to skip.", status: 400 };

  await supabase.from("subscription_deliveries").update({ status: "skipped" }).eq("id", nextDel.id);
  const newDate = nextDeliveryDate(nextDel.scheduled_for, sub.frequency as SubFrequency, sub.anchor_dom);
  const used = await scheduleNext(supabase, sub, newDate);
  await supabase.from("subscriptions")
    .update({ next_delivery_on: used, updated_at: new Date().toISOString() }).eq("id", sub.id);
  return { ok: true };
}

// ---- pause ----
export async function pause(supabase: any, sub: any): Promise<Result> {
  if (sub.status !== "active") return { ok: false, error: "Only an active subscription can be paused.", status: 400 };
  await cancelScheduled(supabase, sub.id);
  await supabase.from("subscriptions")
    .update({ status: "paused", next_delivery_on: null, skip_next: false, updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  return { ok: true };
}

// ---- resume ----
export async function resume(supabase: any, sub: any): Promise<Result> {
  if (sub.status !== "paused") return { ok: false, error: "Subscription isn’t paused.", status: 400 };
  const cap = await remainingCapacity(supabase, sub.id);
  if (cap <= 0) return { ok: false, error: "No prepaid boxes left — renew to continue.", status: 400 };
  const date = addDays(todayIso(), FIRST_BOX_LEAD_DAYS);
  await scheduleNext(supabase, sub, date);
  await supabase.from("subscriptions")
    .update({ status: "active", next_delivery_on: date, updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  return { ok: true };
}

// ---- cancel (with refund of unused capacity) ----
export async function cancel(supabase: any, sub: any): Promise<Result> {
  if (sub.status === "cancelled") return { ok: false, error: "Already cancelled.", status: 400 };
  const cap = await remainingCapacity(supabase, sub.id);
  // Refund the unused boxes at what they actually prepaid: cookies + (delivery fee
  // for delivery subscriptions). Pickup subs prepaid no delivery.
  const perBox = subBoxPrice(sub.box_size) + (sub.fulfilment === "delivery" ? subDeliveryFeePerBox(sub.box_size) : 0);
  const refund = cap * perBox;
  await cancelScheduled(supabase, sub.id);
  await supabase.from("subscriptions")
    .update({
      status: "cancelled",
      next_delivery_on: null,
      refund_idr: refund > 0 ? refund : null,
      refund_status: refund > 0 ? "pending" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);
  return { ok: true };
}

// ---- edit config (mode / favourites / frequency / address / notes) ----
// box_size is intentionally NOT editable — it sets the prepaid value of every
// remaining box, so changing it would desync paid capacity. Renew at a new size.
export async function editConfig(supabase: any, sub: any, body: any): Promise<Result> {
  const update: any = { updated_at: new Date().toISOString() };

  let mode = sub.mode;
  if (body?.mode !== undefined) {
    if (!isValidMode(body.mode)) return { ok: false, error: "Invalid contents mode.", status: 400 };
    mode = body.mode;
    update.mode = mode;
  }

  if (mode === "fixed" || body?.fixed_flavours !== undefined) {
    if (mode === "fixed") {
      const flavours = normalizeFixedFlavours(body?.fixed_flavours ?? sub.fixed_flavours);
      if (!fixedFlavoursValid(flavours, sub.box_size)) {
        return { ok: false, error: `Pick exactly ${sub.box_size} cookies.`, status: 400 };
      }
      update.fixed_flavours = flavours;
    } else {
      update.fixed_flavours = [];
    }
  }

  if (body?.frequency !== undefined) {
    if (!isValidFrequency(body.frequency)) return { ok: false, error: "Invalid frequency.", status: 400 };
    update.frequency = body.frequency;
    update.anchor_dom =
      body.frequency === "monthly" && Number(body?.anchor_dom) >= 1 && Number(body?.anchor_dom) <= 31
        ? Math.floor(Number(body.anchor_dom)) : null;
  }

  if (body?.ship_snapshot !== undefined && body.ship_snapshot && typeof body.ship_snapshot === "object") {
    // shallow-merge so partial address edits don't wipe the rest
    update.ship_snapshot = { ...(sub.ship_snapshot || {}), ...body.ship_snapshot };
  }
  if (body?.fulfilment === "delivery" || body?.fulfilment === "pickup") {
    update.fulfilment = body.fulfilment;
  }

  await supabase.from("subscriptions").update(update).eq("id", sub.id);
  return { ok: true };
}
