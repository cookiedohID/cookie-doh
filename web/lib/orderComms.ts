// web/lib/orderComms.ts — order-related WhatsApp messages.
//   • notifyCustomerOrderConfirmed  — auto-reply to the customer when paid
//   • notifyCustomerOnTheWay        — "your order is on its way" + track link
//   • remindUnacceptedOrders        — hourly nudge to the OWNER until they accept
import { sendWhatsApp } from "@/lib/whatsapp";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";

function idr(n: any) { return "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID"); }

function itemLines(order: any): string {
  const items = Array.isArray(order?.items_json) ? order.items_json : [];
  const lines = items
    .filter((it: any) => Number(it?.quantity) > 0)
    .map((it: any) => `• ${it?.name || "Item"} ×${it?.quantity}${it?.free ? " (free)" : ""}`);
  if (lines.length) return lines.join("\n");
  return String(order?.meta?.boxes_text || "").trim();
}

// Auto-reply to the customer confirming their order details (sent on payment).
export async function notifyCustomerOrderConfirmed(order: any): Promise<void> {
  const to = order?.customer_phone;
  if (!to) return;
  const ref = order?.order_no ? ` #${order.order_no}` : "";
  const lines = [
    `Hi${order?.customer_name ? " " + order.customer_name : ""}! 🍪 We've received your Cookie Doh order${ref}.`,
    "",
    itemLines(order),
    "",
    `Total: ${idr(order?.total_idr)}`,
    order?.fulfilment_status ? `Type: ${order.fulfilment_status}` : "",
    "",
    "We'll let you know the moment it's on the way. Thank you for ordering with us! 💛",
  ].filter(Boolean);
  try { await sendWhatsApp({ to, message: lines.join("\n") }); }
  catch (e) { console.error("[orderComms] confirm send failed:", e); }
}

// "On its way" + tracking link — triggered by the owner from the order page.
// The BUYER always gets it. If the order is "delivered to someone else" (the
// recipient is a DIFFERENT number than the buyer), the RECIPIENT gets a
// surprise-framed copy too — so a self-delivery isn't messaged twice.
export async function notifyCustomerOnTheWay(order: any): Promise<{ ok: boolean; error?: string }> {
  const buyerPhone = order?.customer_phone || "";
  const recipientPhone = order?.recipient_phone || "";
  const ref = order?.order_no ? ` #${order.order_no}` : "";
  const track = order?.tracking_url || order?.meta?.tracking_url || "";
  const trackLine = track ? `📍 Track it here: ${track}` : "";

  // Recipient is "someone else" only if their number differs from the buyer's.
  const recipDifferent =
    !!recipientPhone && (!buyerPhone || canonicalPhone(recipientPhone) !== canonicalPhone(buyerPhone));

  if (!buyerPhone && !recipientPhone) return { ok: false, error: "This order has no phone number to send to." };

  let sentAny = false;
  let lastErr: string | undefined;

  // 1) The buyer — always (the person who paid).
  if (buyerPhone) {
    const dest = recipDifferent ? (order?.recipient_name ? ` to ${order.recipient_name}` : " to your recipient") : " to you";
    const msg = [
      `🎉 Yay${order?.customer_name ? ", " + order.customer_name : ""}! Your Cookie Doh order${ref} is freshly baked and on its way${dest} 🍪🚚`,
      "",
      trackLine,
      "",
      "Thank you for ordering with us — where the cookie magic happens 💛✨",
    ].filter(Boolean);
    const r = await sendWhatsApp({ to: buyerPhone, message: msg.join("\n") });
    sentAny = sentAny || !!r.ok;
    if (!r.ok) lastErr = "WhatsApp send failed (check Fonnte settings).";
  }

  // 2) The recipient — only when they're a different person than the buyer.
  if (recipDifferent) {
    const who = order?.recipient_name ? ", " + order.recipient_name : "";
    const sender = order?.customer_name || "Someone";
    const msg = [
      `🎁 Surprise${who}! ${sender} is sending you something special from Cookie Doh${ref}, and it's on its way 🍪🚚`,
      "",
      "Keep an eye out — it's almost at your door 🥰",
      trackLine,
      "",
      "Enjoy every bite — where the cookie magic happens ✨💛",
    ].filter(Boolean);
    const r = await sendWhatsApp({ to: recipientPhone, message: msg.join("\n") });
    sentAny = sentAny || !!r.ok;
    if (!r.ok) lastErr = "WhatsApp send failed (check Fonnte settings).";
  }

  return { ok: sentAny, error: sentAny ? undefined : (lastErr || "WhatsApp send failed.") };
}

// Opt-in: when a buyer chose to invite the recipient, WhatsApp the recipient the
// buyer's referral link — so both get a free cookie when the recipient orders. Sent
// on payment. Skipped if the recipient is already a customer (the referral only
// rewards a NEW customer's first order) or the buyer has no referral code.
export async function inviteRecipientReferral(supa: any, order: any, siteUrl: string): Promise<void> {
  try {
    if (!order?.meta?.invite_recipient) return;
    const to = canonicalPhone(order?.recipient_phone);
    if (!to) return;

    // Skip existing customers (loose ilike prefilter + exact significant match).
    const sig = phoneSignificant(to);
    if (sig) {
      const { data: existing } = await supa.from("customers").select("phone").ilike("phone", `%${sig}%`).limit(20);
      if ((existing || []).some((c: any) => phoneSignificant(c?.phone) === sig)) return;
    }

    // The buyer's referral code = their member_code.
    const buyerPhone = canonicalPhone(order?.customer_phone);
    if (!buyerPhone) return;
    const { data: buyer } = await supa.from("customers").select("member_code, name").eq("phone", buyerPhone).maybeSingle();
    const code = buyer?.member_code;
    if (!code) return; // buyer isn't a member / has no referral code

    const link = `${siteUrl}/?ref=${code}`;
    const sender = order?.customer_name || buyer?.name || "A friend";
    const who = order?.recipient_name ? " " + order.recipient_name : "";
    await sendWhatsApp({
      to,
      message:
        `Hi${who}! ${sender} just sent you Cookie Doh cookies 🍪\n` +
        `Want your own? Order your first box of 6 with their link and you BOTH get a free cookie 💛\n${link}`,
    });
  } catch (e) {
    console.error("[orderComms] recipient invite failed:", e);
  }
}

// Hourly: ONE consolidated reminder to the owner listing PAID orders that still
// aren't accepted (created within the last 24h, so it stops nagging eventually).
// Cafe + subscription orders are auto-fulfilled and never need acceptance.
export async function remindUnacceptedOrders(
  supa: any,
  siteUrl: string,
  dry: boolean
): Promise<{ pending: number; sent: boolean }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: orders } = await supa
    .from("orders")
    .select("id, order_no, customer_name, customer_phone, total_idr, created_at, fulfilment_status, meta, checkout_mode")
    .eq("payment_status", "PAID")
    .is("accepted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(100);

  const pending = (orders || []).filter(
    (o: any) => o?.checkout_mode !== "subscription" && o?.meta?.channel !== "cafe" && o?.meta?.channel !== "subscription"
  );

  if (!pending.length || dry) return { pending: pending.length, sent: false };

  const lines = ["⏰ Orders awaiting your acceptance:", ""];
  for (const o of pending.slice(0, 20)) {
    const ageH = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 3600000));
    lines.push(`• #${o.order_no || o.id} — ${o.customer_name || o.customer_phone || "customer"} — ${idr(o.total_idr)} — ${ageH}h ago`);
  }
  if (pending.length > 20) lines.push(`…and ${pending.length - 20} more`);
  lines.push("", `Review & accept: ${siteUrl}/admin/orders`);

  const res = await sendWhatsApp({ message: lines.join("\n") }); // owner (ADMIN_NOTIFY_WHATSAPP)
  return { pending: pending.length, sent: !!res.ok };
}
