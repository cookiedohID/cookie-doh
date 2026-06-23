// web/lib/subscriptionPay.ts — settle a prepaid subscription-plan payment.
//
// Called from the Midtrans webhook for any order_id with the "CD-SUB-" prefix,
// BEFORE the normal orders lookup (a plan payment has no orders row). Keeps the
// webhook lean and concentrates the payment-security rules here:
//   • verify Midtrans gross_amount == the server-computed plan amount (no underpay)
//   • idempotent PAID claim (webhook retries are a no-op)
//   • activate the subscription + schedule the first box only on first PAID
//   • conflict-safe first-delivery insert (UNIQUE(subscription_id, seq))
import { addDays, nextDeliveryDate, todayIso, FIRST_BOX_LEAD_DAYS } from "@/lib/subscriptions";
import { sendWhatsApp } from "@/lib/whatsapp";

type SettleResult = {
  handled: boolean;
  paid?: boolean;
  activated?: boolean;
  already?: boolean;
  mismatch?: boolean;
  note?: string;
};

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id";
}

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta",
    });
  } catch {
    return iso;
  }
}

export async function settleSubscriptionPayment(
  supabase: any,
  midtransOrderId: string,
  statusResponse: any,
  paid: boolean
): Promise<SettleResult> {
  // Find the plan this payment belongs to.
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("midtrans_order_id", midtransOrderId)
    .maybeSingle();

  // CD-SUB- order id but no plan row — nothing we can do; ack so Midtrans stops retrying.
  if (!plan) return { handled: true, note: "no_plan" };

  // ---- Not paid (pending / failed / expired) ----
  if (!paid) {
    const txStatus = String(statusResponse?.transaction_status || "");
    const ps = txStatus === "pending" ? "PENDING" : "FAILED";
    await supabase
      .from("subscription_plans")
      .update({ payment_status: ps })
      .eq("id", plan.id)
      .neq("payment_status", "PAID"); // never downgrade a paid plan
    return { handled: true, paid: false };
  }

  // ---- PAID: verify the amount BEFORE granting any capacity ----
  const gross = Math.round(Number(statusResponse?.gross_amount || 0));
  if (gross !== Number(plan.amount_idr)) {
    console.error(`[sub] gross_amount mismatch for ${midtransOrderId}: paid ${gross} vs plan ${plan.amount_idr}`);
    // Do NOT activate. Flag it; leave the plan unpaid for manual review.
    await supabase
      .from("subscription_plans")
      .update({ payment_status: "FAILED" })
      .eq("id", plan.id)
      .neq("payment_status", "PAID");
    return { handled: true, paid: true, mismatch: true };
  }

  // ---- Idempotent claim: only the first webhook flips PENDING/UNPAID -> PAID ----
  const { data: claimed } = await supabase
    .from("subscription_plans")
    .update({ payment_status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", plan.id)
    .neq("payment_status", "PAID")
    .select("id")
    .maybeSingle();
  if (!claimed) return { handled: true, paid: true, already: true }; // a retry — already done

  // ---- Load the subscription this plan funds ----
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", plan.subscription_id)
    .maybeSingle();
  if (!sub) return { handled: true, paid: true, note: "no_subscription" };

  const today = todayIso();
  let firstDate: string | null = null;

  const isFreshStart = sub.status === "pending_payment" || sub.status === "completed" || sub.status === "cancelled";
  if (isFreshStart) {
    // (Re)activate and schedule the next box. Keep an already-set future date,
    // otherwise lead-time from today.
    firstDate =
      sub.next_delivery_on && sub.next_delivery_on > today
        ? sub.next_delivery_on
        : addDays(today, FIRST_BOX_LEAD_DAYS);

    // Next seq = (max existing seq) + 1 — survives renewals after completion.
    const { data: lastDel } = await supabase
      .from("subscription_deliveries")
      .select("seq")
      .eq("subscription_id", sub.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSeq = (Number(lastDel?.seq) || 0) + 1;

    // UNIQUE(subscription_id, seq) makes this idempotent under webhook retries.
    await supabase
      .from("subscription_deliveries")
      .upsert(
        {
          subscription_id: sub.id,
          plan_id: plan.id,
          seq: nextSeq,
          scheduled_for: firstDate,
          status: "scheduled",
        },
        { onConflict: "subscription_id,seq", ignoreDuplicates: true }
      );

    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        next_delivery_on: firstDate,
        skip_next: false,
        renewed_at: sub.status === "completed" || sub.status === "cancelled" ? new Date().toISOString() : sub.renewed_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  } else {
    // Already active — a renewal/top-up just added capacity. The scheduling cron
    // keeps creating boxes as long as paid capacity remains; nothing to schedule here.
    await supabase
      .from("subscriptions")
      .update({ renewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    firstDate = sub.next_delivery_on || null;
  }

  // ---- Confirm to the customer (never blocks the webhook) ----
  try {
    const when = firstDate ? ` Your next box arrives around ${fmtDate(firstDate)}.` : "";
    await sendWhatsApp({
      to: sub.owner_phone,
      message:
        `🍪 Your Cookie Doh subscription is active!\n` +
        `${plan.boxes_total} box${plan.boxes_total > 1 ? "es" : ""} prepaid — plus a FREE bonus cookie in every box 💛.${when}\n` +
        `Edit, skip or pause anytime: ${siteUrl()}/account/subscription`,
    });
  } catch (e) {
    console.error("[sub] activation WhatsApp failed:", e);
  }

  return { handled: true, paid: true, activated: isFreshStart };
}
